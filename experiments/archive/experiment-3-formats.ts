/**
 * Experiment 3: Text-Native Spatial Formats
 *
 * Tests whether spatial reasoning can work WITHOUT images, using text formats
 * that carry positional semantics.
 *
 * 4 conditions:
 *   1. Text Only         — existing encodeToText() baseline
 *   2. Terrain+Text      — PNG terrain image + text (Exp 2 winner)
 *   3. Spatial Text      — text with @(x,y) coordinate annotations
 *   4. .strand Format    — ASCII art heatmap + structured data
 *
 * Same 5 questions from Experiments 1 & 2.
 *
 * Usage: npx tsx experiments/experiment-3-formats.ts [path-to-codebase]
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { scanCodebase } from "../src/scanner/index.js";
import { encodeToText } from "../src/encoder/text-encode.js";
import { computeLayout } from "../src/encoder/layout.js";
import { encodeTerrainSVGFromLayout } from "../src/encoder/layer-terrain.js";
import { encodeSpatialTextFromLayout } from "../src/encoder/spatial-text-encode.js";
import { encodeToStrandFormat } from "../src/encoder/strand-format-encode.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TARGET_CODEBASE = process.argv[2] || "C:\\dev\\SenorBurritoCompany";

// Same 5 questions from Experiments 1 & 2
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

// Experiment 3 conditions
type ConditionId = "text" | "terrain-text" | "spatial-text" | "strand-format";

interface Condition {
  id: ConditionId;
  name: string;
  description: string;
}

const CONDITIONS: Condition[] = [
  {
    id: "text",
    name: "Text Only",
    description: "Structured text encoding — baseline (same as Exp 1 & 2)",
  },
  {
    id: "terrain-text",
    name: "Terrain + Text",
    description: "PNG terrain image + structured text (Exp 2 winner)",
  },
  {
    id: "spatial-text",
    name: "Spatial Text",
    description: "Text with @(x,y) coordinate annotations from layout engine",
  },
  {
    id: "strand-format",
    name: ".strand Format",
    description:
      "ASCII art heatmap + box-drawing dependencies + structured data",
  },
];

interface ConditionResult {
  conditionId: ConditionId;
  conditionName: string;
  response: string;
  tokens: { input: number; output: number };
}

interface QuestionResult {
  questionId: string;
  question: string;
  type: string;
  conditions: ConditionResult[];
}

async function svgToPng(svgContent: string): Promise<Buffer> {
  return sharp(Buffer.from(svgContent)).png().toBuffer();
}

async function runExperiment() {
  console.log("=== STRAND EXPERIMENT 3: Text-Native Spatial Formats ===\n");
  console.log(`Target codebase: ${TARGET_CODEBASE}\n`);

  // Step 1: Scan the codebase
  console.log("Scanning codebase...");
  const graph = scanCodebase(TARGET_CODEBASE);
  console.log(
    `Found ${graph.totalFiles} files, ${graph.nodes.length} nodes, ${graph.edges.length} edges, ${graph.modules.length} modules\n`,
  );

  // Step 2: Compute shared layout
  console.log("Computing shared layout...");
  const layout = computeLayout(graph);
  console.log(
    `Canvas: ${layout.width}×${layout.height}, ${layout.modules.length} module regions\n`,
  );

  // Step 3: Generate all 4 encodings
  const outputDir = path.join(__dirname, "output");
  fs.mkdirSync(outputDir, { recursive: true });

  // Condition 1: Text Only
  console.log("Generating encodings...");
  const textContent = encodeToText(graph);
  fs.writeFileSync(path.join(outputDir, "exp3-text-only.txt"), textContent);
  console.log(
    `  Text Only:    ${textContent.length} chars (~${Math.ceil(textContent.length / 4)} tokens)`,
  );

  // Condition 2: Terrain + Text (need terrain PNG)
  const terrainSvg = encodeTerrainSVGFromLayout(layout, graph);
  const terrainPng = await svgToPng(terrainSvg);
  fs.writeFileSync(path.join(outputDir, "exp3-terrain.png"), terrainPng);
  console.log(`  Terrain PNG:  ${(terrainPng.length / 1024).toFixed(1)} KB`);
  console.log(
    `  Terrain+Text: ~${Math.ceil(textContent.length / 4)} text tokens + image`,
  );

  // Condition 3: Spatial Text
  const spatialTextContent = encodeSpatialTextFromLayout(layout, graph);
  fs.writeFileSync(
    path.join(outputDir, "exp3-spatial-text.txt"),
    spatialTextContent,
  );
  console.log(
    `  Spatial Text: ${spatialTextContent.length} chars (~${Math.ceil(spatialTextContent.length / 4)} tokens)`,
  );

  // Condition 4: .strand Format
  const strandContent = encodeToStrandFormat(graph);
  fs.writeFileSync(
    path.join(outputDir, "exp3-strand-format.strand"),
    strandContent,
  );
  console.log(
    `  .strand:      ${strandContent.length} chars (~${Math.ceil(strandContent.length / 4)} tokens)`,
  );

  console.log("\nAll encodings saved to experiments/output/\n");

  // Print encoding comparison table
  printEncodingSizes(
    textContent,
    terrainPng,
    spatialTextContent,
    strandContent,
  );

  // Step 4: Run LLM experiment if API key available
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log(
      "ANTHROPIC_API_KEY not set — encodings saved. Skipping LLM comparison.\n",
    );
    console.log("To run the full experiment:");
    console.log(
      "  ANTHROPIC_API_KEY=sk-... npx tsx experiments/experiment-3-formats.ts\n",
    );
    return;
  }

  const client = new Anthropic({ apiKey });
  const terrainBase64 = terrainPng.toString("base64");

  const results: QuestionResult[] = [];

  for (const q of QUESTIONS) {
    console.log(`\n--- Question ${q.id}: ${q.type} ---`);
    console.log(`"${q.question}"\n`);

    const conditionResults: ConditionResult[] = [];

    for (const condition of CONDITIONS) {
      console.log(`  [${condition.id}] ${condition.name}...`);

      const result = await queryCondition(
        client,
        condition.id,
        q.question,
        terrainBase64,
        textContent,
        spatialTextContent,
        strandContent,
      );

      conditionResults.push({
        conditionId: condition.id,
        conditionName: condition.name,
        ...result,
      });

      console.log(
        `    → ${result.tokens.input}in/${result.tokens.output}out tokens`,
      );
    }

    results.push({
      questionId: q.id,
      question: q.question,
      type: q.type,
      conditions: conditionResults,
    });
  }

  // Step 5: Save and print results
  const resultsPath = path.join(outputDir, "experiment-3-results.json");
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to ${resultsPath}`);

  printComparison(results);
}

async function queryCondition(
  client: Anthropic,
  conditionId: ConditionId,
  question: string,
  terrainBase64: string,
  textContent: string,
  spatialTextContent: string,
  strandContent: string,
): Promise<{ response: string; tokens: { input: number; output: number } }> {
  type ContentBlock =
    | {
        type: "image";
        source: { type: "base64"; media_type: "image/png"; data: string };
      }
    | { type: "text"; text: string };

  const content: ContentBlock[] = [];

  switch (conditionId) {
    case "text":
      content.push({
        type: "text",
        text: `You are reading a structured text encoding of a software project's architecture:\n\n${textContent}\n\nBased on this encoding, answer this question:\n${question}\n\nBe specific. Reference the data from the encoding.`,
      });
      break;

    case "terrain-text":
      content.push(
        {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: terrainBase64,
          },
        },
        {
          type: "text",
          text: `VISUAL LAYER — TERRAIN: This topographic view shows complexity contours. Dense contour lines = complex areas. Color from green (simple) to red (complex).

STRUCTURED DATA:
${textContent}

The terrain image and the text data describe the same project. Cross-reference them: the visual shows WHERE complexity lives, the text provides WHAT is there.

Based on both the terrain visualization and the structured data, answer this question:
${question}

Be specific. Use both the visual and text information.`,
        },
      );
      break;

    case "spatial-text":
      content.push({
        type: "text",
        text: `You are reading a spatial encoding of a codebase. Coordinates @(x,y) show where each module/file is positioned — nearby coordinates mean related code. Cross-reference positions to understand clustering and proximity.

${spatialTextContent}

Based on this spatial encoding, answer this question:
${question}

Be specific. Reference the spatial data and positions from the encoding.`,
      });
      break;

    case "strand-format":
      content.push({
        type: "text",
        text: `You are reading a .strand encoding of a codebase. The TERRAIN section shows complexity as a visual heatmap (█=high, ·=low). The INFRASTRUCTURE section shows dependency flow between modules. Use both the visual patterns and the structured data sections together.

${strandContent}

Based on this .strand encoding, answer this question:
${question}

Be specific. Reference both the visual patterns and the structured data.`,
      });
      break;
  }

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [{ role: "user", content }],
  });

  const text =
    response.content[0]?.type === "text" ? response.content[0].text : "";
  return {
    response: text,
    tokens: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
    },
  };
}

function printEncodingSizes(
  textContent: string,
  terrainPng: Buffer,
  spatialTextContent: string,
  strandContent: string,
): void {
  console.log("=== ENCODING SIZE COMPARISON ===\n");
  console.log(
    `  Text Only:     ${(textContent.length / 1024).toFixed(1)} KB  (~${Math.ceil(textContent.length / 4)} tokens)`,
  );
  console.log(
    `  Terrain+Text:  ${(terrainPng.length / 1024).toFixed(1)} KB image + ${(textContent.length / 1024).toFixed(1)} KB text`,
  );
  console.log(
    `  Spatial Text:  ${(spatialTextContent.length / 1024).toFixed(1)} KB  (~${Math.ceil(spatialTextContent.length / 4)} tokens)`,
  );
  console.log(
    `  .strand:       ${(strandContent.length / 1024).toFixed(1)} KB  (~${Math.ceil(strandContent.length / 4)} tokens)`,
  );
  console.log();
}

function printComparison(results: QuestionResult[]): void {
  console.log("\n\n========================================");
  console.log("EXPERIMENT 3 RESULTS: Text-Native Spatial Formats");
  console.log("========================================\n");

  // Token totals per condition
  const totals = new Map<ConditionId, { input: number; output: number }>();
  for (const cond of CONDITIONS) {
    totals.set(cond.id, { input: 0, output: 0 });
  }

  for (const r of results) {
    console.log(`\n--- ${r.questionId} [${r.type}]: ${r.question} ---\n`);

    for (const cr of r.conditions) {
      console.log(`  [${cr.conditionId}] ${cr.conditionName}:`);
      console.log(
        `    ${cr.response.slice(0, 200).replace(/\n/g, "\n    ")}${cr.response.length > 200 ? "..." : ""}`,
      );
      console.log(`    Tokens: ${cr.tokens.input}in/${cr.tokens.output}out\n`);

      const t = totals.get(cr.conditionId as ConditionId)!;
      t.input += cr.tokens.input;
      t.output += cr.tokens.output;
    }
  }

  console.log("\n========================================");
  console.log("TOKEN COST SUMMARY (across all 5 questions)");
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

  console.log("\n=== KEY QUESTIONS ===");
  console.log(
    "  Q5: Does Spatial Text produce the same cross-modal insight? (high-dependency files are simple)",
  );
  console.log(
    "  Q2: Does .strand's ASCII heatmap give complexity intuition comparable to terrain PNG?",
  );
  console.log(
    "\n(Review experiments/output/experiment-3-results.json for full responses)",
  );
}

// Run it
runExperiment().catch(console.error);
