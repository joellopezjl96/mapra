/**
 * Shared Layout Engine — deterministic positioning for all visual layers
 *
 * All topographic layers (terrain, infrastructure, labels) share the same
 * canvas size and node positions so the LLM can mentally overlay them.
 *
 * Extracted from encode.ts to ensure consistency across layers.
 */

import type {
  StrandGraph,
  StrandNode,
  ModuleBoundary,
} from "../scanner/index.js";

export interface Point {
  x: number;
  y: number;
}

export interface LayoutNode extends StrandNode {
  x: number;
  y: number;
  radius: number;
  color: string;
  moduleId: string;
}

export interface LayoutModule {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  nodes: LayoutNode[];
  /** Average complexity of nodes in this module (0-1) */
  avgComplexity: number;
  /** Total lines in this module */
  totalLines: number;
}

export interface CanvasLayout {
  width: number;
  height: number;
  modules: LayoutModule[];
  nodes: Map<string, LayoutNode>;
  /** All nodes as a flat array for iteration */
  allNodes: LayoutNode[];
}

// Color palette — same as encode.ts for consistency
export const TYPE_COLORS: Record<string, string> = {
  route: "#FF6B35",
  "api-route": "#E63946",
  component: "#457B9D",
  layout: "#A8DADC",
  middleware: "#F4A261",
  schema: "#2A9D8F",
  test: "#6C757D",
  config: "#ADB5BD",
  utility: "#264653",
  module: "#E9ECEF",
};

const PADDING = 60;
const MODULE_PADDING = 30;
const MIN_NODE_RADIUS = 4;
const MAX_NODE_RADIUS = 18;

/**
 * Compute the full layout for a StrandGraph.
 * Returns canvas dimensions, module positions, and node positions.
 * All layers MUST use this to ensure spatial consistency.
 */
export function computeLayout(graph: StrandGraph): CanvasLayout {
  // Step 1: Layout modules in a grid
  const layoutModules = layoutModulesInGrid(graph);

  // Step 2: Position nodes within their modules
  const nodeMap = positionNodesInModules(
    graph.nodes,
    layoutModules,
    graph.modules,
  );

  // Step 3: Calculate canvas size
  const allNodes = layoutModules.flatMap((m) => m.nodes);
  const maxX = Math.max(...layoutModules.map((m) => m.x + m.width)) + PADDING;
  const maxY = Math.max(...layoutModules.map((m) => m.y + m.height)) + PADDING;
  const canvasWidth = Math.max(maxX, 800);
  const canvasHeight = Math.max(maxY, 600);

  return {
    width: canvasWidth,
    height: canvasHeight,
    modules: layoutModules,
    nodes: nodeMap,
    allNodes,
  };
}

function layoutModulesInGrid(graph: StrandGraph): LayoutModule[] {
  const modules = graph.modules
    .filter((m) => m.nodeCount > 0)
    .sort((a, b) => b.totalLines - a.totalLines);

  const cols = Math.ceil(Math.sqrt(modules.length));
  const layoutModules: LayoutModule[] = [];

  let currentX = PADDING;
  let currentY = 60; // below title area
  let rowHeight = 0;
  let col = 0;

  for (const mod of modules) {
    const nodesPerRow = Math.ceil(Math.sqrt(mod.nodeCount));
    const estimatedWidth = Math.max(nodesPerRow * 30 + MODULE_PADDING * 2, 120);
    const estimatedHeight = Math.max(
      Math.ceil(mod.nodeCount / nodesPerRow) * 30 + MODULE_PADDING * 2 + 20,
      80,
    );

    if (col >= cols && currentX + estimatedWidth > 1200) {
      currentX = PADDING;
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
      avgComplexity: 0,
      totalLines: mod.totalLines,
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
      MIN_NODE_RADIUS +
      (MAX_NODE_RADIUS - MIN_NODE_RADIUS) * Math.min(node.complexity, 1);

    const layoutNode: LayoutNode = {
      ...node,
      x: 0,
      y: 0,
      radius,
      color: TYPE_COLORS[node.type] ?? TYPE_COLORS.utility!,
      moduleId: layoutMod.id,
    };

    layoutMod.nodes.push(layoutNode);
    nodeMap.set(node.id, layoutNode);
  }

  // Position nodes within each module using spiral layout
  for (const mod of layoutModules) {
    const centerX = mod.x + mod.width / 2;
    const centerY = mod.y + mod.height / 2 + 10;

    if (mod.nodes.length === 1) {
      mod.nodes[0]!.x = centerX;
      mod.nodes[0]!.y = centerY;
    } else if (mod.nodes.length > 1) {
      // Sort: entry points first, then by complexity
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

      // Spiral layout — golden angle for even distribution
      const angleStep = (2 * Math.PI) / Math.max(mod.nodes.length, 1);
      const maxR = Math.min(mod.width, mod.height) / 2 - 25;

      for (let i = 0; i < mod.nodes.length; i++) {
        const angle = i * angleStep * 1.618;
        const r = (maxR * Math.sqrt(i + 1)) / Math.sqrt(mod.nodes.length);
        mod.nodes[i]!.x = centerX + r * Math.cos(angle);
        mod.nodes[i]!.y = centerY + r * Math.sin(angle);
      }
    }

    // Calculate average complexity for this module
    if (mod.nodes.length > 0) {
      mod.avgComplexity =
        mod.nodes.reduce((sum, n) => sum + n.complexity, 0) / mod.nodes.length;
    }
  }

  return nodeMap;
}

/** XML-safe string escaping */
export function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Interpolate between two hex colors based on t (0-1) */
export function lerpColor(color1: string, color2: string, t: number): string {
  const c1 = hexToRgb(color1);
  const c2 = hexToRgb(color2);
  const r = Math.round(c1.r + (c2.r - c1.r) * t);
  const g = Math.round(c1.g + (c2.g - c1.g) * t);
  const b = Math.round(c1.b + (c2.b - c1.b) * t);
  return `rgb(${r},${g},${b})`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16),
  };
}
