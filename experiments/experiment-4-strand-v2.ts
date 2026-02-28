/**
 * Experiment 4: .strand v2 Validation
 *
 * Tests whether .strand v2 (FLOWS + uncapped routes/pages) fixes
 * the Q3 and Q1 weaknesses while maintaining Q2/Q4/Q5 accuracy.
 *
 * Fixes from review:
 * - All encodings from same scanCodebase() call (no frozen file loading)
 * - Uniform prompt template (no domain priming)
 * - Scoring rubrics for Q1 and Q3
 * - 3 trials per condition-question pair
 *
 * 3 conditions:
 *   1. Text Only    — baseline
 *   2. .strand v1   — control (frozen encoder, same graph)
 *   3. .strand v2   — test (new encoder with FLOWS)
 *
 * Usage: ANTHROPIC_API_KEY=sk-... npx tsx experiments/experiment-4-strand-v2.ts [path-to-codebase]
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";
import { scanCodebase } from "../src/scanner/index.js";
import { encodeToText } from "../src/encoder/text-encode.js";
import { encodeToStrandFormatV1 } from "../src/encoder/strand-format-encode-v1.js";
import { encodeToStrandFormat } from "../src/encoder/strand-format-encode.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TARGET_CODEBASE = process.argv[2] || "C:\\dev\\SenorBurritoCompany";
const TRIALS = 3;

const QUESTIONS = [
  {
    id: "q1",
    question:
      "How many API routes does this project have? List them with their HTTP methods.",
    type: "inventory",
  },
  {
    id: "q2",
    question:
      "What is the most complex module in this project? What makes it complex?",
    type: "analysis",
  },
  {
    id: "q3",
    question:
      "If I needed to fix a bug in the payment processing flow, which files would I need to look at? Trace the likely call chain.",
    type: "navigation",
  },
  {
    id: "q4",
    question:
      "What are the main module boundaries in this project? Are there any modules that should be isolated but aren't?",
    type: "architecture",
  },
  {
    id: "q5",
    question:
      "Which files are the most depended-on (imported by the most other files)? What does this tell you about the architecture?",
    type: "dependency",
  },
];

type ConditionId = "text" | "strand-v1" | "strand-v2";

interface Condition {
  id: ConditionId;
  name: string;
}

const CONDITIONS: Condition[] = [
  { id: "text", name: "Text Only" },
  { id: "strand-v1", name: ".strand v1" },
  { id: "strand-v2", name: ".strand v2" },
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

/**
 * Uniform prompt template — identical structure for all conditions.
 * No section-specific hints, no domain names, no priming.
 */
function buildPrompt(
  formatName: string,
  content: string,
  question: string,
): string {
  return `You are reading a ${formatName} encoding of a software project's architecture. It contains multiple sections describing different aspects of the project.

${content}

Based on this encoding, answer this question:
${question}

Be specific. Reference the data from the encoding.`;
}

