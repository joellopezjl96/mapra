/**
 * Quick validation: scan a codebase, run blast radius analysis, encode with RISK section.
 * Usage: npx tsx experiments/validate-blast-radius.ts [path-to-codebase]
 */

import { scanCodebase } from "../src/scanner/index.js";
import { analyzeGraph } from "../src/analyzer/index.js";
import { encodeToStrandFormat } from "../src/encoder/strand-format-encode.js";
import { encodeToText } from "../src/encoder/text-encode.js";

const target = process.argv[2] || "C:\\dev\\SenorBurritoCompany";

console.log(`Scanning: ${target}\n`);
const graph = scanCodebase(target);
console.log(`Graph: ${graph.totalFiles} files, ${graph.edges.length} edges\n`);

console.log("Running blast radius analysis...\n");
const analysis = analyzeGraph(graph);

console.log(`Found ${analysis.risk.length} nodes with blast radius > 1\n`);

// Show top 10 raw results
console.log("=== Top 10 Blast Radius ===");
for (const r of analysis.risk.slice(0, 10)) {
  console.log(
    `  ${r.nodeId.padEnd(45)} affected=${r.affectedCount} depth=${r.maxDepth} direct=${r.directImporters} modules=${r.modulesAffected} amp=${r.amplificationRatio}`,
  );
}

console.log("\n\n=== .strand v2 Output (with RISK) ===\n");
const strandOutput = encodeToStrandFormat(graph, analysis);
console.log(strandOutput);

console.log("\n\n=== Text Output (with Risk) ===\n");
const textOutput = encodeToText(graph, analysis);
console.log(textOutput);

// Also test backward compat: no analysis
console.log("\n\n=== Backward Compat (no analysis) ===\n");
const noAnalysis = encodeToStrandFormat(graph);
const hasRisk = noAnalysis.includes("RISK");
console.log(`RISK section present without analysis: ${hasRisk} (should be false)`);
