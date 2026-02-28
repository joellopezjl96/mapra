/**
 * Experiment 5: .strand Generalization + Blast Radius Test
 *
 * Tests two hypotheses on the Infisical frontend (unfamiliar codebase):
 * 1. Does .strand v2 generalize beyond the codebase it was designed around?
 * 2. Does the RISK (blast radius) section improve answers about change impact?
 *
 * 3 conditions:
 *   1. Text Only     — baseline
 *   2. .strand v2    — without blast radius analysis
 *   3. .strand v2+R  — with RISK section (blast radius)
 *
 * Usage: ANTHROPIC_API_KEY=sk-... npx tsx experiments/experiment-5-generalization.ts [path]
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
    question:
      "What are the main feature domains in this project? How many files are in each?",
    type: "inventory",
  },
  {
    id: "q2",
    question:
      "What is the most complex part of this project? What makes it complex?",
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
    question:
      "How is state management organized in this project? What patterns does it use?",
    type: "architecture",
  },
  {
    id: "q5",
    question:
      "Which files would cause the most breakage if changed? Why?",
    type: "dependency",
  },
];

type ConditionId = "text" | "v2" | "v2-risk";

interface Condition {
  id: ConditionId;
  name: string;
}

const CONDITIONS: Condition[] = [
  { id: "text", name: "Text Only" },
  { id: "v2", name: ".strand v2" },
  { id: "v2-risk", name: ".strand v2+Risk" },
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
  console.log("=== EXPERIMENT 5: .strand Generalization + Blast Radius ===\n");
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

  // Step 3: Generate ALL encodings from same graph
  const outputDir = path.join(__dirname, "output");
  fs.mkdirSync(outputDir, { recursive: true });

  console.log("Generating encodings from same scan...");

  const textContent = encodeToText(graph);
  console.log(
    `  Text Only:       ${textContent.length} chars (~${Math.ceil(textContent.length / 4)} tokens)`,
  );

  const v2Content = encodeToStrandFormat(graph);
  console.log(
    `  .strand v2:      ${v2Content.length} chars (~${Math.ceil(v2Content.length / 4)} tokens)`,
  );

  const v2RiskContent = encodeToStrandFormat(graph, analysis);
  fs.writeFileSync(
    path.join(outputDir, "exp5-strand-v2-risk.strand"),
    v2RiskContent,
  );
  console.log(
    `  .strand v2+Risk: ${v2RiskContent.length} chars (~${Math.ceil(v2RiskContent.length / 4)} tokens)`,
  );

  console.log("\nAll encodings generated from same scan.\n");
  printEncodingSizes(textContent, v2Content, v2RiskContent);

  // Step 4: Run LLM experiment if API key available
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log(
      "ANTHROPIC_API_KEY not set — encodings saved. Skipping LLM comparison.\n",
    );
    console.log("To run the full experiment:");
    console.log(
      "  ANTHROPIC_API_KEY=sk-... npx tsx experiments/experiment-5-generalization.ts\n",
    );
    return;
  }

  const client = new Anthropic({ apiKey });

  const conditionContent: Record<
    ConditionId,
    { name: string; content: string }
  > = {
    text: { name: "structured text", content: textContent },
    v2: { name: ".strand v2", content: v2Content },
    "v2-risk": { name: ".strand v2 with risk analysis", content: v2RiskContent },
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

  // Step 5: Save and print results
  const resultsPath = path.join(outputDir, "experiment-5-results.json");
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to ${resultsPath}`);

  printComparison(results);
  printScoring(results);
}

function printEncodingSizes(
  textContent: string,
  v2Content: string,
  v2RiskContent: string,
): void {
  console.log("=== ENCODING SIZE COMPARISON ===\n");
  console.log(
    `  Text Only:       ${(textContent.length / 1024).toFixed(1)} KB  (~${Math.ceil(textContent.length / 4)} tokens)`,
  );
  console.log(
    `  .strand v2:      ${(v2Content.length / 1024).toFixed(1)} KB  (~${Math.ceil(v2Content.length / 4)} tokens)`,
  );
  console.log(
    `  .strand v2+Risk: ${(v2RiskContent.length / 1024).toFixed(1)} KB  (~${Math.ceil(v2RiskContent.length / 4)} tokens)`,
  );

  const v2Chars = v2Content.length;
  const riskChars = v2RiskContent.length;
  const textChars = textContent.length;
  console.log(
    `\n  v2 vs text:      ${(((v2Chars - textChars) / textChars) * 100).toFixed(1)}%`,
  );
  console.log(
    `  v2+Risk vs v2:   +${riskChars - v2Chars} chars (RISK section overhead)`,
  );
  console.log();
}

function printComparison(results: QuestionResult[]): void {
  console.log("\n\n========================================");
  console.log("EXPERIMENT 5 RESULTS: Generalization + Blast Radius");
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
      const firstResponse = cr.trials[0]?.response || "";
      console.log(
        `    ${firstResponse.slice(0, 200).replace(/\n/g, "\n    ")}${firstResponse.length > 200 ? "..." : ""}`,
      );

      for (const trial of cr.trials) {
        const t = totals.get(cr.conditionId as ConditionId)!;
        t.input += trial.tokens.input;
        t.output += trial.tokens.output;
      }

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

function printScoring(results: QuestionResult[]): void {
  console.log("\n\n========================================");
  console.log("SCORING RUBRICS");
  console.log("========================================\n");

  // Q1 scoring: domain identification
  const q1 = results.find((r) => r.questionId === "q1");
  if (q1) {
    console.log("--- Q1: Feature Domain Inventory ---");
    console.log(
      "Ground truth domains: secrets, pki/cert, kms, ssh, pam, scanning, ai/mcp, org/admin\n",
    );

    const domainKeywords = [
      { name: "secrets", pattern: /secret.?manag|secret.?dashboard/i },
      { name: "pki/cert", pattern: /pki|certificate|cert.?manag/i },
      { name: "kms", pattern: /kms|key.?manag/i },
      { name: "ssh", pattern: /ssh/i },
      { name: "pam", pattern: /pam|privileged.?access/i },
      { name: "scanning", pattern: /secret.?scan|scanning/i },
      { name: "ai/mcp", pattern: /\bai\b|mcp/i },
      { name: "org/admin", pattern: /organiz|admin|billing|settings/i },
    ];

    for (const cr of q1.conditions) {
      console.log(`  [${cr.conditionId}]`);
      for (const trial of cr.trials) {
        const resp = trial.response.toLowerCase();
        const found = domainKeywords.filter((d) => d.pattern.test(resp));
        console.log(
          `    trial ${trial.trial}: ${found.length}/${domainKeywords.length} domains [${found.map((d) => d.name).join(", ")}]`,
        );
      }
    }
  }

  // Q3 scoring: RBAC risk files
  const q3 = results.find((r) => r.questionId === "q3");
  if (q3) {
    console.log("\n--- Q3: RBAC Risk Navigation ---");
    console.log(
      "Ground truth: roles/types.ts (amp 4.6), ProjectRoleModifySection, ConditionsFields\n",
    );

    const correctFiles = [
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
        const guessed =
          /look for files like|likely|probably|might be|would expect/i.test(
            resp,
          );
        const mentionsBlast =
          /blast.?radius|transitive|cascade|indirectly.?affect|ripple/i.test(
            resp,
          );

        console.log(
          `    trial ${trial.trial}: correct=${hits.length}/${correctFiles.length} [${hits.join(", ")}]` +
            `${misses.length > 0 ? ` missing=[${misses.join(", ")}]` : ""}` +
            `${guessed ? " GUESSED" : ""}` +
            `${mentionsBlast ? " BLAST_AWARE" : ""}`,
        );
      }
    }
  }

  // Q5 scoring: high-impact files
  const q5 = results.find((r) => r.questionId === "q5");
  if (q5) {
    console.log("\n--- Q5: High-Impact File Identification ---");
    console.log(
      "Ground truth: GenericAppConnectionFields (52 aff), secret-syncs/forms/schemas (46), roles/types (51, amp 4.6)\n",
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
          /transitive|cascade|blast.?radius|indirectly|chain|downstream/i.test(
            resp,
          );

        console.log(
          `    trial ${trial.trial}: correct=${hits.length}/${impactFiles.length} [${hits.join(", ")}]` +
            `${mentionsCascade ? " CASCADE_AWARE" : ""}`,
        );
      }
    }
  }

  console.log(
    "\n(Review experiments/output/experiment-5-results.json for full responses)",
  );
}

runExperiment().catch(console.error);