async function runExperiment() {
  console.log("=== STRAND EXPERIMENT 4: .strand v2 Validation ===\n");
  console.log(`Target codebase: ${TARGET_CODEBASE}`);
  console.log(`Trials per condition-question: ${TRIALS}\n`);

  // Step 1: Scan the codebase ONCE
  console.log("Scanning codebase...");
  const graph = scanCodebase(TARGET_CODEBASE);
  console.log(
    `Found ${graph.totalFiles} files, ${graph.nodes.length} nodes, ${graph.edges.length} edges, ${graph.modules.length} modules\n`,
  );

  // Step 2: Generate ALL encodings from the SAME graph
  const outputDir = path.join(__dirname, "output");
  fs.mkdirSync(outputDir, { recursive: true });

  console.log("Generating encodings from same scan...");

  const textContent = encodeToText(graph);
  console.log(
    `  Text Only:    ${textContent.length} chars (~${Math.ceil(textContent.length / 4)} tokens)`,
  );

  const strandV1Content = encodeToStrandFormatV1(graph);
  console.log(
    `  .strand v1:   ${strandV1Content.length} chars (~${Math.ceil(strandV1Content.length / 4)} tokens) [frozen encoder, same graph]`,
  );

  const strandV2Content = encodeToStrandFormat(graph);
  fs.writeFileSync(
    path.join(outputDir, "exp4-strand-v2.strand"),
    strandV2Content,
  );
  console.log(
    `  .strand v2:   ${strandV2Content.length} chars (~${Math.ceil(strandV2Content.length / 4)} tokens)`,
  );

  console.log("\nAll encodings generated from same scan.\n");

  printEncodingSizes(textContent, strandV1Content, strandV2Content);

  // Step 3: Run LLM experiment if API key available
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log(
      "ANTHROPIC_API_KEY not set — encodings saved. Skipping LLM comparison.\n",
    );
    console.log("To run the full experiment:");
    console.log(
      "  ANTHROPIC_API_KEY=sk-... npx tsx experiments/experiment-4-strand-v2.ts\n",
    );
    return;
  }

  const client = new Anthropic({ apiKey });

  // Map condition IDs to their content and format name
  const conditionContent: Record<
    ConditionId,
    { name: string; content: string }
  > = {
    text: { name: "structured text", content: textContent },
    "strand-v1": { name: ".strand v1", content: strandV1Content },
    "strand-v2": { name: ".strand v2", content: strandV2Content },
  };

  const results: QuestionResult[] = [];

  for (const q of QUESTIONS) {
    console.log(`\n--- Question ${q.id}: ${q.type} ---`);
    console.log(`"${q.question}"\n`);

    const conditionResults: ConditionResult[] = [];

    for (const condition of CONDITIONS) {
      console.log(`  [${condition.id}] ${condition.name}...`);

      const { name: formatName, content } = conditionContent[condition.id];
      const prompt = buildPrompt(formatName, content, q.question);

      const trials: TrialResult[] = [];

      for (let t = 0; t < TRIALS; t++) {
        const response = await client.messages.create({
          model: "claude-sonnet-4-20250514",
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

  // Step 4: Save and print results
  const resultsPath = path.join(outputDir, "experiment-4-results.json");
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to ${resultsPath}`);

  printComparison(results);
  printScoring(results);
}

function printEncodingSizes(
  textContent: string,
  strandV1Content: string,
  strandV2Content: string,
): void {
  console.log("=== ENCODING SIZE COMPARISON ===\n");
  console.log(
    `  Text Only:     ${(textContent.length / 1024).toFixed(1)} KB  (~${Math.ceil(textContent.length / 4)} tokens)`,
  );
  console.log(
    `  .strand v1:    ${(strandV1Content.length / 1024).toFixed(1)} KB  (~${Math.ceil(strandV1Content.length / 4)} tokens)`,
  );
  console.log(
    `  .strand v2:    ${(strandV2Content.length / 1024).toFixed(1)} KB  (~${Math.ceil(strandV2Content.length / 4)} tokens)`,
  );

  const v1Chars = strandV1Content.length;
  const v2Chars = strandV2Content.length;
  const textChars = textContent.length;
  console.log(
    `\n  v2 vs v1:      ${v2Chars > v1Chars ? "+" : ""}${(((v2Chars - v1Chars) / v1Chars) * 100).toFixed(1)}%`,
  );
  console.log(
    `  v2 vs text:    ${(((v2Chars - textChars) / textChars) * 100).toFixed(1)}%`,
  );
  console.log();
}

function printComparison(results: QuestionResult[]): void {
  console.log("\n\n========================================");
  console.log("EXPERIMENT 4 RESULTS: .strand v2 Validation");
  console.log("========================================\n");

  const totals = new Map<ConditionId, { input: number; output: number }>();
  for (const cond of CONDITIONS) {
    totals.set(cond.id, { input: 0, output: 0 });
  }

  for (const r of results) {
    console.log(`\n--- ${r.questionId} [${r.type}]: ${r.question} ---\n`);

    for (const cr of r.conditions) {
      console.log(
        `  [${cr.conditionId}] ${cr.conditionName} (${cr.trials.length} trials):`,
      );
      // Show first trial response truncated
      const firstResponse = cr.trials[0]?.response || "";
      console.log(
        `    ${firstResponse.slice(0, 200).replace(/\n/g, "\n    ")}${firstResponse.length > 200 ? "..." : ""}`,
      );

      for (const trial of cr.trials) {
        const t = totals.get(cr.conditionId as ConditionId)!;
        t.input += trial.tokens.input;
        t.output += trial.tokens.output;
      }

      // Show per-trial token counts
      const trialTokens = cr.trials
        .map((t) => `${t.tokens.input + t.tokens.output}`)
        .join(", ");
      console.log(`    Tokens per trial: [${trialTokens}]\n`);
    }
  }

  console.log("\n========================================");
  console.log(
    `TOKEN COST SUMMARY (across all 5 questions × ${TRIALS} trials)`,
  );
  console.log("========================================\n");

  const textTotal = totals.get("text")!;
  const textTotalTokens = textTotal.input + textTotal.output;

  for (const cond of CONDITIONS) {
    const t = totals.get(cond.id)!;
    const total = t.input + t.output;
    const vsText = ((total / textTotalTokens) * 100 - 100).toFixed(1);
    const sign = total >= textTotalTokens ? "+" : "";
    console.log(
      `  ${cond.name.padEnd(25)} ${t.input.toLocaleString().padStart(8)}in + ${t.output.toLocaleString().padStart(6)}out = ${total.toLocaleString().padStart(8)} total  (${sign}${vsText}% vs text)`,
    );
  }
}

/**
 * Automated scoring for Q1 and Q3 using ground-truth rubrics.
 */
function printScoring(results: QuestionResult[]): void {
  console.log("\n\n========================================");
  console.log("SCORING RUBRICS");
  console.log("========================================\n");

  // Q1 scoring: count how many routes the response mentions
  const q1 = results.find((r) => r.questionId === "q1");
  if (q1) {
    console.log("--- Q1: Route Inventory ---");
    console.log("Ground truth: 36 API routes\n");

    for (const cr of q1.conditions) {
      console.log(`  [${cr.conditionId}]`);
      for (const trial of cr.trials) {
        // Count route-like patterns in response
        const routeMatches =
          trial.response.match(/\/api\/[\w/[\]-]+/g) || [];
        const uniqueRoutes = new Set(
          routeMatches.map((r) => r.replace(/\[.*?\]/g, "[param]")),
        );
        const countMatch = trial.response.match(
          /\b(\d+)\s*(?:API\s+)?routes?\b/i,
        );
        const statedCount = countMatch ? parseInt(countMatch[1]!) : 0;
        console.log(
          `    trial ${trial.trial}: stated=${statedCount} routes, enumerated=${uniqueRoutes.size} unique paths`,
        );
      }
    }
  }

  // Q3 scoring: check for correct and incorrect payment files
  const q3 = results.find((r) => r.questionId === "q3");
  if (q3) {
    console.log("\n--- Q3: Payment Flow Navigation ---");
    console.log(
      "Ground truth files: orders/route, ordering, cluster-pos/client",
    );
    console.log("False positives: catering/page, spirit-night/page\n");

    const correctFiles = ["orders/route", "ordering", "cluster-pos/client"];
    const falsePositives = ["catering/page", "spirit-night/page"];

    for (const cr of q3.conditions) {
      console.log(`  [${cr.conditionId}]`);
      for (const trial of cr.trials) {
        const resp = trial.response.toLowerCase();
        const hits = correctFiles.filter((f) => resp.includes(f));
        const misses = correctFiles.filter((f) => !resp.includes(f));
        const fps = falsePositives.filter((f) => resp.includes(f));
        const guessed =
          /look for files like|likely|probably|might be/.test(resp);

        console.log(
          `    trial ${trial.trial}: correct=${hits.length}/${correctFiles.length} [${hits.join(", ")}]` +
            `${misses.length > 0 ? ` missing=[${misses.join(", ")}]` : ""}` +
            `${fps.length > 0 ? ` FALSE_POS=[${fps.join(", ")}]` : ""}` +
            `${guessed ? " GUESSED_PATHS" : ""}`,
        );
      }
    }
  }

  console.log(
    "\n(Review experiments/output/experiment-4-results.json for full responses)",
  );
}

runExperiment().catch(console.error);
