/**
 * Strand Visual Encoder — converts a StrandGraph into a visual encoding
 *
 * This is the core innovation: a spatial visual language designed for
 * multimodal LLM consumption, not human dashboards.
 *
 * Design principles:
 * - Position encodes module boundaries (spatial clustering)
 * - Size encodes complexity/importance (larger = more complex)
 * - Color encodes file type (routes, components, utilities, tests)
 * - Connection lines encode dependencies (thicker = stronger coupling)
 * - Density encodes hotspots (tightly packed = high coupling)
 * - Labels are minimal but machine-readable
 */

import type {
  StrandGraph,
  StrandNode,
  StrandEdge,
  ModuleBoundary,
} from "../scanner/index.js";

// Color palette — designed for visual distinctiveness in LLM vision
const TYPE_COLORS: Record<string, string> = {
  route: "#FF6B35", // orange — pages/routes (entry points)
  "api-route": "#E63946", // red — API routes (data endpoints)
  component: "#457B9D", // blue — React components
  layout: "#A8DADC", // light blue — layouts
  middleware: "#F4A261", // amber — middleware
  schema: "#2A9D8F", // teal — data schema
  test: "#6C757D", // gray — tests
  config: "#ADB5BD", // light gray — config
  utility: "#264653", // dark blue — utilities
  module: "#E9ECEF", // very light gray — module background
};

interface Point {
  x: number;
  y: number;
}

interface LayoutNode extends StrandNode {
  x: number;
  y: number;
  radius: number;
  color: string;
}

interface LayoutModule {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  nodes: LayoutNode[];
}

