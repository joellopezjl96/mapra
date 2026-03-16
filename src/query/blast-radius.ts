// src/query/blast-radius.ts
import * as path from "path";
import { buildReverseAdjacency, bfsWithParents, getModuleId } from "../analyzer/graph-utils.js";
import type { StrandCache } from "./cache.js";

export interface BlastRadiusResult {
  file: string;
  directImporters: number;
  affectedCount: number;
  amplificationRatio: number;
  cascadeDepth: number;
  modulesAffected: number;
  affectedModules: string[];
  cascadePath: string[];
}

export function queryBlastRadius(fileId: string, cache: StrandCache): BlastRadiusResult {
  const testNodeIds = new Set(
    cache.graph.nodes.filter(n => n.type === "test").map(n => n.id),
  );
  const reverseAdj = buildReverseAdjacency(cache.graph.edges, true, testNodeIds);
  const { depths, parents } = bfsWithParents(fileId, reverseAdj);

  // Use pre-computed risk data for consistent numbers, BFS for cascade path
  const precomputed = cache.analysis.risk.find(r => r.nodeId === fileId);

  const directImporters = precomputed?.directImporters ?? (reverseAdj.get(fileId)?.size ?? 0);
  const affectedCount = precomputed?.affectedCount ?? depths.size;
  const amplificationRatio = precomputed?.amplificationRatio ??
    (directImporters > 0 ? Math.round((affectedCount / directImporters) * 10) / 10 : 0);
  const cascadeDepth = precomputed?.maxDepth ?? (depths.size > 0 ? Math.max(...depths.values()) : 0);
  const affectedModules = precomputed?.affectedModuleNames ??
    [...new Set([...depths.keys()].map(getModuleId))].sort();
  const modulesAffected = precomputed?.modulesAffected ?? affectedModules.length;

  return {
    file: fileId,
    directImporters,
    affectedCount,
    amplificationRatio,
    cascadeDepth,
    modulesAffected,
    affectedModules,
    cascadePath: reconstructCascadePath(fileId, depths, parents),
  };
}

/** Trace from deepest BFS node back to start to get the longest cascade chain. */
function reconstructCascadePath(
  startId: string,
  depths: Map<string, number>,
  parents: Map<string, string>,
): string[] {
  if (depths.size === 0) return [];

  let deepestNode = "";
  let maxDepth = 0;
  for (const [node, depth] of depths) {
    if (depth > maxDepth) {
      maxDepth = depth;
      deepestNode = node;
    }
  }

  const chain: string[] = [];
  let current = deepestNode;
  while (current !== startId) {
    chain.unshift(current);
    const parent = parents.get(current);
    if (!parent) break;
    current = parent;
  }

  return chain;
}

export function formatBlastRadius(result: BlastRadiusResult, json: boolean): string {
  if (json) return JSON.stringify(result, null, 2);

  const lines: string[] = [];
  lines.push(
    `${result.file}  \u00D7${result.directImporters}\u2192${result.affectedCount}  d${result.cascadeDepth}  amp${result.amplificationRatio}  ${result.modulesAffected}mod`,
  );

  if (result.affectedModules.length > 0) {
    lines.push(`affected modules: ${result.affectedModules.join(", ")}`);
  }

  if (result.cascadePath.length > 0) {
    const chain = result.cascadePath
      .map((f, i) => `${path.basename(f)}(d${i + 1})`)
      .join(" \u2192 ");
    lines.push(`cascade: ${chain}`);
  }

  return lines.join("\n");
}
