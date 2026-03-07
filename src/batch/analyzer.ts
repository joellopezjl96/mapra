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

// ─── Condition-level stats ───────────────────────────────

export function computeConditionStats(
  results: QuestionResult[],
): ConditionStats[] {
  const condMap = new Map<
    string,
    {
      name: string;
      questionScores: number[];
      allVerdicts: Verdict[];
      tokens: number[];
      latencies: number[];
    }
  >();

  for (const qr of results) {
    for (const cr of qr.conditions) {
      let entry = condMap.get(cr.conditionId);
      if (!entry) {
        entry = { name: cr.conditionName, questionScores: [], allVerdicts: [], tokens: [], latencies: [] };
        condMap.set(cr.conditionId, entry);
      }
      entry.questionScores.push(cr.aggregateScore);
      for (const t of cr.trials) {
        if (t.scores) {
          for (const s of t.scores) entry.allVerdicts.push(s.verdict);
        }
        entry.tokens.push(t.tokens.input);
        entry.latencies.push(t.latencyMs);
      }
    }
  }

  const stats: ConditionStats[] = [];
  for (const [id, entry] of condMap) {
    const scores = entry.questionScores;
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const totalVerdicts = entry.allVerdicts.length || 1;

    stats.push({
      conditionId: id,
      conditionName: entry.name,
      mean,
      stddev: computeStddev(scores),
      min: Math.min(...scores),
      max: Math.max(...scores),
      verdictDistribution: {
        PASS: entry.allVerdicts.filter((v) => v === "PASS").length / totalVerdicts,
        PARTIAL: entry.allVerdicts.filter((v) => v === "PARTIAL").length / totalVerdicts,
        FAIL: entry.allVerdicts.filter((v) => v === "FAIL").length / totalVerdicts,
      },
      avgInputTokens: entry.tokens.reduce((a, b) => a + b, 0) / (entry.tokens.length || 1),
      avgLatencyMs: entry.latencies.reduce((a, b) => a + b, 0) / (entry.latencies.length || 1),
    });
  }

  return stats.sort((a, b) => b.mean - a.mean);
}

// ─── Pairwise comparisons ────────────────────────────────

export function computeComparisons(
  results: QuestionResult[],
): ConditionComparison[] {
  const condScores = new Map<string, number[]>();
  for (const qr of results) {
    for (const cr of qr.conditions) {
      let arr = condScores.get(cr.conditionId);
      if (!arr) {
        arr = [];
        condScores.set(cr.conditionId, arr);
      }
      arr.push(cr.aggregateScore);
    }
  }

  const condIds = [...condScores.keys()];
  const comparisons: ConditionComparison[] = [];

  for (let i = 0; i < condIds.length; i++) {
    for (let j = i + 1; j < condIds.length; j++) {
      const idA = condIds[i]!;
      const idB = condIds[j]!;
      const scoresA = condScores.get(idA)!;
      const scoresB = condScores.get(idB)!;

      const delta = computeCliffsDelta(scoresA, scoresB);

      comparisons.push({
        conditionA: idA,
        conditionB: idB,
        cliffsDelta: delta,
        cliffsMagnitude: cliffsMagnitude(delta),
        confidenceInterval: bootstrapCI(scoresA, scoresB),
        winRate: computeWinRate(scoresA, scoresB),
      });
    }
  }

  return comparisons;
}

function bootstrapCI(
  a: number[],
  b: number[],
  iterations = 1000,
  alpha = 0.05,
): [number, number] {
  const deltas: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const sampleA = a.map(() => a[Math.floor(Math.random() * a.length)]!);
    const sampleB = b.map(() => b[Math.floor(Math.random() * b.length)]!);
    deltas.push(computeCliffsDelta(sampleA, sampleB));
  }
  deltas.sort((x, y) => x - y);
  const lo = deltas[Math.floor((alpha / 2) * iterations)]!;
  const hi = deltas[Math.floor((1 - alpha / 2) * iterations)]!;
  return [Math.round(lo * 100) / 100, Math.round(hi * 100) / 100];
}
