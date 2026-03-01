/**
 * Experiment 8: .strand Format Comprehension Test
 *
 * Tests whether the LLM understands the .strand format notation,
 * and whether adding a LEGEND line improves comprehension.
 *
 * 2 conditions:
 *   strand-bare   — .strand v2+Risk as-is (no legend)
 *   strand-legend — same encoding with LEGEND line injected after header
 *
 * 8 questions × 3 trials × 2 conditions = 48 API calls
 *   Tier A (Q1–Q4): definitional — does the LLM know what notation means?
 *   Tier B (Q5–Q8): applied — can it use comprehension to reason?
 *
 * Usage: ANTHROPIC_API_KEY=sk-... npx tsx experiments/experiment-8-comprehension.ts [path]
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";
import { scanCodebase } from "../src/scanner/index.js";
import { analyzeGraph } from "../src/analyzer/index.js";
import { encodeToStrandFormat } from "../src/encoder/strand-format-encode.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TARGET_CODEBASE = process.argv[2] ?? "C:\\dev\\infisical\\frontend";
const TRIALS = 3;
const MODEL = "claude-sonnet-4-20250514";

const LEGEND_LINE =
  "LEGEND: ×N=imported by N files | █▓░·=complexity high→low | ═/·=coupling strong/weak | ×A→B=A direct, B total affected | dN=cascade depth | [AMP]=amplification≥2x | NL=lines of code";

type ConditionId = "current";
type Tier = "A" | "B";
type Classification = "COMPREHENDS" | "PARTIAL" | "PATTERN_MATCH";

interface Condition {
  id: ConditionId;
  name: string;
}

const CONDITIONS: Condition[] = [
  { id: "current", name: "v2+legend (baked-in)" },
];

// ─── Encoding helpers ─────────────────────────────────────

function addLegend(encoding: string): string {
  const nl = encoding.indexOf("\n");
  if (nl === -1) return encoding + "\n" + LEGEND_LINE;
  return encoding.slice(0, nl + 1) + LEGEND_LINE + "\n" + encoding.slice(nl + 1);
}

/** Extract two TERRAIN bar strings with clearly different complexity levels. */
function extractTerrainBars(encoding: string): { dense: string; sparse: string } {
  const terrainMatch = encoding.match(/─── TERRAIN[\s\S]*?(?=\n─── |\n$|$)/);
  const section = terrainMatch?.[0] ?? "";
  const found: string[] = [];
  const re = /[█▓░·]{6,}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(section)) !== null) {
    found.push(m[0]);
  }
  if (found.length < 2) return { dense: "██████████", sparse: "··········" };

  found.sort((a, b) => {
    const density = (s: string) => (s.match(/[█▓]/g) ?? []).length;
    return density(b) - density(a);
  });
  return { dense: found[0] ?? "██████████", sparse: found[found.length - 1] ?? "··········" };
}

/** Extract a RISK entry for PermissionConditionHelpers (or the first [AMP] entry). */
function extractRiskEntry(encoding: string): string {
  const permMatch = encoding.match(/PermissionConditionHelpers[^\n]*/);
  if (permMatch?.[0]) return permMatch[0].trim();
  const ampMatch = encoding.match(/\[AMP\][^\n]*/);
  return ampMatch?.[0]?.trim() ?? "[AMP] amp20.0 ×1→20 d3 1mod";
}

// ─── Rubric ───────────────────────────────────────────────

interface RubricCheck {
  pattern: RegExp;
  label: string;
}

interface ScoredQuestion {
  id: string;
  tier: Tier;
  question: string;
  rubric: RubricCheck[];
}

function scoreResponse(
  response: string,
  rubric: RubricCheck[],
): { score: number; hits: string[]; misses: string[] } {
  const hits: string[] = [];
  const misses: string[] = [];
  for (const check of rubric) {
    if (check.pattern.test(response)) {
      hits.push(check.label);
    } else {
      misses.push(check.label);
    }
  }
  return { score: hits.length, hits, misses };
}

function classify(score: number, max: number): Classification {
  const ratio = score / max;
  if (ratio >= 1.0) return "COMPREHENDS";
  if (ratio >= 0.5) return "PARTIAL";
  return "PATTERN_MATCH";
}

// ─── Result types ─────────────────────────────────────────

interface TrialResult {
  trial: number;
  response: string;
  tokens: { input: number; output: number };
  score: number;
  max: number;
  classification: Classification;
  hits: string[];
  misses: string[];
}

interface ConditionResult {
  conditionId: ConditionId;
  conditionName: string;
  trials: TrialResult[];
  avgScore: number;
}

interface QuestionResult {
  questionId: string;
  tier: Tier;
  question: string;
  maxScore: number;
  conditions: ConditionResult[];
}

