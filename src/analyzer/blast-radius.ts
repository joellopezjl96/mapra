/**
 * Blast Radius Analyzer — computes transitive impact of changing a file.
 *
 * Uses reverse adjacency (who imports X?) + BFS to find all transitively
 * affected files. Signal attenuation (0.7^depth) weights nearby files higher.
 */

import { bfs, getModuleId } from "./graph-utils.js";

export interface BlastResult {
  nodeId: string;
  directImporters: number;
  affectedCount: number; // transitive BFS reach (excluding test edges)
  weightedImpact: number; // sum of 0.7^depth for each affected file
  modulesAffected: number; // distinct modules in blast radius
  affectedModuleNames: string[]; // names of affected modules
  maxDepth: number; // how far the cascade reaches
  amplificationRatio: number; // affectedCount / directImporters
}

const ATTENUATION = 0.7;

/**
 * Compute blast radius for a single node.
 * reverseAdj should already exclude test edges.
 */
export function computeBlastRadius(
  nodeId: string,
  reverseAdj: Map<string, Set<string>>,
): BlastResult {
  const directImporters = reverseAdj.get(nodeId)?.size ?? 0;

  // BFS through reverse adjacency (who imports this → who imports them → ...)
  const depths = bfs(nodeId, reverseAdj);

  const affectedCount = depths.size;
  let weightedImpact = 0;
  let maxDepth = 0;

  for (const depth of depths.values()) {
    weightedImpact += Math.pow(ATTENUATION, depth);
    if (depth > maxDepth) maxDepth = depth;
  }

  const affectedModuleSet = new Set<string>();
  for (const id of depths.keys()) {
    affectedModuleSet.add(getModuleId(id));
  }
  const modulesAffected = affectedModuleSet.size;
  const affectedModuleNames = [...affectedModuleSet].sort();

  const amplificationRatio =
    directImporters > 0 ? affectedCount / directImporters : 0;

  return {
    nodeId,
    directImporters,
    affectedCount,
    weightedImpact: Math.round(weightedImpact * 100) / 100,
    modulesAffected,
    affectedModuleNames,
    maxDepth,
    amplificationRatio: Math.round(amplificationRatio * 10) / 10,
  };
}

/**
 * Compute blast radius for all nodes that have at least one importer.
 * Returns Map sorted by weightedImpact descending.
 */
export function computeAllBlastRadii(
  reverseAdj: Map<string, Set<string>>,
): Map<string, BlastResult> {
  const results = new Map<string, BlastResult>();

  for (const nodeId of reverseAdj.keys()) {
    const result = computeBlastRadius(nodeId, reverseAdj);
    // Skip nodes with no transitive impact (only imported by 0 or directly by 1 with no cascade)
    if (result.affectedCount > 1) {
      results.set(nodeId, result);
    }
  }

  return results;
}
