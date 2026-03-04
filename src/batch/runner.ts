/**
 * Batch experiment runner — config-driven, multi-condition, with checkpointing.
 *
 * Orchestrates: load config → scan codebases → run trials → score → report.
 * Designed for 100+ data points per run with automated scoring.
 */

import * as fs from "fs";
import * as path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { scanCodebase } from "../scanner/index.js";
import { analyzeGraph } from "../analyzer/index.js";
import { encodeToStrandFormat } from "../encoder/strand-format-encode.js";
import { encodeToText } from "../encoder/text-encode.js";
import { scoreResponse, aggregateScores } from "./scorer.js";
import { generateMarkdownReport } from "./reporter.js";
import type {
  BatchConfig,
  BatchResults,
  QuestionResult,
  ConditionResult,
  TrialResult,
  CheckpointKey,
} from "./types.js";
import type { StrandGraph } from "../scanner/index.js";
import type { GraphAnalysis } from "../analyzer/index.js";

// ─── Public API ─────────────────────────────────────────

export interface RunOptions {
  resume?: boolean | undefined;
  onProgress?: ((msg: string) => void) | undefined;
}

/**
 * Run a batch experiment from a config file.
 * Returns the completed results (also written to disk).
 */
export async function runBatch(
  configPath: string,
  options: RunOptions = {},
): Promise<BatchResults> {
  const { resume = false, onProgress = console.log } = options;
  const startTime = Date.now();

  // 1. Load and validate config
  const config = loadConfig(configPath);
  onProgress(`Loaded config: ${config.name} (${config.description})`);
  onProgress(
    `  ${config.codebases.length} codebase(s), ${config.conditions.length} conditions, ${config.questions.length} questions, ${config.trials} trials`,
  );

  const totalCalls =
    config.codebases.length *
    config.conditions.length *
    config.questions.length *
    config.trials;
  onProgress(
    `  Total API calls: ${totalCalls} trials + ${totalCalls} judge = ${totalCalls * 2}`,
  );

  // 2. Check for checkpoint
  const checkpointPath = getCheckpointPath(config);
  let results: QuestionResult[] = [];
  const completed = new Set<string>();

  if (resume && fs.existsSync(checkpointPath)) {
    const checkpoint = JSON.parse(
      fs.readFileSync(checkpointPath, "utf-8"),
    ) as BatchResults;
    results = checkpoint.results;
    for (const qr of results) {
      for (const cr of qr.conditions) {
        if (cr.trials.length >= config.trials) {
          completed.add(
            keyFor({
              questionId: qr.questionId,
              codebaseName: qr.codebaseName,
              conditionId: cr.conditionId,
            }),
          );
        }
      }
    }
    onProgress(
      `  Resuming: ${completed.size} condition-runs already completed`,
    );
  }

  // 3. Initialize Anthropic client
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is required");
  }
  const client = new Anthropic({ apiKey });

  // 4. Scan and encode codebases (once each)
  const encodings = new Map<string, Map<string, string>>();

  for (const codebase of config.codebases) {
    onProgress(`\nScanning ${codebase.name} (${codebase.path})...`);

    if (!fs.existsSync(codebase.path)) {
      throw new Error(`Codebase path not found: ${codebase.path}`);
    }

    const graph = scanCodebase(codebase.path);
    const analysis = analyzeGraph(graph, codebase.path);
    onProgress(
      `  ${graph.totalFiles} files, ${graph.totalLines.toLocaleString()} lines`,
    );

    const conditionEncodings = new Map<string, string>();
    for (const condition of config.conditions) {
      const encoding = buildEncoding(
        graph,
        analysis,
        condition.encoding,
        condition.includeUsageLine,
      );
      conditionEncodings.set(condition.id, encoding);
      if (encoding.length > 0) {
        onProgress(
          `  ${condition.name}: ${encoding.length.toLocaleString()} chars (~${Math.round(encoding.length / 4)} tokens)`,
        );
      } else {
        onProgress(`  ${condition.name}: no encoding (baseline)`);
      }
    }
    encodings.set(codebase.name, conditionEncodings);
  }

  // 5. Run trials
  let callCount = 0;

  for (const codebase of config.codebases) {
    const conditionEncodings = encodings.get(codebase.name)!;

    for (const question of config.questions) {
      // Find or create QuestionResult for this (question × codebase)
      let qr = results.find(
        (r) => r.questionId === question.id && r.codebaseName === codebase.name,
      );
      if (!qr) {
        qr = {
          questionId: question.id,
          question: question.question,
          taskType: question.taskType,
          codebaseName: codebase.name,
          conditions: [],
        };
        results.push(qr);
      }

      for (const condition of config.conditions) {
        const ck: CheckpointKey = {
          questionId: question.id,
          codebaseName: codebase.name,
          conditionId: condition.id,
        };

        if (completed.has(keyFor(ck))) {
          onProgress(
            `  [skip] ${question.id} × ${condition.name} (already done)`,
          );
          continue;
        }

        // Find or create ConditionResult
        let cr = qr.conditions.find((c) => c.conditionId === condition.id);
        if (!cr) {
          cr = {
            conditionId: condition.id,
            conditionName: condition.name,
            trials: [],
            aggregateScore: 0,
          };
          qr.conditions.push(cr);
        }

        const encoding = conditionEncodings.get(condition.id) ?? "";

        for (let t = cr.trials.length; t < config.trials; t++) {
          callCount++;
          onProgress(
            `  [${callCount}/${totalCalls}] ${question.id} × ${condition.name} trial ${t + 1}`,
          );

          const trial = await runTrial(
            client,
            condition.model,
            encoding,
            question.question,
            config.maxTokens,
          );
          trial.trial = t + 1;
          cr.trials.push(trial);

          // Rate limit
          if (config.delayMs > 0) {
            await sleep(config.delayMs);
          }
        }
      }

      // Checkpoint after each question completes across all conditions
      saveCheckpoint(config, results, startTime);
    }
  }

  // 6. Score all responses
  onProgress("\nScoring responses...");
  let scoreCount = 0;
  const totalToScore = results.reduce(
    (sum, qr) =>
      sum +
      qr.conditions.reduce(
        (s, cr) => s + cr.trials.filter((t) => !t.scores).length,
        0,
      ),
    0,
  );

  for (const qr of results) {
    const question = config.questions.find((q) => q.id === qr.questionId);
    if (!question) continue;

    for (const cr of qr.conditions) {
      for (const trial of cr.trials) {
        if (trial.scores) continue; // already scored (from checkpoint)

        scoreCount++;
        onProgress(
          `  [${scoreCount}/${totalToScore}] Scoring ${qr.questionId} × ${cr.conditionName} trial ${trial.trial}`,
        );

        trial.scores = await scoreResponse(
          client,
          config.judgeModel,
          question.question,
          trial.response,
          question.assertions,
        );

        if (config.delayMs > 0) {
          await sleep(config.delayMs);
        }
      }

      // Compute aggregate score for this condition
      const allScores = cr.trials.flatMap((t) => t.scores ?? []);
      cr.aggregateScore = aggregateScores(allScores);
    }
  }

  // 7. Build final results
  const endTime = Date.now();
  const batchResults: BatchResults = {
    config: {
      name: config.name,
      timestamp: new Date().toISOString(),
      codebases: config.codebases.map((c) => c.name),
    },
    results,
    summary: computeSummary(results, endTime - startTime),
  };

  // 8. Write outputs
  const outputDir = path.resolve(
    path.dirname(configPath),
    "..",
    config.outputDir,
  );
  fs.mkdirSync(outputDir, { recursive: true });

  const jsonPath = path.join(outputDir, `${config.name}-results.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(batchResults, null, 2), "utf-8");
  onProgress(`\nWrote ${jsonPath}`);

  const mdPath = path.join(outputDir, `${config.name}-summary.md`);
  const markdown = generateMarkdownReport(batchResults);
  fs.writeFileSync(mdPath, markdown, "utf-8");
  onProgress(`Wrote ${mdPath}`);

  // Clean up checkpoint
  if (fs.existsSync(checkpointPath)) {
    fs.unlinkSync(checkpointPath);
  }

  onProgress(
    `\nDone: ${batchResults.summary.totalApiCalls} API calls, ~$${batchResults.summary.totalCostEstimate.toFixed(2)} estimated cost`,
  );

  return batchResults;
}

// ─── Config loading ─────────────────────────────────────

function loadConfig(configPath: string): BatchConfig {
  const resolved = path.resolve(configPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Config file not found: ${resolved}`);
  }

  const raw = JSON.parse(fs.readFileSync(resolved, "utf-8")) as BatchConfig;

  // Validate required fields
  if (!raw.name) throw new Error("Config missing 'name'");
  if (!raw.codebases?.length) throw new Error("Config missing 'codebases'");
  if (!raw.conditions?.length) throw new Error("Config missing 'conditions'");
  if (!raw.questions?.length) throw new Error("Config missing 'questions'");

  // Apply defaults
  return {
    ...raw,
    trials: raw.trials ?? 3,
    maxTokens: raw.maxTokens ?? 1024,
    delayMs: raw.delayMs ?? 600,
    judgeModel: raw.judgeModel ?? "claude-haiku-4-5-20251001",
    outputDir: raw.outputDir ?? "experiments/output",
  };
}

