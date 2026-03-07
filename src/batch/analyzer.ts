/**
 * Experiment analysis engine — statistical diagnostics for batch results.
 *
 * Pure computation, no API calls, no codebase access.
 * Reads BatchResults JSON and produces AnalysisReport.
 */

import type {
  BatchResults,
  QuestionResult,
  ConditionResult,
  Verdict,
  ConditionStats,
  ConditionComparison,
  AssertionDiagnostic,
  BudgetSummary,
  AnalysisReport,
} from "./types.js";

// ─── Stat helpers (exported for testing) ─────────────────

export function verdictToScore(v: Verdict): number {
  if (v === "PASS") return 1.0;
  if (v === "PARTIAL") return 0.5;
  return 0.0;
}

export function computeStddev(values: number[]): number {
  if (values.length <= 1) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map((v) => (v - mean) ** 2);
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
}

export function computeCliffsDelta(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  let more = 0;
  let less = 0;
  for (const ai of a) {
    for (const bi of b) {
      if (ai > bi) more++;
      else if (ai < bi) less++;
    }
  }
  return (more - less) / (a.length * b.length);
}

export function cliffsMagnitude(
  d: number,
): "negligible" | "small" | "medium" | "large" {
  const abs = Math.abs(d);
  if (abs < 0.147) return "negligible";
  if (abs < 0.33) return "small";
  if (abs < 0.474) return "medium";
  return "large";
}

export function computeWinRate(
  scoresA: number[],
  scoresB: number[],
): { wins: number; losses: number; ties: number; total: number } {
  let wins = 0, losses = 0, ties = 0;
  const len = Math.min(scoresA.length, scoresB.length);
  for (let i = 0; i < len; i++) {
    const a = scoresA[i]!;
    const b = scoresB[i]!;
    if (Math.abs(a - b) < 0.01) ties++;
    else if (a > b) wins++;
    else losses++;
  }
  return { wins, losses, ties, total: len };
}
