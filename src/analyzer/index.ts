/**
 * Graph Analyzer — entry point for structural analysis.
 *
 * Builds shared data structures once, passes them to individual analyzers.
 * Currently: blast radius. Designed to extend with keystones, dead wood, symbiosis.
 */

import type { StrandGraph, StrandNode } from "../scanner/index.js";
import { buildReverseAdjacency } from "./graph-utils.js";
import {
  type BlastResult,
  computeAllBlastRadii,
} from "./blast-radius.js";

export interface GraphAnalysis {
  risk: BlastResult[];   // sorted by amplificationRatio desc
  deadCode: string[];    // node IDs with zero inbound edges (likely unused)
}

/**
 * Analyze a strand graph for structural risk patterns.
 * Returns sorted results ready for rendering.
 */
export function analyzeGraph(graph: StrandGraph): GraphAnalysis {
  // Build reverse adjacency once, excluding test edges
  const reverseAdj = buildReverseAdjacency(graph.edges, true);

  // Compute blast radii
  const blastMap = computeAllBlastRadii(reverseAdj);

  // Sort by amplificationRatio descending
  const risk = [...blastMap.values()].sort(
    (a, b) => b.amplificationRatio - a.amplificationRatio,
  );

  // Dead code: files with no inbound edges (not routes, configs, or tests)
  const SKIP_TYPES = new Set<StrandNode["type"]>([
    "route", "api-route", "config", "test", "layout", "middleware",
  ]);
  const deadCode = graph.nodes
    .filter(
      (n) =>
        !SKIP_TYPES.has(n.type) &&
        !reverseAdj.has(n.id),
    )
    .map((n) => n.id);

  return { risk, deadCode };
}

export type { BlastResult } from "./blast-radius.js";