// ─── Encoding ───────────────────────────────────────────

function buildEncoding(
  graph: StrandGraph,
  analysis: GraphAnalysis,
  encoding: "strand-v3" | "strand-v2" | "text" | "text-bare" | "none",
  includeUsageLine?: boolean,
): string {
  switch (encoding) {
    case "strand-v3": {
      let enc = encodeToStrandFormat(graph, analysis);
      if (includeUsageLine === false) {
        // Strip just the USAGE line
        enc = enc.replace(/^USAGE:.*\n/m, "");
      }
      return enc;
    }
    case "strand-v2": {
      // v2: no USAGE line, no CHURN section, no CONVENTIONS section
      let enc = encodeToStrandFormat(graph, analysis);
      enc = enc.replace(/^USAGE:.*\n/m, "");
      enc = enc.replace(/─── CHURN[\s\S]*?(?=\n─── )/m, "");
      enc = enc.replace(/─── CONVENTIONS[\s\S]*?(?=\n─── )/m, "");
      return enc;
    }
    case "text":
      return encodeToText(graph, analysis);
    case "text-bare":
      return encodeToText(graph, analysis, { bare: true });
    case "none":
      return "";
  }
}

// ─── Trial execution ────────────────────────────────────

async function runTrial(
  client: Anthropic,
  model: string,
  encoding: string,
  question: string,
  maxTokens: number,
): Promise<TrialResult> {
  const prompt = buildPrompt(encoding, question);
  const start = Date.now();

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });

  const latencyMs = Date.now() - start;
  const text =
    response.content[0]?.type === "text" ? response.content[0].text : "";

  return {
    trial: 0, // Will be set by caller
    response: text,
    tokens: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
    },
    latencyMs,
  };
}

