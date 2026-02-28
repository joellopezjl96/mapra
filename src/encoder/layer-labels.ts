/**
 * Layer 3 — Labels (Precise Detail)
 *
 * Encodes: File names, function signatures, HTTP methods, model names.
 * - Each node labeled with file name and key exports
 * - API routes with HTTP methods (GET, POST, etc.)
 * - Prisma models with field counts
 * - Test coverage indicators
 * - High-resolution, text-focused, minimal visual noise
 *
 * What the LLM learns: The precise details that Layer 1 and 2 can't show.
 * File paths, function names, exact counts.
 */

import type { StrandGraph } from "../scanner/index.js";
import {
  computeLayout,
  escapeXml,
  TYPE_COLORS,
  type CanvasLayout,
  type LayoutModule,
  type LayoutNode,
} from "./layout.js";

export function encodeLabelsSVG(graph: StrandGraph): string {
  const layout = computeLayout(graph);
  return renderLabels(layout, graph);
}

export function encodeLabelsSVGFromLayout(
  layout: CanvasLayout,
  graph: StrandGraph,
): string {
  return renderLabels(layout, graph);
}

function renderLabels(layout: CanvasLayout, graph: StrandGraph): string {
  const { width, height, modules } = layout;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
<style>
  text { font-family: monospace; }
  .layer-title { font-size: 14px; font-weight: bold; fill: #111; }
  .layer-subtitle { font-size: 10px; fill: #666; }
  .module-header { font-size: 11px; font-weight: bold; fill: #111; }
  .module-stats { font-size: 8px; fill: #888; }
  .file-label { font-size: 7px; fill: #333; }
  .export-label { font-size: 6px; fill: #666; }
  .method-badge { font-size: 6px; font-weight: bold; }
  .type-indicator { font-size: 6px; fill: #999; }
</style>
<rect width="100%" height="100%" fill="#F8F9FA"/>
`;

  // Title
  svg += `<text x="60" y="30" class="layer-title">L3: Labels — ${escapeXml(graph.projectName)}</text>\n`;
  svg += `<text x="60" y="45" class="layer-subtitle">${graph.totalFiles} files · ${graph.totalLines.toLocaleString()} lines · ${graph.modules.length} modules</text>\n`;

  // Compute test coverage map for indicators
  const testedFiles = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.type === "tests") {
      testedFiles.add(edge.to);
    }
  }

  // Draw each module with detailed labels
  for (const mod of modules) {
    svg += drawModuleLabels(mod, testedFiles);
  }

  // Legend — type abbreviations
  svg += drawLabelsLegend(width - 180, 10);

  svg += `</svg>`;
  return svg;
}

function drawModuleLabels(mod: LayoutModule, testedFiles: Set<string>): string {
  let svg = "";

  // Module boundary — light dashed outline
  svg += `<rect x="${mod.x}" y="${mod.y}" width="${mod.width}" height="${mod.height}" rx="8" fill="white" stroke="#DEE2E6" stroke-width="1" opacity="0.5"/>\n`;

  // Module header with stats
  svg += `<text x="${mod.x + 8}" y="${mod.y + 14}" class="module-header">${escapeXml(mod.name)}/</text>\n`;
  svg += `<text x="${mod.x + 8}" y="${mod.y + 24}" class="module-stats">${mod.nodes.length} files · ${mod.totalLines} lines</text>\n`;

  // Label each node
  for (const node of mod.nodes) {
    svg += drawNodeLabel(node, testedFiles);
  }

  return svg;
}

/**
 * Draw a label at each node position with:
 * - Tiny type-colored dot (for spatial reference)
 * - File name (without extension)
 * - Key exports or metadata (HTTP methods, models)
 * - Test coverage indicator
 */
function drawNodeLabel(node: LayoutNode, testedFiles: Set<string>): string {
  let svg = "";

  // Tiny dot for spatial reference (matches node position from other layers)
  svg += `<circle cx="${node.x.toFixed(1)}" cy="${node.y.toFixed(1)}" r="2" fill="${node.color}" opacity="0.5"/>\n`;

  const shortName = node.name.replace(/\.(ts|tsx|js|jsx|prisma)$/, "");
  const isTested = testedFiles.has(node.id);

  // Build label parts
  const parts: string[] = [];

  // Type prefix
  const typePrefix = getTypePrefix(node.type);

  // For API routes: show HTTP methods
  if (node.type === "api-route") {
    const methods =
      (node.framework?.metadata as { methods?: string[] })?.methods ?? [];
    const routePath =
      (node.framework?.metadata as { routePath?: string })?.routePath ?? "";
    parts.push(`${methods.join(",")} ${routePath}`);
  } else if (node.type === "route") {
    const routePath =
      (node.framework?.metadata as { routePath?: string })?.routePath ?? "";
    const isClient = (
      node.framework?.metadata as { isClientComponent?: boolean }
    )?.isClientComponent;
    parts.push(routePath || shortName);
    if (isClient) parts.push("[client]");
  } else if (node.type === "schema") {
    const models =
      (node.framework?.metadata as { models?: string[] })?.models ?? [];
    if (models.length > 0) {
      parts.push(`${models.length} models: ${models.slice(0, 4).join(", ")}`);
      if (models.length > 4) parts.push(`+${models.length - 4}`);
    }
  } else {
    parts.push(shortName);
  }

  // Main label
  const mainLabel = `${typePrefix} ${parts.join(" ")}`;
  const labelColor = node.type === "api-route" ? "#E63946" : "#333";
  svg += `<text x="${(node.x + 5).toFixed(1)}" y="${(node.y + 1).toFixed(1)}" class="file-label" fill="${labelColor}">${escapeXml(mainLabel)}</text>\n`;

  // Key exports (for non-routes, show top 3 exports)
  if (
    node.type !== "api-route" &&
    node.type !== "route" &&
    node.exports.length > 0
  ) {
    const exportList = node.exports.slice(0, 3).join(", ");
    const suffix =
      node.exports.length > 3 ? ` +${node.exports.length - 3}` : "";
    svg += `<text x="${(node.x + 5).toFixed(1)}" y="${(node.y + 8).toFixed(1)}" class="export-label">→ ${escapeXml(exportList + suffix)}</text>\n`;
  }

  // Lines count + test indicator
  const meta = `${node.lines}L`;
  const testMark = isTested ? " ✓" : "";
  svg += `<text x="${(node.x + 5).toFixed(1)}" y="${(node.y + (node.exports.length > 0 ? 15 : 8)).toFixed(1)}" class="type-indicator">${meta}${testMark}</text>\n`;

  return svg;
}

function getTypePrefix(type: string): string {
  switch (type) {
    case "api-route":
      return "◆";
    case "route":
      return "▪";
    case "component":
      return "●";
    case "layout":
      return "◻";
    case "middleware":
      return "◈";
    case "schema":
      return "⬡";
    case "test":
      return "▲";
    case "config":
      return "⚙";
    default:
      return "○";
  }
}

function drawLabelsLegend(x: number, y: number): string {
  let svg = `<g transform="translate(${x},${y})">\n`;
  svg += `<rect x="0" y="0" width="170" height="130" rx="4" fill="white" stroke="#DEE2E6" stroke-width="1" opacity="0.9"/>\n`;
  svg += `<text x="8" y="14" font-family="monospace" font-size="9" font-weight="bold" fill="#333">Node Types</text>\n`;

  const items = [
    { prefix: "◆", label: "API Route", color: TYPE_COLORS["api-route"]! },
    { prefix: "▪", label: "Page/Route", color: TYPE_COLORS.route! },
    { prefix: "●", label: "Component", color: TYPE_COLORS.component! },
    { prefix: "⬡", label: "Schema", color: TYPE_COLORS.schema! },
    { prefix: "○", label: "Utility", color: TYPE_COLORS.utility! },
    { prefix: "▲", label: "Test", color: TYPE_COLORS.test! },
  ];

  items.forEach((item, i) => {
    const iy = 28 + i * 14;
    svg += `<text x="8" y="${iy}" font-family="monospace" font-size="8" fill="${item.color}">${item.prefix}</text>\n`;
    svg += `<text x="20" y="${iy}" font-family="monospace" font-size="8" fill="#555">${item.label}</text>\n`;
  });

  svg += `<text x="8" y="118" font-family="monospace" font-size="7" fill="#888">✓ = has test coverage</text>\n`;

  svg += `</g>\n`;
  return svg;
}