export function encodeToSVG(graph: StrandGraph): string {
  const PADDING = 60;
  const MODULE_PADDING = 30;
  const MIN_NODE_RADIUS = 4;
  const MAX_NODE_RADIUS = 18;

  // Step 1: Layout modules in a grid
  const layoutModules = layoutModulesInGrid(graph, PADDING, MODULE_PADDING);

  // Step 2: Position nodes within their modules
  const layoutNodes = positionNodesInModules(
    graph.nodes,
    layoutModules,
    graph.modules,
    MIN_NODE_RADIUS,
    MAX_NODE_RADIUS,
  );

  // Step 3: Calculate canvas size
  const allNodes = layoutModules.flatMap((m) => m.nodes);
  const maxX = Math.max(...layoutModules.map((m) => m.x + m.width)) + PADDING;
  const maxY = Math.max(...layoutModules.map((m) => m.y + m.height)) + PADDING;
  const canvasWidth = Math.max(maxX, 800);
  const canvasHeight = Math.max(maxY, 600);

  // Step 4: Build SVG
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvasWidth} ${canvasHeight}" width="${canvasWidth}" height="${canvasHeight}">
<style>
  text { font-family: monospace; }
  .module-label { font-size: 11px; font-weight: bold; fill: #333; }
  .node-label { font-size: 7px; fill: #555; }
  .title { font-size: 14px; font-weight: bold; fill: #111; }
  .subtitle { font-size: 10px; fill: #666; }
  .legend-text { font-size: 9px; fill: #444; }
</style>
<rect width="100%" height="100%" fill="#FAFAFA"/>
`;

  // Title
  svg += `<text x="${PADDING}" y="30" class="title">${escapeXml(graph.projectName)} — ${graph.framework}</text>\n`;
  svg += `<text x="${PADDING}" y="45" class="subtitle">${graph.totalFiles} files · ${graph.totalLines.toLocaleString()} lines · ${graph.modules.length} modules</text>\n`;

  // Draw edges first (behind nodes)
  svg += drawEdges(graph.edges, layoutNodes, canvasWidth);

  // Draw module backgrounds
  for (const mod of layoutModules) {
    svg += `<rect x="${mod.x}" y="${mod.y}" width="${mod.width}" height="${mod.height}" rx="8" fill="${TYPE_COLORS.module}" stroke="#DEE2E6" stroke-width="1" opacity="0.7"/>\n`;
    svg += `<text x="${mod.x + 8}" y="${mod.y + 16}" class="module-label">${escapeXml(mod.name)}</text>\n`;
  }

  // Draw nodes
  for (const node of allNodes) {
    svg += drawNode(node);
  }

  // Legend
  svg += drawLegend(canvasWidth - 180, 10);

  svg += `</svg>`;
  return svg;
}

function layoutModulesInGrid(
  graph: StrandGraph,
  padding: number,
  modulePadding: number,
): LayoutModule[] {
  const modules = graph.modules
    .filter((m) => m.nodeCount > 0)
    .sort((a, b) => b.totalLines - a.totalLines); // largest first

  const cols = Math.ceil(Math.sqrt(modules.length));
  const layoutModules: LayoutModule[] = [];

  let currentX = padding;
  let currentY = 60; // below title
  let rowHeight = 0;
  let col = 0;

  for (const mod of modules) {
    // Estimate module size based on node count
    const nodesPerRow = Math.ceil(Math.sqrt(mod.nodeCount));
    const estimatedWidth = Math.max(nodesPerRow * 30 + modulePadding * 2, 120);
    const estimatedHeight = Math.max(
      Math.ceil(mod.nodeCount / nodesPerRow) * 30 + modulePadding * 2 + 20,
      80,
    );

    if (col >= cols && currentX + estimatedWidth > 1200) {
      currentX = padding;
      currentY += rowHeight + 20;
      rowHeight = 0;
      col = 0;
    }

    layoutModules.push({
      id: mod.id,
      name: mod.name,
      x: currentX,
      y: currentY,
      width: estimatedWidth,
      height: estimatedHeight,
      nodes: [],
    });

    currentX += estimatedWidth + 15;
    rowHeight = Math.max(rowHeight, estimatedHeight);
    col++;
  }

  return layoutModules;
}

function positionNodesInModules(
  nodes: StrandNode[],
  layoutModules: LayoutModule[],
  modules: ModuleBoundary[],
  minRadius: number,
  maxRadius: number,
): Map<string, LayoutNode> {
  const nodeMap = new Map<string, LayoutNode>();
  const moduleMap = new Map(layoutModules.map((m) => [m.id, m]));

  // Assign nodes to modules
  for (const node of nodes) {
    const parts = node.path.split("/");
    const moduleKey = parts.length > 2 ? parts.slice(0, 2).join("/") : (parts[0] ?? "");
    const layoutMod = moduleMap.get(moduleKey);

    if (!layoutMod) continue;

    const radius =
      minRadius + (maxRadius - minRadius) * Math.min(node.complexity, 1);

    const layoutNode: LayoutNode = {
      ...node,
      x: 0,
      y: 0,
      radius,
      color: TYPE_COLORS[node.type] ?? TYPE_COLORS["utility"] ?? "#888",
    };

    layoutMod.nodes.push(layoutNode);
    nodeMap.set(node.id, layoutNode);
  }

  // Position nodes within each module using a spiral layout
  for (const mod of layoutModules) {
    const centerX = mod.x + mod.width / 2;
    const centerY = mod.y + mod.height / 2 + 10; // offset for label

    if (mod.nodes.length === 1) {
      const singleNode = mod.nodes[0];
      if (singleNode) { singleNode.x = centerX; singleNode.y = centerY; }
      continue;
    }

    // Sort nodes: entry points first, then by type, then by complexity
    mod.nodes.sort((a, b) => {
      const aEntry = modules
        .find((m) => m.id === mod.id)
        ?.entryPoints.includes(a.id)
        ? -1
        : 0;
      const bEntry = modules
        .find((m) => m.id === mod.id)
        ?.entryPoints.includes(b.id)
        ? -1
        : 0;
      if (aEntry !== bEntry) return aEntry - bEntry;
      return b.complexity - a.complexity;
    });

    // Spiral layout — most important nodes near center
    const angleStep = (2 * Math.PI) / Math.max(mod.nodes.length, 1);
    const maxR = Math.min(mod.width, mod.height) / 2 - 25;

    for (let i = 0; i < mod.nodes.length; i++) {
      const n = mod.nodes[i];
      if (!n) continue;
      const angle = i * angleStep * 1.618; // golden angle for even distribution
      const r = (maxR * Math.sqrt(i + 1)) / Math.sqrt(mod.nodes.length);
      n.x = centerX + r * Math.cos(angle);
      n.y = centerY + r * Math.sin(angle);
    }
  }

  return nodeMap;
}

function drawNode(node: LayoutNode): string {
  const { x, y, radius, color, name, type } = node;

  let shape: string;

  // Different shapes for different types — gives the LLM multiple visual signals
  switch (type) {
    case "api-route":
      // Diamond for API routes
      shape = `<polygon points="${x},${y - radius} ${x + radius},${y} ${x},${y + radius} ${x - radius},${y}" fill="${color}" stroke="#fff" stroke-width="1" opacity="0.85"/>`;
      break;
    case "route":
      // Rounded rect for pages
      shape = `<rect x="${x - radius}" y="${y - radius * 0.7}" width="${radius * 2}" height="${radius * 1.4}" rx="3" fill="${color}" stroke="#fff" stroke-width="1" opacity="0.85"/>`;
      break;
    case "schema":
      // Hexagon for data schemas
      const h = radius * 0.866;
      shape = `<polygon points="${x - radius},${y} ${x - radius / 2},${y - h} ${x + radius / 2},${y - h} ${x + radius},${y} ${x + radius / 2},${y + h} ${x - radius / 2},${y + h}" fill="${color}" stroke="#fff" stroke-width="1" opacity="0.85"/>`;
      break;
    case "test":
      // Triangle for tests
      shape = `<polygon points="${x},${y - radius} ${x + radius},${y + radius * 0.7} ${x - radius},${y + radius * 0.7}" fill="${color}" stroke="#fff" stroke-width="1" opacity="0.6"/>`;
      break;
    default:
      // Circle for everything else
      shape = `<circle cx="${x}" cy="${y}" r="${radius}" fill="${color}" stroke="#fff" stroke-width="1" opacity="0.85"/>`;
  }

  // Label — only for larger nodes to avoid clutter
  let label = "";
  if (radius > 8) {
    const shortName = name.replace(/\.(ts|tsx|js|jsx)$/, "").slice(0, 12);
    label = `<text x="${x}" y="${y + radius + 10}" text-anchor="middle" class="node-label">${escapeXml(shortName)}</text>`;
  }

  return shape + "\n" + label + "\n";
}

function drawEdges(
  edges: StrandEdge[],
  nodeMap: Map<string, LayoutNode>,
  _canvasWidth: number,
): string {
  let svg = '<g opacity="0.3">\n';

  for (const edge of edges) {
    const from = nodeMap.get(edge.from);
    const to = nodeMap.get(edge.to);
    if (!from || !to) continue;

    // Skip very short edges (same cluster, clutters the view)
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 20) continue;

    const strokeWidth =
      edge.type === "tests" ? 0.5 : Math.max(0.5, edge.weight * 2);
    const color = edge.type === "tests" ? "#6C757D" : "#264653";
    const dashArray = edge.type === "tests" ? "3,3" : "none";

    svg += `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="${color}" stroke-width="${strokeWidth}" stroke-dasharray="${dashArray}"/>\n`;
  }

  svg += "</g>\n";
  return svg;
}

function drawLegend(x: number, y: number): string {
  const items = [
    { label: "Page/Route", color: TYPE_COLORS.route, shape: "rect" },
    { label: "API Route", color: TYPE_COLORS["api-route"], shape: "diamond" },
    { label: "Component", color: TYPE_COLORS.component, shape: "circle" },
    { label: "Schema", color: TYPE_COLORS.schema, shape: "hexagon" },
    { label: "Utility", color: TYPE_COLORS.utility, shape: "circle" },
    { label: "Test", color: TYPE_COLORS.test, shape: "triangle" },
  ];

  let svg = `<g transform="translate(${x},${y})">\n`;
  svg += `<rect x="0" y="0" width="170" height="${items.length * 18 + 10}" rx="4" fill="white" stroke="#DEE2E6" stroke-width="1" opacity="0.9"/>\n`;

  items.forEach((item, i) => {
    const iy = 14 + i * 18;
    switch (item.shape) {
      case "diamond":
        svg += `<polygon points="${12},${iy - 5} ${17},${iy} ${12},${iy + 5} ${7},${iy}" fill="${item.color}"/>`;
        break;
      case "rect":
        svg += `<rect x="6" y="${iy - 5}" width="12" height="10" rx="2" fill="${item.color}"/>`;
        break;
      case "triangle":
        svg += `<polygon points="${12},${iy - 5} ${17},${iy + 4} ${7},${iy + 4}" fill="${item.color}"/>`;
        break;
      case "hexagon":
        svg += `<circle cx="12" cy="${iy}" r="5" fill="${item.color}"/>`;
        break;
      default:
        svg += `<circle cx="12" cy="${iy}" r="5" fill="${item.color}"/>`;
    }
    svg += `<text x="24" y="${iy + 4}" class="legend-text">${item.label}</text>\n`;
  });

  svg += `</g>\n`;
  return svg;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
