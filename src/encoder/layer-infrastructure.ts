/**
 * Layer 2 — Infrastructure (Data Flow & Routes)
 *
 * Encodes: Dependency paths, API routes, data flow directions.
 * - Lines connecting modules = import dependencies (thicker = stronger coupling)
 * - Arrows showing data flow direction (request → processing → response)
 * - API entry points as labeled markers
 * - Color-coded by flow type: auth (orange), payment (red), data (blue), rendering (green)
 *
 * What the LLM learns: How things connect. Which routes go through
 * which terrain. Where the critical paths are.
 */

import type { StrandGraph, StrandEdge } from "../scanner/index.js";
import {
  computeLayout,
  escapeXml,
  type CanvasLayout,
  type LayoutNode,
  type LayoutModule,
} from "./layout.js";

// Flow type classification based on path patterns
interface FlowType {
  name: string;
  color: string;
  /** Patterns that identify this flow in file paths */
  pathPatterns: RegExp[];
}

const FLOW_TYPES: FlowType[] = [
  {
    name: "auth",
    color: "#F4A261", // warm orange
    pathPatterns: [
      /auth/,
      /session/,
      /login/,
      /magic-link/,
      /trusted-device/,
      /verify/,
    ],
  },
  {
    name: "payment",
    color: "#E63946", // red
    pathPatterns: [/payment/, /authorize/, /order/, /cart/, /price/, /tip/],
  },
  {
    name: "data",
    color: "#457B9D", // blue
    pathPatterns: [/prisma/, /schema/, /queries/, /api\//, /lib\//],
  },
  {
    name: "rendering",
    color: "#52B788", // green
    pathPatterns: [/component/, /page/, /layout/, /\.tsx$/],
  },
];

/** Classify an edge into a flow type based on the source and target paths */
function classifyFlow(fromPath: string, toPath: string): FlowType {
  const combined = fromPath + " " + toPath;
  for (const flow of FLOW_TYPES) {
    if (flow.pathPatterns.some((p) => p.test(combined))) {
      return flow;
    }
  }
  // Default: data flow
  return FLOW_TYPES[2]!; // blue/data
}

export function encodeInfrastructureSVG(graph: StrandGraph): string {
  const layout = computeLayout(graph);
  return renderInfrastructure(layout, graph);
}

export function encodeInfrastructureSVGFromLayout(
  layout: CanvasLayout,
  graph: StrandGraph,
): string {
  return renderInfrastructure(layout, graph);
}

function renderInfrastructure(
  layout: CanvasLayout,
  graph: StrandGraph,
): string {
  const { width, height, modules, nodes } = layout;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
<defs>
  <marker id="arrow-auth" viewBox="0 0 10 7" refX="10" refY="3.5" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
    <polygon points="0 0, 10 3.5, 0 7" fill="${FLOW_TYPES[0]!.color}"/>
  </marker>
  <marker id="arrow-payment" viewBox="0 0 10 7" refX="10" refY="3.5" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
    <polygon points="0 0, 10 3.5, 0 7" fill="${FLOW_TYPES[1]!.color}"/>
  </marker>
  <marker id="arrow-data" viewBox="0 0 10 7" refX="10" refY="3.5" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
    <polygon points="0 0, 10 3.5, 0 7" fill="${FLOW_TYPES[2]!.color}"/>
  </marker>
  <marker id="arrow-rendering" viewBox="0 0 10 7" refX="10" refY="3.5" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
    <polygon points="0 0, 10 3.5, 0 7" fill="${FLOW_TYPES[3]!.color}"/>
  </marker>
</defs>
<style>
  text { font-family: monospace; }
  .layer-title { font-size: 14px; font-weight: bold; fill: #111; }
  .layer-subtitle { font-size: 10px; fill: #666; }
  .module-label { font-size: 10px; fill: #999; font-weight: bold; }
  .api-label { font-size: 8px; fill: #E63946; font-weight: bold; }
</style>
<rect width="100%" height="100%" fill="#F8F9FA"/>
`;

  // Title
  svg += `<text x="60" y="30" class="layer-title">L2: Infrastructure — ${escapeXml(graph.projectName)}</text>\n`;
  svg += `<text x="60" y="45" class="layer-subtitle">Data flow · Dependency roads · Color = flow type</text>\n`;

  // Faint module outlines for spatial reference
  for (const mod of modules) {
    svg += `<rect x="${mod.x}" y="${mod.y}" width="${mod.width}" height="${mod.height}" rx="8" fill="none" stroke="#DEE2E6" stroke-width="1" stroke-dasharray="4,4" opacity="0.5"/>\n`;
    svg += `<text x="${mod.x + 8}" y="${mod.y + 16}" class="module-label">${escapeXml(mod.name)}</text>\n`;
  }

  // Draw edges as flow lines with arrows
  svg += drawFlowEdges(graph.edges, nodes, modules);

  // Draw API entry points as prominent markers
  svg += drawApiMarkers(layout);

  // Legend
  svg += drawInfraLegend(width - 180, 10);

  svg += `</svg>`;
  return svg;
}

/**
 * Draw dependency edges as colored, directed flow lines.
 * Aggregates edges between modules for cleaner inter-module connections.
 */
function drawFlowEdges(
  edges: StrandEdge[],
  nodeMap: Map<string, LayoutNode>,
  modules: LayoutModule[],
): string {
  let svg = "";

  // Aggregate: count edges between each module pair for inter-module connections
  const interModuleCounts = new Map<
    string,
    { count: number; flows: Map<string, number> }
  >();

  // Draw intra-module edges faintly, collect inter-module stats
  for (const edge of edges) {
    if (edge.type === "tests") continue; // skip test edges for clarity

    const from = nodeMap.get(edge.from);
    const to = nodeMap.get(edge.to);
    if (!from || !to) continue;

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 15) continue; // skip very short edges

    const flow = classifyFlow(from.path, to.path);

    if (from.moduleId === to.moduleId) {
      // Intra-module: thin, faint lines
      svg += `<line x1="${from.x.toFixed(1)}" y1="${from.y.toFixed(1)}" x2="${to.x.toFixed(1)}" y2="${to.y.toFixed(1)}" stroke="${flow.color}" stroke-width="0.5" opacity="0.15"/>\n`;
    } else {
      // Inter-module: aggregate for thicker "road" lines
      const key = [from.moduleId, to.moduleId].sort().join("→");
      if (!interModuleCounts.has(key)) {
        interModuleCounts.set(key, { count: 0, flows: new Map() });
      }
      const agg = interModuleCounts.get(key)!;
      agg.count++;
      agg.flows.set(flow.name, (agg.flows.get(flow.name) ?? 0) + 1);
    }
  }

  // Draw inter-module "roads" — thickness based on coupling strength
  const moduleCenters = new Map<string, { x: number; y: number }>();
  for (const mod of modules) {
    moduleCenters.set(mod.id, {
      x: mod.x + mod.width / 2,
      y: mod.y + mod.height / 2,
    });
  }

  for (const [key, agg] of interModuleCounts) {
    const [modA, modB] = key.split("→");
    const centerA = moduleCenters.get(modA!);
    const centerB = moduleCenters.get(modB!);
    if (!centerA || !centerB) continue;

    // Determine dominant flow type
    let dominantFlow = "data";
    let maxCount = 0;
    for (const [flowName, count] of agg.flows) {
      if (count > maxCount) {
        dominantFlow = flowName;
        maxCount = count;
      }
    }
    const flowType =
      FLOW_TYPES.find((f) => f.name === dominantFlow) ?? FLOW_TYPES[2]!;

    // Thickness based on coupling count (1-5px)
    const thickness = Math.min(1 + agg.count * 0.5, 5);
    const opacity = Math.min(0.3 + agg.count * 0.05, 0.7);
    const markerId = `arrow-${flowType.name}`;

    // Curved path for visual appeal
    const midX = (centerA.x + centerB.x) / 2;
    const midY = (centerA.y + centerB.y) / 2;
    const dx = centerB.x - centerA.x;
    const dy = centerB.y - centerA.y;
    const curvature = 15; // subtle curve
    const ctrlX = midX - (dy / Math.sqrt(dx * dx + dy * dy)) * curvature;
    const ctrlY = midY + (dx / Math.sqrt(dx * dx + dy * dy)) * curvature;

    svg += `<path d="M${centerA.x.toFixed(1)},${centerA.y.toFixed(1)} Q${ctrlX.toFixed(1)},${ctrlY.toFixed(1)} ${centerB.x.toFixed(1)},${centerB.y.toFixed(1)}" fill="none" stroke="${flowType.color}" stroke-width="${thickness.toFixed(1)}" opacity="${opacity.toFixed(2)}" marker-end="url(#${markerId})"/>\n`;

    // Edge label: coupling count
    if (agg.count >= 3) {
      svg += `<text x="${midX.toFixed(1)}" y="${(midY - 5).toFixed(1)}" text-anchor="middle" font-family="monospace" font-size="7" fill="${flowType.color}" opacity="0.7">${agg.count}</text>\n`;
    }
  }

  return svg;
}

/**
 * Draw API route entry points as prominent diamond markers with route labels.
 * These are the "on-ramps" to the system.
 */
function drawApiMarkers(layout: CanvasLayout): string {
  let svg = "";

  for (const node of layout.allNodes) {
    if (node.type !== "api-route") continue;

    const r = 6;
    // Diamond marker
    svg += `<polygon points="${node.x},${node.y - r} ${node.x + r},${node.y} ${node.x},${node.y + r} ${node.x - r},${node.y}" fill="#E63946" stroke="#fff" stroke-width="1" opacity="0.9"/>\n`;

    // Route label
    const routePath =
      (node.framework?.metadata as { routePath?: string })?.routePath ??
      node.name;
    const methods =
      (node.framework?.metadata as { methods?: string[] })?.methods?.join(
        ",",
      ) ?? "";
    const label = methods ? `${methods} ${routePath}` : routePath;

    svg += `<text x="${node.x}" y="${node.y - r - 3}" text-anchor="middle" class="api-label">${escapeXml(label)}</text>\n`;
  }

  // Also mark page entry points (but smaller, less prominent)
  for (const node of layout.allNodes) {
    if (node.type !== "route") continue;

    const r = 4;
    svg += `<rect x="${node.x - r}" y="${node.y - r * 0.7}" width="${r * 2}" height="${r * 1.4}" rx="2" fill="#FF6B35" stroke="#fff" stroke-width="0.5" opacity="0.6"/>\n`;
  }

  return svg;
}

function drawInfraLegend(x: number, y: number): string {
  let svg = `<g transform="translate(${x},${y})">\n`;
  svg += `<rect x="0" y="0" width="170" height="110" rx="4" fill="white" stroke="#DEE2E6" stroke-width="1" opacity="0.9"/>\n`;
  svg += `<text x="8" y="14" font-family="monospace" font-size="9" font-weight="bold" fill="#333">Flow Types</text>\n`;

  const items = [
    { label: "Auth flow", color: FLOW_TYPES[0]!.color },
    { label: "Payment flow", color: FLOW_TYPES[1]!.color },
    { label: "Data flow", color: FLOW_TYPES[2]!.color },
    { label: "Rendering flow", color: FLOW_TYPES[3]!.color },
  ];

  items.forEach((item, i) => {
    const iy = 30 + i * 16;
    svg += `<line x1="8" y1="${iy}" x2="28" y2="${iy}" stroke="${item.color}" stroke-width="2.5"/>\n`;
    svg += `<text x="34" y="${iy + 3}" font-family="monospace" font-size="8" fill="#555">${item.label}</text>\n`;
  });

  svg += `<text x="8" y="100" font-family="monospace" font-size="7" fill="#888">Thickness = coupling strength</text>\n`;

  svg += `</g>\n`;
  return svg;
}
