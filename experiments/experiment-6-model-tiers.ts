/**
 * Experiment 6: Model Tiers
 *
 * Tests whether Haiku 4.5 + .strand v2+Risk can match or beat Sonnet 4.6 + text-only.
 *
 * 3 conditions:
 *   1. sonnet-text    — Sonnet 4.6  + Text Only   (control)
 *   2. haiku-v2risk   — Haiku 4.5   + v2+Risk     (hypothesis)
 *   3. sonnet-v2risk  — Sonnet 4.6  + v2+Risk     (reference ceiling)
 *
 * Usage: ANTHROPIC_API_KEY=sk-... npx tsx experiments/experiment-6-model-tiers.ts [path]
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";
import { scanCodebase } from "../src/scanner/index.js";
import { analyzeGraph } from "../src/analyzer/index.js";
import { encodeToText } from "../src/encoder/text-encode.js";
import { encodeToStrandFormat } from "../src/encoder/strand-format-encode.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TARGET_CODEBASE = process.argv[2] || "C:\\dev\\infisical\\frontend";
const TRIALS = 3;

const QUESTIONS = [
  {
    id: "q1",
    question: "What are the main feature domains in this project? How many files are in each?",
    type: "inventory",
  },
  {
    id: "q2",
    question: "What is the most complex part of this project? What makes it complex?",
    type: "analysis",
  },
  {
    id: "q3",
    question:
      "If I need to change the role-based permissions system (RBAC), which files are highest risk to modify? What's the blast radius?",
    type: "navigation",
  },
  {
    id: "q4",
    question: "How is state management organized in this project? What patterns does it use?",
    type: "architecture",
  },
  {
    id: "q5",
    question: "Which files would cause the most breakage if changed? Why?",
    type: "dependency",
  },
];

type ConditionId = "sonnet-text" | "haiku-v2risk" | "sonnet-v2risk";

interface Condition {
  id: ConditionId;
  name: string;
  model: string;
  encodingLabel: string;
}

const CONDITIONS: Condition[] = [
  {
    id: "sonnet-text",
    name: "Sonnet 4.6 + Text",
    model: "claude-sonnet-4-6",
    encodingLabel: "structured text",
  },
  {
    id: "haiku-v2risk",
    name: "Haiku 4.5 + v2+Risk",
    model: "claude-haiku-4-5-20251001",
    encodingLabel: ".strand v2 with risk analysis",
  },
  {
    id: "sonnet-v2risk",
    name: "Sonnet 4.6 + v2+Risk",
    model: "claude-sonnet-4-6",
    encodingLabel: ".strand v2 with risk analysis",
  },
];

interface TrialResult {
  trial: number;
  response: string;
  tokens: { input: number; output: number };
}

interface ConditionResult {
  conditionId: ConditionId;
  conditionName: string;
  trials: TrialResult[];
}

interface QuestionResult {
  questionId: string;
  question: string;
  type: string;
  conditions: ConditionResult[];
}

function buildPrompt(formatName: string, content: string, question: string): string {
  return `You are reading a ${formatName} encoding of a software project's architecture. It contains multiple sections describing different aspects of the project.

${content}

Based on this encoding, answer this question:
${question}

Be specific. Reference the data from the encoding.`;
}

async function runExperiment() {
  console.log("=== EXPERIMENT 6: Model Tiers — Haiku vs Sonnet ===\n");
  console.log(`Target codebase: ${TARGET_CODEBASE}`);
  console.log(`Trials per condition-question: ${TRIALS}\n`);

  // Step 1: Scan once
  console.log("Scanning codebase...");
  const graph = scanCodebase(TARGET_CODEBASE);
  console.log(
    `Found ${graph.totalFiles} files, ${graph.nodes.length} nodes, ${graph.edges.length} edges, ${graph.modules.length} modules\n`,
  );

  // Step 2: Run analysis
  console.log("Running blast radius analysis...");
  const analysis = analyzeGraph(graph);
  console.log(`Found ${analysis.risk.length} nodes with blast radius > 1\n`);

  // Step 3: Generate encodings
  const outputDir = path.join(__dirname, "output");
  fs.mkdirSync(outputDir, { recursive: true });

  console.log("Generating encodings...");
  const textContent = encodeToText(graph);
  console.log(`  Text Only:   ${textContent.length} chars (~${Math.ceil(textContent.length / 4)} tokens)`);

  const v2RiskContent = encodeToStrandFormat(graph, analysis);
  fs.writeFileSync(path.join(outputDir, "exp6-strand-v2-risk.strand"), v2RiskContent);
  console.log(`  v2+Risk:     ${v2RiskContent.length} chars (~${Math.ceil(v2RiskContent.length / 4)} tokens)`);

  // Map condition ID to content
  const encodingContent: Record<ConditionId, { label: string; content: string }> = {
    "sonnet-text":   { label: "structured text",               content: textContent },
    "haiku-v2risk":  { label: ".strand v2 with risk analysis", content: v2RiskContent },
    "sonnet-v2risk": { label: ".strand v2 with risk analysis", content: v2RiskContent },
  };

  // Step 4: LLM calls
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log("\nANTHROPIC_API_KEY not set — encodings saved. Skipping LLM comparison.\n");
    return;
  }

  const client = new Anthropic({ apiKey });
  const results: QuestionResult[] = [];

  for (const q of QUESTIONS) {
    console.log(`\n--- Question ${q.id}: ${q.type} ---`);
    console.log(`"${q.question}"\n`);

    const conditionResults: ConditionResult[] = [];

    for (const condition of CONDITIONS) {
      console.log(`  [${condition.id}] ${condition.name}...`);

      const { label, content } = encodingContent[condition.id];
      const prompt = buildPrompt(label, content, q.question);
      const trials: TrialResult[] = [];

      for (let t = 0; t < TRIALS; t++) {
        const response = await client.messages.create({
          model: condition.model,
          max_tokens: 1024,
          messages: [{ role: "user", content: prompt }],
        });

        const text =
          response.content[0]?.type === "text" ? response.content[0].text : "";
        trials.push({
          trial: t + 1,
          response: text,
          tokens: {
            input: response.usage.input_tokens,
            output: response.usage.output_tokens,
          },
        });

        console.log(
          `    trial ${t + 1}: ${response.usage.input_tokens}in/${response.usage.output_tokens}out`,
        );
      }

      conditionResults.push({
        conditionId: condition.id,
        conditionName: condition.name,
        trials,
      });
    }

    results.push({
      questionId: q.id,
      question: q.question,
      type: q.type,
      conditions: conditionResults,
    });
  }

  // Step 5: Save and print
  const resultsPath = path.join(outputDir, "experiment-6-results.json");
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to ${resultsPath}`);

  printComparison(results);
  printScoring(results);
}

function printComparison(results: QuestionResult[]): void {
  console.log("\n\n========================================");
  console.log("EXPERIMENT 6 RESULTS: Model Tiers");
  console.log("========================================\n");

  // Per-question token totals
  const perQuestionTotals = new Map<
    string,
    Map<ConditionId, { input: number; output: number }>
  >();

  for (const r of results) {
    const qMap = new Map<ConditionId, { input: number; output: number }>();
    for (const cond of CONDITIONS) {
      qMap.set(cond.id, { input: 0, output: 0 });
    }
    perQuestionTotals.set(r.questionId, qMap);
  }

  // Overall totals
  const totals = new Map<ConditionId, { input: number; output: number }>();
  for (const cond of CONDITIONS) {
    totals.set(cond.id, { input: 0, output: 0 });
  }

  for (const r of results) {
    console.log(`\n--- ${r.questionId} [${r.type}]: ${r.question} ---\n`);
    const qMap = perQuestionTotals.get(r.questionId)!;

    for (const cr of r.conditions) {
      console.log(`  [${cr.conditionId}] ${cr.conditionName}:`);
      const firstResponse = cr.trials[0]?.response || "";
      console.log(
        `    ${firstResponse.slice(0, 200).replace(/\n/g, "\n    ")}${firstResponse.length > 200 ? "..." : ""}`,
      );

      let qIn = 0, qOut = 0;
      for (const trial of cr.trials) {
        const t = totals.get(cr.conditionId as ConditionId)!;
        t.input += trial.tokens.input;
        t.output += trial.tokens.output;
        qIn += trial.tokens.input;
        qOut += trial.tokens.output;
      }
      qMap.set(cr.conditionId as ConditionId, { input: qIn, output: qOut });

      const trialTokens = cr.trials.map((t) => `${t.tokens.input + t.tokens.output}`).join(", ");
      console.log(`    Tokens per trial: [${trialTokens}]\n`);
    }
  }

  // Per-question cost table
  console.log("\n========================================");
  console.log("PER-QUESTION TOKEN COSTS (3 trials each)");
  console.log("========================================\n");

  const header = "Question".padEnd(12) +
    CONDITIONS.map((c) => c.name.padEnd(26)).join("");
  console.log(header);
  console.log("-".repeat(12 + 26 * CONDITIONS.length));

  for (const r of results) {
    const qMap = perQuestionTotals.get(r.questionId)!;
    let row = `${r.questionId} [${r.type}]`.padEnd(12);
    for (const cond of CONDITIONS) {
      const t = qMap.get(cond.id)!;
      const total = t.input + t.output;
      row += total.toLocaleString().padEnd(26);
    }
    console.log(row);
  }

  // Overall cost summary
  console.log("\n========================================");
  console.log(`TOTAL TOKEN COST (5 questions × ${TRIALS} trials)`);
  console.log("========================================\n");

  const sonnetTextTotal = totals.get("sonnet-text")!;
  const sonnetTextTokens = sonnetTextTotal.input + sonnetTextTotal.output;

  for (const cond of CONDITIONS) {
    const t = totals.get(cond.id)!;
    const total = t.input + t.output;
    const vsControl = ((total / sonnetTextTokens) * 100 - 100).toFixed(1);
    const sign = total >= sonnetTextTokens ? "+" : "";
    console.log(
      `  ${cond.name.padEnd(28)} ${t.input.toLocaleString().padStart(8)}in + ${t.output.toLocaleString().padStart(6)}out = ${total.toLocaleString().padStart(8)} total  (${sign}${vsControl}% vs control)`,
    );
  }
}

function printScoring(results: QuestionResult[]): void {
  console.log("\n\n========================================");
  console.log("SCORING RUBRICS");
  console.log("========================================\n");

  // Q1
  const q1 = results.find((r) => r.questionId === "q1");
  if (q1) {
    console.log("--- Q1: Feature Domain Inventory ---");
    console.log("Ground truth: secrets, pki/cert, kms, ssh, pam, scanning, ai/mcp, org/admin\n");

    const domainKeywords = [
      { name: "secrets",  pattern: /secret.?manag|secret.?dashboard/i },
      { name: "pki/cert", pattern: /pki|certificate|cert.?manag/i },
      { name: "kms",      pattern: /kms|key.?manag/i },
      { name: "ssh",      pattern: /ssh/i },
      { name: "pam",      pattern: /pam|privileged.?access/i },
      { name: "scanning", pattern: /secret.?scan|scanning/i },
      { name: "ai/mcp",   pattern: /\bai\b|mcp/i },
      { name: "org/admin",pattern: /organiz|admin|billing|settings/i },
    ];

    for (const cr of q1.conditions) {
      console.log(`  [${cr.conditionId}]`);
      for (const trial of cr.trials) {
        const resp = trial.response.toLowerCase();
        const found = domainKeywords.filter((d) => d.pattern.test(resp));
        console.log(
          `    trial ${trial.trial}: ${found.length}/${domainKeywords.length} [${found.map((d) => d.name).join(", ")}]`,
        );
      }
    }
  }

  // Q3 — updated rubric includes PermissionConditionHelpers
  const q3 = results.find((r) => r.questionId === "q3");
  if (q3) {
    console.log("\n--- Q3: RBAC Risk Navigation ---");
    console.log(
      "Ground truth: PermissionConditionHelpers (amp 20.0), roles/types.ts (amp 4.6), ProjectRoleModifySection, ConditionsFields\n",
    );

    const correctFiles = [
      "PermissionConditionHelpers",
      "roles/types",
      "ProjectRoleModifySection",
      "ConditionsFields",
    ];

    for (const cr of q3.conditions) {
      console.log(`  [${cr.conditionId}]`);
      for (const trial of cr.trials) {
        const resp = trial.response;
        const hits = correctFiles.filter((f) =>
          resp.toLowerCase().includes(f.toLowerCase()),
        );
        const misses = correctFiles.filter(
          (f) => !resp.toLowerCase().includes(f.toLowerCase()),
        );
        const guessed = /look for files like|likely|probably|might be|would expect/i.test(resp);
        const mentionsBlast = /blast.?radius|transitive|cascade|indirectly.?affect|ripple|amplif/i.test(resp);

        console.log(
          `    trial ${trial.trial}: correct=${hits.length}/${correctFiles.length} [${hits.join(", ")}]` +
          `${misses.length > 0 ? ` missing=[${misses.join(", ")}]` : ""}` +
          `${guessed ? " GUESSED" : ""}` +
          `${mentionsBlast ? " BLAST_AWARE" : ""}`,
        );
      }
    }
  }

  // Q5
  const q5 = results.find((r) => r.questionId === "q5");
  if (q5) {
    console.log("\n--- Q5: High-Impact File Identification ---");
    console.log(
      "Ground truth: GenericAppConnectionFields (×51), secret-syncs/forms/schemas (×46), roles/types (×51 aff, amp 4.6)\n",
    );

    const impactFiles = [
      "GenericAppConnectionFields",
      "secret-syncs/forms/schemas",
      "roles/types",
    ];

    for (const cr of q5.conditions) {
      console.log(`  [${cr.conditionId}]`);
      for (const trial of cr.trials) {
        const resp = trial.response;
        const hits = impactFiles.filter((f) =>
          resp.toLowerCase().includes(f.toLowerCase()),
        );
        const mentionsCascade =
          /transitive|cascade|blast.?radius|indirectly|chain|downstream|amplif/i.test(resp);

        console.log(
          `    trial ${trial.trial}: correct=${hits.length}/${impactFiles.length} [${hits.join(", ")}]` +
          `${mentionsCascade ? " CASCADE_AWARE" : ""}`,
        );
      }
    }
  }

  // Cost-efficiency summary
  console.log("\n--- Cost-Efficiency (score/tokens, higher = better) ---\n");
  const q3Results = results.find((r) => r.questionId === "q3");
  const q5Results = results.find((r) => r.questionId === "q5");
  const correctFiles4 = ["PermissionConditionHelpers", "roles/types", "ProjectRoleModifySection", "ConditionsFields"];
  const correctFiles3 = ["GenericAppConnectionFields", "secret-syncs/forms/schemas", "roles/types"];

  for (const cond of CONDITIONS) {
    let totalScore = 0;
    let totalTokens = 0;

    if (q3Results) {
      const cr = q3Results.conditions.find((c) => c.conditionId === cond.id)!;
      for (const trial of cr.trials) {
        totalScore += correctFiles4.filter((f) =>
          trial.response.toLowerCase().includes(f.toLowerCase()),
        ).length / correctFiles4.length;
        totalTokens += trial.tokens.input + trial.tokens.output;
      }
    }
    if (q5Results) {
      const cr = q5Results.conditions.find((c) => c.conditionId === cond.id)!;
      for (const trial of cr.trials) {
        totalScore += correctFiles3.filter((f) =>
          trial.response.toLowerCase().includes(f.toLowerCase()),
        ).length / correctFiles3.length;
        totalTokens += trial.tokens.input + trial.tokens.output;
      }
    }

    const efficiency = totalTokens > 0 ? ((totalScore / totalTokens) * 10000).toFixed(2) : "0";
    console.log(`  [${cond.id}] ${cond.name}: score=${totalScore.toFixed(1)} tokens=${totalTokens} efficiency=${efficiency} (score/10k tokens)`);
  }

  console.log("\n(Review experiments/output/experiment-6-results.json for full responses)");
}

runExperiment().catch(console.error);
