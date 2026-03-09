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
import { type ChurnResult, computeChurn } from "./churn.js";
import { type Convention, detectConventions } from "./conventions.js";
import { type CoChangePair, computeCoChanges } from "./co-change.js";

export interface GraphAnalysis {
  risk: BlastResult[];   // sorted by amplificationRatio desc
  deadCode: string[];    // node IDs with zero inbound edges (likely unused)
  churn: Map<string, ChurnResult>;  // per-file git churn (30d window)
  conventions: Convention[];  // import patterns adopted by 60%+ of a file type
  coChanges: CoChangePair[];  // files that frequently change together in git history
}

/**
 * Analyze a strand graph for structural risk patterns.
 * Returns sorted results ready for rendering.
 */
export function analyzeGraph(graph: StrandGraph, rootDir?: string): GraphAnalysis {
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

  const churn = rootDir ? computeChurn(rootDir) : new Map<string, ChurnResult>();
  const conventions = detectConventions(graph.nodes, graph.edges);
  const coChanges = rootDir ? computeCoChanges(rootDir, graph.edges) : [];

  return { risk, deadCode, churn, conventions, coChanges };
}

export type { BlastResult } from "./blast-radius.js";
export type { ChurnResult } from "./churn.js";
export type { Convention } from "./conventions.js";
export type { CoChangePair } from "./co-change.js";
