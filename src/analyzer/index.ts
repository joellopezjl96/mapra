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
import { type ChurnResult, computeChurn } from "./churn.js";
import { type Convention, detectConventions } from "./conventions.js";
import { type CoChangePair, computeCoChanges } from "./co-change.js";

export interface GraphAnalysis {
  risk: BlastResult[];   // sorted by amplificationRatio desc
  churn: Map<string, ChurnResult>;  // per-file git churn (30d window)
  conventions: Convention[];  // import patterns adopted by 60%+ of a file type
  coChanges: CoChangePair[];  // files that frequently change together in git history
}

/**
 * Analyze a strand graph for structural risk patterns.
 * Returns sorted results ready for rendering.
 */
export function analyzeGraph(graph: StrandGraph, rootDir?: string): GraphAnalysis {
  // Collect test node IDs for filtering
  const testNodeIds = new Set(
    graph.nodes.filter(n => n.type === "test").map(n => n.id),
  );

  // Build reverse adjacency once, excluding test edges and test-sourced edges
  const reverseAdj = buildReverseAdjacency(graph.edges, true, testNodeIds);

  // Compute blast radii
  const blastMap = computeAllBlastRadii(reverseAdj);

  // Sort by amplificationRatio descending
  const risk = [...blastMap.values()].sort(
    (a, b) => b.amplificationRatio - a.amplificationRatio,
  );

  const churn = rootDir ? computeChurn(rootDir) : new Map<string, ChurnResult>();
  const conventions = detectConventions(graph.nodes, graph.edges);
  const coChanges = rootDir ? computeCoChanges(rootDir, graph.edges) : [];

  return { risk, churn, conventions, coChanges };
}

export type { BlastResult } from "./blast-radius.js";
export type { ChurnResult } from "./churn.js";
export type { Convention } from "./conventions.js";
export type { CoChangePair } from "./co-change.js";