function buildPrompt(encoding: string, question: string): string {
  if (encoding.length === 0) {
    return question;
  }
  return `Here is an encoding of a codebase:\n\n${encoding}\n\nBased on this encoding, answer the following question:\n\n${question}`;
}

// ─── Checkpointing ──────────────────────────────────────

function getCheckpointPath(config: BatchConfig): string {
  return path.resolve(
    "experiments",
    "output",
    `${config.name}.checkpoint.json`,
  );
}

function saveCheckpoint(
  config: BatchConfig,
  results: QuestionResult[],
  startTime: number,
): void {
  const outputDir = path.resolve("experiments", "output");
  fs.mkdirSync(outputDir, { recursive: true });

  const checkpoint: BatchResults = {
    config: {
      name: config.name,
      timestamp: new Date().toISOString(),
      codebases: config.codebases.map((c) => c.name),
    },
    results,
    summary: computeSummary(results, Date.now() - startTime),
  };

  const cpPath = getCheckpointPath(config);
  fs.writeFileSync(cpPath, JSON.stringify(checkpoint, null, 2), "utf-8");
}

function keyFor(ck: CheckpointKey): string {
  return `${ck.questionId}:${ck.codebaseName}:${ck.conditionId}`;
}

// ─── Helpers ────────────────────────────────────────────

function computeSummary(
  results: QuestionResult[],
  durationMs: number,
): BatchResults["summary"] {
  let totalCalls = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  for (const qr of results) {
    for (const cr of qr.conditions) {
      for (const t of cr.trials) {
        totalCalls++;
        inputTokens += t.tokens.input;
        outputTokens += t.tokens.output;
      }
    }
  }

  // Rough cost estimate (Sonnet 4 rates: $3/M in, $15/M out)
  const costEstimate =
    (inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15;

  return {
    totalApiCalls: totalCalls,
    totalTokens: { input: inputTokens, output: outputTokens },
    totalCostEstimate: costEstimate,
    durationMs,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
