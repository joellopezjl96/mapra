/**
 * Graph Analyzer — entry point for structural analysis.
 *
 * Builds shared data structures once, passes them to individual analyzers.
 * Currently: blast radius. Designed to extend with keystones, dead wood, symbiosis.
 */

import type { StrandGraph } from "../scanner/index.js";
import { buildReverseAdjacency } from "./graph-utils.js";
import {
  type BlastResult,
  computeAllBlastRadii,
} from "./blast-radius.js";

export interface GraphAnalysis {
  risk: BlastResult[]; // sorted by weightedImpact desc
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

  // Sort by weightedImpact descending
  const risk = [...blastMap.values()].sort(
    (a, b) => b.weightedImpact - a.weightedImpact,
  );

  return { risk };
}

export type { BlastResult } from "./blast-radius.js";
