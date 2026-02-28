/**
 * Layer 1 — Terrain (Complexity Topography)
 *
 * Encodes: Module boundaries and complexity as contour lines.
 * - Dense contour lines = complex areas (many files, high coupling)
 * - Sparse contour lines = simple modules
 * - Color gradient green (simple) → yellow → red (complex)
 * - Module boundaries as labeled regions
 * - NO file-level text labels — pure visual signal
 *
 * What the LLM learns: Where the "mountains" are. Which areas are
 * flat/simple vs steep/complex. At a glance.
 */

import type { StrandGraph } from "../scanner/index.js";
import {
  computeLayout,
  escapeXml,
  lerpColor,
  type CanvasLayout,
  type LayoutModule,
  type LayoutNode,
} from "./layout.js";

// Complexity color ramp: green → yellow → orange → red
const COMPLEXITY_COLORS = [
  "#2D6A4F",
  "#52B788",
  "#B5E48C",
  "#FED766",
  "#F4845F",
  "#E63946",
];

/**
 * Get a color from the complexity ramp (t: 0-1)
 * 0 = deep green (simple), 1 = hot red (complex)
 */
function complexityColor(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const segmentCount = COMPLEXITY_COLORS.length - 1;
  const segment = Math.min(
    Math.floor(clamped * segmentCount),
    segmentCount - 1,
  );
  const localT = clamped * segmentCount - segment;
  return lerpColor(
    COMPLEXITY_COLORS[segment]!,
    COMPLEXITY_COLORS[segment + 1]!,
    localT,
  );
}

export function encodeTerrainSVG(graph: StrandGraph): string {
  const layout = computeLayout(graph);
  return renderTerrain(layout, graph);
}

export function encodeTerrainSVGFromLayout(
  layout: CanvasLayout,
  graph: StrandGraph,
): string {
  return renderTerrain(layout, graph);
}

function renderTerrain(layout: CanvasLayout, graph: StrandGraph): string {
  const { width, height, modules } = layout;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
<style>
  text { font-family: monospace; }
  .layer-title { font-size: 14px; font-weight: bold; fill: #111; }
  .layer-subtitle { font-size: 10px; fill: #666; }
  .module-label { font-size: 11px; font-weight: bold; fill: #333; opacity: 0.8; }
</style>
<rect width="100%" height="100%" fill="#F8F9FA"/>
`;

  // Title
  svg += `<text x="60" y="30" class="layer-title">L1: Terrain — ${escapeXml(graph.projectName)}</text>\n`;
  svg += `<text x="60" y="45" class="layer-subtitle">Complexity topography · Dense contours = complex areas</text>\n`;

  // Draw modules as elevation regions with contour lines
  for (const mod of modules) {
    svg += drawModuleTerrain(mod, graph);
  }

  // Draw complexity heat dots at each node position (NO labels)
  for (const node of layout.allNodes) {
    svg += drawComplexityDot(node);
  }

  // Legend — complexity ramp
  svg += drawTerrainLegend(width - 180, 10);

  svg += `</svg>`;
  return svg;
}

/**
 * Draw a module as an elevation region with contour lines.
 * More complex modules get denser contour lines and warmer colors.
 */
function drawModuleTerrain(mod: LayoutModule, graph: StrandGraph): string {
  let svg = "";

  // Module background — colored by average complexity
  const bgColor = complexityColor(mod.avgComplexity * 0.5); // muted base color
  svg += `<rect x="${mod.x}" y="${mod.y}" width="${mod.width}" height="${mod.height}" rx="8" fill="${bgColor}" opacity="0.15" stroke="${bgColor}" stroke-width="1.5" stroke-opacity="0.4"/>\n`;

  // Contour lines — number of rings based on complexity and node count
  // More nodes + higher complexity = more contour rings (max 6)
  const contourCount = Math.min(
    Math.max(1, Math.round(mod.avgComplexity * 5 + mod.nodes.length / 8)),
    6,
  );

  const cx = mod.x + mod.width / 2;
  const cy = mod.y + mod.height / 2 + 5;
  const maxRx = (mod.width / 2) * 0.85;
  const maxRy = (mod.height / 2) * 0.85;

  for (let i = contourCount; i >= 1; i--) {
    const t = i / contourCount;
    const rx = maxRx * t;
    const ry = maxRy * t;
    const ringColor = complexityColor(mod.avgComplexity * t);
    const opacity = 0.1 + (1 - t) * 0.2; // inner rings more visible

    svg += `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${ringColor}" stroke-width="1" opacity="${opacity.toFixed(2)}"/>\n`;
  }

  // Inner fill — a small filled ellipse at the center showing "peak" elevation
  const peakRx = maxRx * 0.15;
  const peakRy = maxRy * 0.15;
  const peakColor = complexityColor(mod.avgComplexity);
  svg += `<ellipse cx="${cx}" cy="${cy}" rx="${peakRx}" ry="${peakRy}" fill="${peakColor}" opacity="0.3"/>\n`;

  // Module label — positioned at top-left of module
  svg += `<text x="${mod.x + 8}" y="${mod.y + 16}" class="module-label">${escapeXml(mod.name)}</text>\n`;

  return svg;
}

/**
 * Draw a dot at each node's position, sized and colored by complexity.
 * No labels — this is pure visual signal.
 */
function drawComplexityDot(node: LayoutNode): string {
  const color = complexityColor(node.complexity);
  const r = 2 + node.complexity * 6; // 2px min, 8px max
  return `<circle cx="${node.x.toFixed(1)}" cy="${node.y.toFixed(1)}" r="${r.toFixed(1)}" fill="${color}" opacity="0.7"/>\n`;
}

function drawTerrainLegend(x: number, y: number): string {
  let svg = `<g transform="translate(${x},${y})">\n`;
  svg += `<rect x="0" y="0" width="170" height="90" rx="4" fill="white" stroke="#DEE2E6" stroke-width="1" opacity="0.9"/>\n`;
  svg += `<text x="8" y="14" font-family="monospace" font-size="9" font-weight="bold" fill="#333">Complexity</text>\n`;

  // Gradient bar
  const barY = 22;
  const barWidth = 154;
  const barHeight = 12;
  const steps = 20;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const color = complexityColor(t);
    const segWidth = barWidth / steps;
    svg += `<rect x="${8 + i * segWidth}" y="${barY}" width="${segWidth + 0.5}" height="${barHeight}" fill="${color}"/>\n`;
  }
  svg += `<text x="8" y="${barY + barHeight + 12}" font-family="monospace" font-size="7" fill="#666">Simple</text>\n`;
  svg += `<text x="${barWidth - 24}" y="${barY + barHeight + 12}" font-family="monospace" font-size="7" fill="#666">Complex</text>\n`;

  // Contour explanation
  svg += `<text x="8" y="62" font-family="monospace" font-size="7" fill="#666">Dense contours = high complexity</text>\n`;
  svg += `<text x="8" y="72" font-family="monospace" font-size="7" fill="#666">Sparse contours = low complexity</text>\n`;
  svg += `<text x="8" y="82" font-family="monospace" font-size="7" fill="#666">Dot size = file complexity</text>\n`;

  svg += `</g>\n`;
  return svg;
}