// ─── Experiment ───────────────────────────────────────────

async function runExperiment() {
  console.log("=== EXPERIMENT 8: .strand Format Comprehension Test ===\n");
  console.log(`Target: ${TARGET_CODEBASE}`);
  console.log(`Model: ${MODEL}  Trials: ${TRIALS}  Total API calls: ${CONDITIONS.length * 8 * TRIALS}\n`);

  console.log("Scanning codebase...");
  const graph = scanCodebase(TARGET_CODEBASE);
  console.log(
    `  ${graph.totalFiles} files  ${graph.modules.length} modules  ${graph.totalLines.toLocaleString()} lines\n`,
  );

  const analysis = analyzeGraph(graph);
  const encoding = encodeToStrandFormat(graph, analysis);

  const outputDir = path.join(__dirname, "output");
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "exp8b-current.strand"), encoding);

  console.log(`Encoding: ${encoding.length} chars (~${Math.round(encoding.length / 4)} tokens)`);
  console.log(`LEGEND baked in: ${encoding.includes("LEGEND:") ? "yes" : "NO — check encoder"}`);
  console.log();

  // Build questions with runtime-extracted examples
  const { dense, sparse } = extractTerrainBars(encoding);
  const riskEntry = extractRiskEntry(encoding);

  const QUESTIONS: ScoredQuestion[] = [
    {
      id: "q1",
      tier: "A",
      question: `What does ×N (for example ×51) represent in the MOST IMPORTED section of this encoding?`,
      rubric: [
        { pattern: /import(ed)?/i, label: "mentions import" },
        { pattern: /other.{0,20}files?|files?.{0,20}import/i, label: "other files import it" },
        { pattern: /count|number|how many|N\s+(is|=)/i, label: "N = count" },
      ],
    },
    {
      id: "q2",
      tier: "A",
      question: `In the TERRAIN section, what is the difference between a complexity bar like \`${dense}\` versus one like \`${sparse}\`?`,
      rubric: [
        { pattern: /complex/i, label: "mentions complexity" },
        { pattern: /high|dense|heav|more|greater/i, label: "dense = higher complexity" },
        { pattern: /low|light|dot|sparse|simpl|less/i, label: "sparse = lower complexity" },
        { pattern: /bar|fill|character|symbol|visual/i, label: "identifies as visual encoding" },
      ],
    },
    {
      id: "q3",
      tier: "A",
      question: `In the RISK section, explain what each component of this entry means:\n\n${riskEntry}`,
      rubric: [
        { pattern: /amp(lif)?|amplification/i, label: "[AMP] = amplification" },
        { pattern: /amp\s*\d+\.\d+|amplif.{0,20}\d+\.\d+|\d+\.\d+.{0,20}ratio/i, label: "ampN.N = ratio value" },
        { pattern: /\b1\b.{0,20}direct|direct.{0,20}\b1\b/i, label: "×1 = 1 direct" },
        { pattern: /\b20\b.{0,20}total|total.{0,20}\b20\b/i, label: "→20 = 20 total affected" },
        { pattern: /depth|level.{0,10}3|\bd3\b|3.{0,10}hop|cascade.{0,20}3/i, label: "d3 = depth 3" },
        { pattern: /1.{0,10}mod|module.{0,10}1|1mod/i, label: "1mod = 1 module" },
      ],
    },
    {
      id: "q4",
      tier: "A",
      question: `In the INFRASTRUCTURE section, what is the difference between ═══════ and ·······?`,
      rubric: [
        { pattern: /coupl|depend|connect/i, label: "coupling/dependencies" },
        { pattern: /strong|heavy|thick|more|many|high/i, label: "═══ = stronger" },
        { pattern: /weak|thin|light|fewer|few|less/i, label: "··· = weaker" },
      ],
    },
    {
      id: "q5",
      tier: "B",
      question: `Looking at the TERRAIN section, which module has the highest complexity relative to its number of files? Show your reasoning step by step.`,
      rubric: [
        { pattern: /\bsrc\b/i, label: "identifies src" },
        { pattern: /relative|per.?file|ratio|proportion|divid/i, label: "uses relative reasoning" },
        { pattern: /\bsmall\b|\bfew\b.{0,20}file|\b[1-9]\b.{0,10}file/i, label: "notes small file count" },
      ],
    },
    {
      id: "q6",
      tier: "B",
      question: `According to this encoding, if you modified PermissionConditionHelpers.tsx, what would happen step by step? Include specific numbers.`,
      rubric: [
        { pattern: /\b1\b.{0,20}direct|direct.{0,20}\b1\b/i, label: "1 direct import" },
        { pattern: /\b20\b.{0,20}total|total.{0,20}\b20\b/i, label: "20 total affected" },
        { pattern: /depth.{0,10}3|3.{0,10}level|\bd3\b|three.{0,10}hop/i, label: "depth 3" },
        { pattern: /cascade|propagat|ripple|chain|downstream/i, label: "explains cascade" },
        { pattern: /amp|amplif/i, label: "mentions amplification" },
      ],
    },
    {
      id: "q7",
      tier: "B",
      question: `Which two modules are most tightly coupled according to the INFRASTRUCTURE section? How many connections, and what types?`,
      rubric: [
        { pattern: /src.{0,30}pages|pages.{0,30}src/i, label: "identifies src↔pages" },
        { pattern: /2[45]\d|25[01]/i, label: "mentions ~251 connections" },
        { pattern: /render|component/i, label: "rendering connection type" },
        { pattern: /auth/i, label: "auth connection type" },
      ],
    },
    {
      id: "q8",
      tier: "B",
      question: `GenericAppConnectionFields appears in MOST IMPORTED with ×51 but does NOT appear in RISK. PermissionConditionHelpers appears in RISK with high amplification but has only ×1 direct import. Explain why this makes sense.`,
      rubric: [
        {
          pattern: /import.{0,40}not.{0,20}risk|risk.{0,40}not.{0,20}import|import count.{0,30}cascade|cascade.{0,30}import count/i,
          label: "import count ≠ risk",
        },
        { pattern: /amplif|cascade|propagat/i, label: "explains amplification" },
        {
          pattern: /leaf|end.?point|terminal|nothing.{0,20}import|no.{0,20}downstream|not.{0,20}import.{0,20}by.{0,20}other/i,
          label: "GenericApp is a leaf node",
        },
        {
          pattern: /Permission.{0,30}cascade|cascade.{0,30}chain|chain.{0,20}Permission|Permission.{0,30}spread/i,
          label: "Permission cascades through chain",
        },
      ],
    },
  ];

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    console.log(
      "ANTHROPIC_API_KEY not set — encodings saved to experiments/output/. Skipping LLM calls.\n",
    );
    console.log(
      "Run: ANTHROPIC_API_KEY=sk-... npx tsx experiments/experiment-8-comprehension.ts\n",
    );
    return;
  }

  const client = new Anthropic({ apiKey });

  const conditionContent: Record<ConditionId, string> = {
    "current": encoding,
  };

  const results: QuestionResult[] = [];

  for (const q of QUESTIONS) {
    console.log(`\n--- ${q.id} [Tier ${q.tier}] ---`);
    console.log(`"${q.question.slice(0, 100)}${q.question.length > 100 ? "..." : ""}"\n`);

    const conditionResults: ConditionResult[] = [];

    for (const condition of CONDITIONS) {
      console.log(`  [${condition.id}]`);
      const content = conditionContent[condition.id];

      const prompt = `You are reading a .strand encoding of a software project's architecture.

${content}

Answer this question based on what the encoding tells you:
${q.question}

Be specific. Reference the notation and values from the encoding directly.`;

      const trials: TrialResult[] = [];

      for (let t = 0; t < TRIALS; t++) {
        const response = await client.messages.create({
          model: MODEL,
          max_tokens: 1024,
          messages: [{ role: "user", content: prompt }],
        });

        const text =
          response.content[0]?.type === "text" ? response.content[0].text : "";
        const { score, hits, misses } = scoreResponse(text, q.rubric);
        const classification = classify(score, q.rubric.length);

        trials.push({
          trial: t + 1,
          response: text,
          tokens: {
            input: response.usage.input_tokens,
            output: response.usage.output_tokens,
          },
          score,
          max: q.rubric.length,
          classification,
          hits,
          misses,
        });

        console.log(
          `    trial ${t + 1}: ${score}/${q.rubric.length} [${classification}]  hits=[${hits.join(", ")}]  ${response.usage.input_tokens}in/${response.usage.output_tokens}out`,
        );
      }

      const avgScore =
        trials.reduce((sum, t) => sum + t.score, 0) / trials.length;
      conditionResults.push({
        conditionId: condition.id,
        conditionName: condition.name,
        trials,
        avgScore,
      });
    }

    results.push({
      questionId: q.id,
      tier: q.tier,
      question: q.question,
      maxScore: q.rubric.length,
      conditions: conditionResults,
    });
  }

  const resultsPath = path.join(outputDir, "experiment-8b-results.json");
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to ${resultsPath}`);

  printMatrix(results);
  printHypothesisChecks(results, encoding, encoding);
}

// ─── Output ───────────────────────────────────────────────

// Exp 8 strand-legend baseline scores for comparison (avg/max)
const EXP8_LEGEND_BASELINE: Record<string, number> = {
  q1: 3.0, q2: 4.0, q3: 5.3, q4: 3.0, q5: 3.0, q6: 5.0, q7: 4.0, q8: 3.0,
};

function printMatrix(results: QuestionResult[]): void {
  console.log("\n\n========================================");
  console.log("COMPREHENSION MATRIX — Exp 8b (legend baked in)");
  console.log("========================================\n");

  const header = `${"Question".padEnd(14)} ${"current (baked-in)".padEnd(24)} ${"exp8 legend baseline".padEnd(22)} ${"delta".padStart(6)}`;
  console.log(header);
  console.log("-".repeat(header.length));

  for (const r of results) {
    const current = r.conditions.find((c) => c.conditionId === "current")!;
    const baseline = EXP8_LEGEND_BASELINE[r.questionId] ?? 0;
    const delta = current.avgScore - baseline;
    const deltaStr = (delta >= 0 ? "+" : "") + delta.toFixed(1);

    const C = current.trials.filter((t) => t.classification === "COMPREHENDS").length;
    const P = current.trials.filter((t) => t.classification === "PARTIAL").length;
    const PM = current.trials.filter((t) => t.classification === "PATTERN_MATCH").length;
    const currentStr = `${current.avgScore.toFixed(1)}/${r.maxScore}  C${C}/P${P}/PM${PM}`;
    const baselineStr = `${baseline.toFixed(1)}/${r.maxScore}`;

    console.log(
      `${(r.questionId + " [T" + r.tier + "]").padEnd(14)} ${currentStr.padEnd(24)} ${baselineStr.padEnd(22)} ${deltaStr.padStart(6)}`,
    );
  }
}

function printHypothesisChecks(
  results: QuestionResult[],
  bare: string,
  legend: string,
): void {
  console.log("\n\n========================================");
  console.log("HYPOTHESIS CHECKS");
  console.log("========================================\n");

  // H1: Tier A comprehension ≥75% (with baked-in legend)
  const tierATrials = results
    .filter((r) => r.tier === "A")
    .flatMap((r) => r.conditions.find((c) => c.conditionId === "current")!.trials);
  const tierAScore = tierATrials.reduce((s, t) => s + t.score, 0);
  const tierAMax = tierATrials.reduce((s, t) => s + t.max, 0);
  const h1ratio = tierAScore / tierAMax;
  console.log(
    `H1 (Tier A ≥75%): ${(h1ratio * 100).toFixed(1)}%  ${h1ratio >= 0.75 ? "✓ CONFIRMED" : "✗ REJECTED"}`,
  );

  // H2: Tier B comprehension ≥75% (with baked-in legend)
  const tierBTrials = results
    .filter((r) => r.tier === "B")
    .flatMap((r) => r.conditions.find((c) => c.conditionId === "current")!.trials);
  const tierBScore = tierBTrials.reduce((s, t) => s + t.score, 0);
  const tierBMax = tierBTrials.reduce((s, t) => s + t.max, 0);
  const h2ratio = tierBScore / tierBMax;
  console.log(
    `H2 (Tier B ≥75%): ${(h2ratio * 100).toFixed(1)}%  ${h2ratio >= 0.75 ? "✓ CONFIRMED" : "✗ REJECTED"}`,
  );

  // H3: Q8 still the hardest question
  const q8cond = results.find((r) => r.questionId === "q8")!
    .conditions.find((c) => c.conditionId === "current")!;
  const q8Ratio = q8cond.avgScore / results.find((r) => r.questionId === "q8")!.maxScore;
  const allRatios = results.map(
    (r) => r.conditions.find((c) => c.conditionId === "current")!.avgScore / r.maxScore,
  );
  const minRatio = Math.min(...allRatios);
  console.log(
    `H3 (Q8 lowest comprehension): Q8=${(q8Ratio * 100).toFixed(1)}%  min overall=${(minRatio * 100).toFixed(1)}%  ${q8Ratio <= minRatio + 0.01 ? "✓ CONFIRMED" : "✗ REJECTED"}`,
  );

  // vs Exp 8 legend baseline
  const exp8Total = Object.values(EXP8_LEGEND_BASELINE).reduce((s, v) => s + v, 0);
  const currentTotal = results.reduce(
    (s, r) => s + r.conditions.find((c) => c.conditionId === "current")!.avgScore,
    0,
  );
  const delta = currentTotal - exp8Total;
  console.log(
    `\nVs Exp8 strand-legend baseline: total score ${currentTotal.toFixed(1)} vs ${exp8Total.toFixed(1)} (${delta >= 0 ? "+" : ""}${delta.toFixed(1)})  ${delta >= 0 ? "✓ matches or exceeds" : "✗ regression"}`,
  );
}

runExperiment().catch(console.error);
