/**
 * Experiment: Visual Encoding vs Text Encoding — Multi-Layer Topographic
 *
 * Scans a real codebase (Senor Burrito Company), generates encodings,
 * then asks Claude structural questions using each encoding condition.
 *
 * Experiment 1 conditions: single visual, text only
 * Experiment 2 conditions: 3-layer topographic, terrain+text hybrid, terrain+infra only
 *
 * Measures: accuracy, response quality, and token usage across all conditions.
 *
 * Usage: npx tsx experiments/visual-vs-text.ts [path-to-codebase]
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { scanCodebase } from "../src/scanner/index.js";
import { encodeToSVG } from "../src/encoder/encode.js";
import { encodeToText } from "../src/encoder/text-encode.js";
import { computeLayout } from "../src/encoder/layout.js";
import { encodeTerrainSVGFromLayout } from "../src/encoder/layer-terrain.js";
import { encodeInfrastructureSVGFromLayout } from "../src/encoder/layer-infrastructure.js";
import { encodeLabelsSVGFromLayout } from "../src/encoder/layer-labels.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TARGET_CODEBASE = process.argv[2] || "C:\\dev\\SenorBurritoCompany";

// Questions that test structural understanding of a codebase
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

// Experiment conditions
type ConditionId =
  | "text"
  | "single-visual"
  | "3-layer"
  | "terrain-text"
  | "terrain-infra";

interface Condition {
  id: ConditionId;
  name: string;
  description: string;
}

const CONDITIONS: Condition[] = [
  {
    id: "text",
    name: "Text Only",
    description: "Structured text encoding (Exp 1 baseline)",
  },
  {
    id: "single-visual",
    name: "Single Visual",
    description: "One combined SVG→PNG (Exp 1 visual)",
  },
  {
    id: "3-layer",
    name: "3-Layer Topographic",
    description: "Terrain + Infrastructure + Labels as 3 separate images",
  },
  {
    id: "terrain-text",
    name: "Terrain + Text Hybrid",
    description: "Layer 1 (terrain image) + structured text encoding",
  },
  {
    id: "terrain-infra",
    name: "Terrain + Infrastructure",
    description:
      "Layers 1+2 only — can the LLM work without precise text labels?",
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
  console.log(
    "=== STRAND EXPERIMENT 2: Multi-Layer Topographic Encoding ===\n",
  );
  console.log(`Target codebase: ${TARGET_CODEBASE}\n`);

  // Step 1: Scan the codebase
  console.log("Scanning codebase...");
  const graph = scanCodebase(TARGET_CODEBASE);
  console.log(
    `Found ${graph.totalFiles} files, ${graph.nodes.length} nodes, ${graph.edges.length} edges, ${graph.modules.length} modules\n`,
  );

  // Step 2: Compute shared layout (all layers use the same positions)
  console.log("Computing shared layout...");
  const layout = computeLayout(graph);
  console.log(
    `Canvas: ${layout.width}x${layout.height}, ${layout.modules.length} module regions\n`,
  );

  // Step 3: Generate all encodings
  const outputDir = path.join(__dirname, "output");
  fs.mkdirSync(outputDir, { recursive: true });

  // Single visual (Exp 1 style)
  console.log("Generating single visual encoding...");
  const singleSvg = encodeToSVG(graph);
  fs.writeFileSync(path.join(outputDir, "strand-visual.svg"), singleSvg);
  const singlePng = await svgToPng(singleSvg);
  fs.writeFileSync(path.join(outputDir, "strand-visual.png"), singlePng);
  console.log(`  Single visual: ${singlePng.length} bytes PNG`);

  // Layer 1: Terrain
  console.log("Generating Layer 1: Terrain...");
  const terrainSvg = encodeTerrainSVGFromLayout(layout, graph);
  fs.writeFileSync(path.join(outputDir, "layer-1-terrain.svg"), terrainSvg);
  const terrainPng = await svgToPng(terrainSvg);
  fs.writeFileSync(path.join(outputDir, "layer-1-terrain.png"), terrainPng);
  console.log(`  Terrain: ${terrainPng.length} bytes PNG`);

  // Layer 2: Infrastructure
  console.log("Generating Layer 2: Infrastructure...");
  const infraSvg = encodeInfrastructureSVGFromLayout(layout, graph);
  fs.writeFileSync(
    path.join(outputDir, "layer-2-infrastructure.svg"),
    infraSvg,
  );
  const infraPng = await svgToPng(infraSvg);
  fs.writeFileSync(
    path.join(outputDir, "layer-2-infrastructure.png"),
    infraPng,
  );
  console.log(`  Infrastructure: ${infraPng.length} bytes PNG`);

  // Layer 3: Labels
  console.log("Generating Layer 3: Labels...");
  const labelsSvg = encodeLabelsSVGFromLayout(layout, graph);
  fs.writeFileSync(path.join(outputDir, "layer-3-labels.svg"), labelsSvg);
  const labelsPng = await svgToPng(labelsSvg);
  fs.writeFileSync(path.join(outputDir, "layer-3-labels.png"), labelsPng);
  console.log(`  Labels: ${labelsPng.length} bytes PNG`);

  // Text encoding
  console.log("Generating text encoding...");
  const textContent = encodeToText(graph);
  fs.writeFileSync(path.join(outputDir, "strand-text.txt"), textContent);
  console.log(
    `  Text: ${textContent.length} chars (~${Math.ceil(textContent.length / 4)} tokens)`,
  );

  // Raw graph
  fs.writeFileSync(
    path.join(outputDir, "strand-graph.json"),
    JSON.stringify(graph, null, 2),
  );

  console.log("\nAll encodings saved to experiments/output/\n");

  // Step 4: Run LLM experiment if API key available
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log(
      "ANTHROPIC_API_KEY not set — encodings saved. Skipping LLM comparison.\n",
    );
    console.log("To run the full experiment:");
    console.log(
      "  ANTHROPIC_API_KEY=sk-... npx tsx experiments/visual-vs-text.ts\n",
    );
    printEncodingSummary(
      graph,
      singlePng,
      terrainPng,
      infraPng,
      labelsPng,
      textContent,
    );
    return;
  }

  const client = new Anthropic({ apiKey });
  const pngData = {
    single: singlePng.toString("base64"),
    terrain: terrainPng.toString("base64"),
    infra: infraPng.toString("base64"),
    labels: labelsPng.toString("base64"),
  };

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
        pngData,
        textContent,
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
  const resultsPath = path.join(outputDir, "experiment-2-results.json");
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to ${resultsPath}`);

  printComparison(results);
}

async function queryCondition(
  client: Anthropic,
  conditionId: ConditionId,
  question: string,
  pngData: { single: string; terrain: string; infra: string; labels: string },
  textContent: string,
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

    case "single-visual":
      content.push(
        {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: pngData.single,
          },
        },
        {
          type: "text",
          text: `You are looking at a visual encoding of a software project's architecture. The encoding uses:
- Position: spatial clustering shows module boundaries
- Shape: circles=utilities, rectangles=pages, diamonds=API routes, hexagons=schemas, triangles=tests
- Size: larger nodes are more complex
- Color: orange=pages, red=API routes, blue=components, teal=schemas, dark=utilities, gray=tests
- Lines: connections show import dependencies
- Density: tightly packed areas have high coupling

Based on this visual encoding, answer this question:
${question}

Be specific. Reference what you can see in the encoding.`,
        },
      );
      break;

    case "3-layer":
      content.push(
        {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: pngData.terrain,
          },
        },
        {
          type: "text",
          text: "LAYER 1 — TERRAIN: This topographic view shows complexity contours. Dense contour lines = complex areas. Color gradient from green (simple) to red (complex). Dot sizes show individual file complexity.",
        },
        {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: pngData.infra,
          },
        },
        {
          type: "text",
          text: "LAYER 2 — INFRASTRUCTURE: This shows data flow and dependencies. Colored lines = flow types (orange=auth, red=payment, blue=data, green=rendering). Line thickness = coupling strength. Diamonds = API entry points with route labels.",
        },
        {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: pngData.labels,
          },
        },
        {
          type: "text",
          text: `LAYER 3 — LABELS: This shows precise details at each node position — file names, exports, HTTP methods, line counts, and test coverage (✓).

All three layers use the SAME spatial layout. Cross-reference them: complexity hotspots (L1) align with the dependency roads (L2) and file names (L3).

Based on these three topographic layers, answer this question:
${question}

Be specific. Reference details from all three layers where relevant.`,
        },
      );
      break;

    case "terrain-text":
      content.push(
        {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: pngData.terrain,
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

    case "terrain-infra":
      content.push(
        {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: pngData.terrain,
          },
        },
        {
          type: "text",
          text: "LAYER 1 — TERRAIN: Complexity contours. Dense rings = complex areas. Green = simple, red = complex.",
        },
        {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: pngData.infra,
          },
        },
        {
          type: "text",
          text: `LAYER 2 — INFRASTRUCTURE: Data flow and dependencies. Colored lines show flow types (orange=auth, red=payment, blue=data, green=rendering). Diamonds = API routes with labels. Line thickness = coupling strength.

Both layers use the SAME spatial layout. Note: you do NOT have file-level labels — you must infer details from the visual signals (complexity, flow patterns, API labels).

Based on these two layers, answer this question:
${question}

Be specific about what you can see and what you're inferring.`,
        },
      );
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

function printComparison(results: QuestionResult[]): void {
  console.log("\n\n========================================");
  console.log("EXPERIMENT 2 RESULTS: Multi-Layer Topographic");
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

  console.log(
    "\n(Review experiments/output/experiment-2-results.json for full responses)",
  );
}

function printEncodingSummary(
  graph: ReturnType<typeof scanCodebase>,
  singlePng: Buffer,
  terrainPng: Buffer,
  infraPng: Buffer,
  labelsPng: Buffer,
  textContent: string,
): void {
  console.log("=== ENCODING SIZES ===");
  console.log(
    `  Single visual PNG:    ${(singlePng.length / 1024).toFixed(1)} KB`,
  );
  console.log(
    `  Layer 1 (terrain):    ${(terrainPng.length / 1024).toFixed(1)} KB`,
  );
  console.log(
    `  Layer 2 (infra):      ${(infraPng.length / 1024).toFixed(1)} KB`,
  );
  console.log(
    `  Layer 3 (labels):     ${(labelsPng.length / 1024).toFixed(1)} KB`,
  );
  console.log(
    `  3 layers combined:    ${((terrainPng.length + infraPng.length + labelsPng.length) / 1024).toFixed(1)} KB`,
  );
  console.log(
    `  Text encoding:        ${(textContent.length / 1024).toFixed(1)} KB (~${Math.ceil(textContent.length / 4)} tokens)\n`,
  );

  console.log("=== SCAN SUMMARY ===");
  console.log(`  Project: ${graph.projectName} (${graph.framework})`);
  console.log(`  Files: ${graph.totalFiles}`);
  console.log(`  Lines: ${graph.totalLines.toLocaleString()}`);
  console.log(`  Modules: ${graph.modules.length}`);
  console.log(
    `  API Routes: ${graph.nodes.filter((n) => n.type === "api-route").length}`,
  );
  console.log(
    `  Pages: ${graph.nodes.filter((n) => n.type === "route").length}`,
  );
  console.log(
    `  Components: ${graph.nodes.filter((n) => n.type === "component").length}`,
  );
  console.log(`  Edges: ${graph.edges.length}`);
}

// Run it
runExperiment().catch(console.error);
