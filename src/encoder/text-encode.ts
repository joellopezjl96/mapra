/**
 * Text Encoder — generates a structured text representation of the same graph
 * Used as the baseline comparison for the visual encoding experiment.
 * This represents "the best text can do" — well-structured YAML-like format.
 */

import type { StrandGraph } from "../scanner/index.js";
import type { GraphAnalysis } from "../analyzer/index.js";

export function encodeToText(graph: StrandGraph, analysis?: GraphAnalysis): string {
  let text = "";

  // Layer 0: Identity
  text += `# ${graph.projectName}\n`;
  text += `Framework: ${graph.framework}\n`;
  text += `Files: ${graph.totalFiles} | Lines: ${graph.totalLines.toLocaleString()}\n`;
  text += `Modules: ${graph.modules.length}\n\n`;

  // Layer 1: Module overview
  text += `## Modules\n`;
  for (const mod of graph.modules.sort((a, b) => b.totalLines - a.totalLines)) {
    const entryCount = mod.entryPoints.length;
    text += `- ${mod.name} (${mod.path}): ${mod.nodeCount} files, ${mod.totalLines} lines`;
    if (entryCount > 0) text += ` [${entryCount} entry points]`;
    text += `\n`;
  }

  // Risk analysis
  if (analysis && analysis.risk.length > 0) {
    text += `\n## Risk (Change With Care)\n`;
    const top = analysis.risk.slice(0, 8);
    for (const r of top) {
      text += `- ${r.nodeId}: ${r.affectedCount} affected, depth ${r.maxDepth}, ${r.modulesAffected} modules, amp ${r.amplificationRatio.toFixed(1)}\n`;
    }
    const remaining = analysis.risk.length - top.length;
    if (remaining > 0) {
      text += `  ... and ${remaining} more with blast radius > 1\n`;
    }
  }

  // Layer 2: Routes and API
  const apiRoutes = graph.nodes.filter((n) => n.type === "api-route");
  const pages = graph.nodes.filter((n) => n.type === "route");

  if (apiRoutes.length > 0) {
    text += `\n## API Routes (${apiRoutes.length})\n`;
    for (const route of apiRoutes) {
      const methods =
        (route.framework?.metadata as { methods?: string[] })?.methods?.join(
          ", ",
        ) || "?";
      const routePath =
        (route.framework?.metadata as { routePath?: string })?.routePath ||
        route.path;
      text += `- ${methods} ${routePath} (${route.lines} lines)\n`;
    }
  }

  if (pages.length > 0) {
    text += `\n## Pages (${pages.length})\n`;
    for (const page of pages) {
      const routePath =
        (page.framework?.metadata as { routePath?: string })?.routePath ||
        page.path;
      const client = (
        page.framework?.metadata as { isClientComponent?: boolean }
      )?.isClientComponent
        ? " [client]"
        : "";
      text += `- ${routePath}${client} (${page.lines} lines)\n`;
    }
  }

  // Components
  const components = graph.nodes.filter((n) => n.type === "component");
  if (components.length > 0) {
    text += `\n## Components (${components.length})\n`;
    for (const comp of components
      .sort((a, b) => b.complexity - a.complexity)
      .slice(0, 20)) {
      text += `- ${comp.name} (${comp.lines} lines, complexity: ${comp.complexity.toFixed(2)})\n`;
    }
    if (components.length > 20) {
      text += `  ... and ${components.length - 20} more\n`;
    }
  }

  // Schema
  const schemas = graph.nodes.filter((n) => n.type === "schema");
  if (schemas.length > 0) {
    text += `\n## Data Schema\n`;
    for (const schema of schemas) {
      const models =
        (schema.framework?.metadata as { models?: string[] })?.models || [];
      text += `- ${schema.name}: ${models.length} models (${models.join(", ")})\n`;
    }
  }

  // High-complexity files
  const complex = graph.nodes
    .filter((n) => n.type !== "test" && n.type !== "config")
    .sort((a, b) => b.complexity - a.complexity)
    .slice(0, 10);

  text += `\n## Complexity Hotspots (top 10)\n`;
  for (const node of complex) {
    text += `- ${node.path} (${node.lines} lines, ${node.imports.length} imports)\n`;
  }

  // Dependencies — most connected files
  const edgeCounts = new Map<string, number>();
  for (const edge of graph.edges) {
    edgeCounts.set(edge.to, (edgeCounts.get(edge.to) || 0) + 1);
  }
  const mostImported = [...edgeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  if (mostImported.length > 0) {
    text += `\n## Most Depended-On Files\n`;
    for (const [fileId, count] of mostImported) {
      text += `- ${fileId} (imported by ${count} files)\n`;
    }
  }

  // Test coverage
  const testEdges = graph.edges.filter((e) => e.type === "tests");
  const testedFiles = new Set(testEdges.map((e) => e.to));
  const testableFiles = graph.nodes.filter(
    (n) => n.type !== "test" && n.type !== "config",
  );
  const coveragePercent =
    testableFiles.length > 0
      ? ((testedFiles.size / testableFiles.length) * 100).toFixed(0)
      : "0";

  text += `\n## Test Coverage\n`;
  text += `${testEdges.length} test files covering ${testedFiles.size}/${testableFiles.length} files (${coveragePercent}%)\n`;

  return text;
}
