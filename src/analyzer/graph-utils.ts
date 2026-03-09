/**
 * Shared graph utilities — adjacency builders, BFS, module ID helpers.
 * Used by blast-radius and future analyzers (keystones, dead wood, etc.).
 */

import type { StrandEdge } from "../scanner/index.js";

/**
 * Build reverse adjacency: for each node, who imports it.
 * Optionally excludes test edges (type === "tests") and/or
 * edges where the source node is a test file (by ID).
 */
export function buildReverseAdjacency(
  edges: StrandEdge[],
  excludeTestEdges = false,
  testNodeIds?: Set<string>,
): Map<string, Set<string>> {
  const rev = new Map<string, Set<string>>();

  for (const edge of edges) {
    if (excludeTestEdges && edge.type === "tests") continue;
    if (testNodeIds && testNodeIds.has(edge.from)) continue;
    if (!rev.has(edge.to)) rev.set(edge.to, new Set());
    rev.get(edge.to)!.add(edge.from);
  }

  return rev;
}

/**
 * Build forward adjacency: for each node, who does it import.
 * Optionally excludes test edges.
 */
export function buildForwardAdjacency(
  edges: StrandEdge[],
  excludeTestEdges = false,
): Map<string, Set<string>> {
  const fwd = new Map<string, Set<string>>();

  for (const edge of edges) {
    if (excludeTestEdges && edge.type === "tests") continue;
    if (!fwd.has(edge.from)) fwd.set(edge.from, new Set());
    fwd.get(edge.from)!.add(edge.to);
  }

  return fwd;
}

/**
 * Count inbound edges per node.
 * Optionally excludes test edges.
 */
export function countInboundEdges(
  edges: StrandEdge[],
  excludeTestEdges = false,
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const edge of edges) {
    if (excludeTestEdges && edge.type === "tests") continue;
    counts.set(edge.to, (counts.get(edge.to) || 0) + 1);
  }

  return counts;
}

/**
 * BFS from startId through adjacency map.
 * Returns Map<nodeId, depth> of all reachable nodes (excluding start).
 * Handles cycles safely via visited set.
 */
export function bfs(
  startId: string,
  adjacency: Map<string, Set<string>>,
): Map<string, number> {
  const visited = new Set<string>([startId]);
  const depths = new Map<string, number>();
  const queue: Array<{ id: string; depth: number }> = [];

  // Seed queue with direct neighbors
  const neighbors = adjacency.get(startId);
  if (neighbors) {
    for (const n of neighbors) {
      if (!visited.has(n)) {
        visited.add(n);
        depths.set(n, 1);
        queue.push({ id: n, depth: 1 });
      }
    }
  }

  let head = 0;
  while (head < queue.length) {
    const { id, depth } = queue[head++]!;
    const next = adjacency.get(id);
    if (!next) continue;

    for (const n of next) {
      if (!visited.has(n)) {
        visited.add(n);
        depths.set(n, depth + 1);
        queue.push({ id: n, depth: depth + 1 });
      }
    }
  }

  return depths;
}

/**
 * Extract coarse module ID from a file path.
 * Uses first 2 path segments: "src/lib", "src/app", etc.
 * Root-level files return the first segment.
 */
export function getModuleId(nodePath: string): string {
  const parts = nodePath.split("/");
  return parts.length > 2
    ? parts.slice(0, 2).join("/")
    : (parts[0] ?? nodePath);
}

/**
 * Count distinct modules among a set of node IDs.
 */
export function countDistinctModules(nodeIds: Iterable<string>): number {
  const modules = new Set<string>();
  for (const id of nodeIds) {
    modules.add(getModuleId(id));
  }
  return modules.size;
}
