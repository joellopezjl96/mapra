/**
 * Spatial Text Encoder — structured text with @(x,y) coordinate annotations
 *
 * Hypothesis: LLMs can reason about 2D proximity from coordinate numbers
 * ("these two nodes at (280,180) and (290,195) are close together")
 * without needing an actual image.
 *
 * Uses the same layout engine as the PNG layers — identical coordinates.
 * Same section structure as text-encode.ts, enhanced with position tags.
 */

import type { StrandGraph } from "../scanner/index.js";
import {
  computeLayout,
  type CanvasLayout,
  type LayoutModule,
} from "./layout.js";

/**
 * Generate spatial text encoding with @(x,y) annotations.
 * Accepts a pre-computed layout for consistency with other encoders.
 */
export function encodeSpatialTextFromLayout(
  layout: CanvasLayout,
  graph: StrandGraph,
): string {
  return renderSpatialText(layout, graph);
}

/**
 * Generate spatial text encoding, computing layout internally.
 */
export function encodeSpatialText(graph: StrandGraph): string {
  const layout = computeLayout(graph);
  return renderSpatialText(layout, graph);
}

function renderSpatialText(layout: CanvasLayout, graph: StrandGraph): string {
  let text = "";

  // Header with canvas dimensions
  text += `# ${graph.projectName} — Spatial Encoding\n`;
  text += `# Canvas: ${layout.width}×${layout.height} | ${graph.totalFiles} files | ${graph.totalLines.toLocaleString()} lines | ${graph.modules.length} modules\n`;
  text += `# Positions encode spatial layout — nearby coordinates = related code\n\n`;

  // Modules with @(x,y) and dimensions
  text += `## Modules\n`;
  for (const mod of layout.modules.sort(
    (a, b) => b.totalLines - a.totalLines,
  )) {
    const entryCount =
      graph.modules.find((m) => m.id === mod.id)?.entryPoints.length ?? 0;
    const modBoundary = graph.modules.find((m) => m.id === mod.id);
    const modPath = modBoundary?.path ?? mod.id;
    text += `- ${mod.name} (${modPath}) @(${Math.round(mod.x)},${Math.round(mod.y)}) ${Math.round(mod.width)}×${Math.round(mod.height)}: ${mod.nodes.length} files, ${mod.totalLines.toLocaleString()} lines [complexity: ${mod.avgComplexity.toFixed(2)}]`;
    if (entryCount > 0) text += ` [${entryCount} entry points]`;
    text += `\n`;
  }

  // API Routes with @(x,y)
  const apiRoutes = graph.nodes
    .filter((n) => n.type === "api-route")
    .sort((a, b) => b.complexity - a.complexity);

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
      const layoutNode = layout.nodes.get(route.id);
      const pos = layoutNode
        ? ` @(${Math.round(layoutNode.x)},${Math.round(layoutNode.y)})`
        : "";
      text += `- ${methods} ${routePath}${pos} ${route.lines}L complexity:${route.complexity.toFixed(2)}`;
      if (route.imports.length > 8)
        text += ` — ${route.imports.length} imports`;
      text += `\n`;
    }
  }

  // Pages with @(x,y)
  const pages = graph.nodes
    .filter((n) => n.type === "route")
    .sort((a, b) => b.complexity - a.complexity);

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
      const layoutNode = layout.nodes.get(page.id);
      const pos = layoutNode
        ? ` @(${Math.round(layoutNode.x)},${Math.round(layoutNode.y)})`
        : "";
      text += `- ${routePath}${client}${pos} ${page.lines}L complexity:${page.complexity.toFixed(2)}\n`;
    }
  }

  // Components (top 20) with @(x,y)
  const components = graph.nodes.filter((n) => n.type === "component");
  if (components.length > 0) {
    text += `\n## Components (${components.length})\n`;
    for (const comp of components
      .sort((a, b) => b.complexity - a.complexity)
      .slice(0, 20)) {
      const layoutNode = layout.nodes.get(comp.id);
      const pos = layoutNode
        ? ` @(${Math.round(layoutNode.x)},${Math.round(layoutNode.y)})`
        : "";
      text += `- ${comp.name}${pos} ${comp.lines}L complexity:${comp.complexity.toFixed(2)}\n`;
    }
    if (components.length > 20) {
      text += `  ... and ${components.length - 20} more\n`;
    }
  }

  // Inter-module flows with from/to coordinates
  text += `\n## Flows (inter-module edges)\n`;
  const moduleEdges = aggregateModuleEdges(layout, graph);
  for (const edge of moduleEdges) {
    const lineStyle =
      edge.count >= 10 ? "═══" : edge.count >= 5 ? "───" : "···";
    const categories = Object.entries(edge.categories)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, count]) => `${cat}:${count}`)
      .join(" ");
    text += `- ${edge.fromName} @(${edge.fromX},${edge.fromY}) ${lineStyle}> ${edge.toName} @(${edge.toX},${edge.toY}): ${edge.count} edges [${categories}]\n`;
  }

  // Complexity hotspots with @(x,y)
  const complex = graph.nodes
    .filter((n) => n.type !== "test" && n.type !== "config")
    .sort((a, b) => b.complexity - a.complexity)
    .slice(0, 10);

  text += `\n## Complexity Hotspots\n`;
  for (const node of complex) {
    const layoutNode = layout.nodes.get(node.id);
    const pos = layoutNode
      ? `@(${Math.round(layoutNode.x)},${Math.round(layoutNode.y)}) `
      : "";
    text += `- ${pos}${node.path} — ${node.lines}L, ${node.imports.length} imports\n`;
  }

  // Most depended-on files with @(x,y)
  const edgeCounts = new Map<string, number>();
  for (const edge of graph.edges) {
    edgeCounts.set(edge.to, (edgeCounts.get(edge.to) || 0) + 1);
  }
  const mostImported = [...edgeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  if (mostImported.length > 0) {
    text += `\n## Most Depended-On\n`;
    for (const [fileId, count] of mostImported) {
      const layoutNode = layout.nodes.get(fileId);
      const pos = layoutNode
        ? ` @(${Math.round(layoutNode.x)},${Math.round(layoutNode.y)})`
        : "";
      text += `- ${fileId}${pos} — imported by ${count}\n`;
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
      ? ((testedFiles.size / testableFiles.length) * 100).toFixed(1)
      : "0";

  text += `\n## Test Coverage\n`;
  text += `${testEdges.length} test files | ${testedFiles.size}/${testableFiles.length} testable files with direct test edges (${coveragePercent}%)\n`;

  return text;
}

interface ModuleEdgeAggregate {
  fromName: string;
  fromX: number;
  fromY: number;
  toName: string;
  toX: number;
  toY: number;
  count: number;
  categories: Record<string, number>;
}

function aggregateModuleEdges(
  layout: CanvasLayout,
  graph: StrandGraph,
): ModuleEdgeAggregate[] {
  const modMap = new Map(layout.modules.map((m) => [m.id, m]));
  const edgeMap = new Map<string, ModuleEdgeAggregate>();

  for (const edge of graph.edges) {
    const fromNode = layout.nodes.get(edge.from);
    const toNode = layout.nodes.get(edge.to);
    if (!fromNode || !toNode) continue;
    if (fromNode.moduleId === toNode.moduleId) continue;

    const key = `${fromNode.moduleId}->${toNode.moduleId}`;
    if (!edgeMap.has(key)) {
      const fromMod = modMap.get(fromNode.moduleId);
      const toMod = modMap.get(toNode.moduleId);
      if (!fromMod || !toMod) continue;
      edgeMap.set(key, {
        fromName: fromMod.name,
        fromX: Math.round(fromMod.x),
        fromY: Math.round(fromMod.y),
        toName: toMod.name,
        toX: Math.round(toMod.x),
        toY: Math.round(toMod.y),
        count: 0,
        categories: {},
      });
    }

    const agg = edgeMap.get(key)!;
    agg.count++;

    // Classify the edge
    const category = classifyEdge(edge.from, edge.to);
    agg.categories[category] = (agg.categories[category] || 0) + 1;
  }

  return [...edgeMap.values()].sort((a, b) => b.count - a.count);
}

function classifyEdge(fromPath: string, toPath: string): string {
  const combined = fromPath + " " + toPath;
  if (/auth|session|login|magic-link|trusted-device|verify/.test(combined))
    return "auth";
  if (/payment|authorize|order|cart|price|tip/.test(combined)) return "payment";
  if (/test|spec|__tests__/.test(combined)) return "test";
  if (/component|page|layout|\.tsx$/.test(combined)) return "rendering";
  return "data";
}
