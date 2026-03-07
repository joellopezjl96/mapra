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

// ─── Assertion diagnostics ───────────────────────────────

export function computeDiagnostics(
  results: QuestionResult[],
): AssertionDiagnostic[] {
  const diags: AssertionDiagnostic[] = [];

  for (const qr of results) {
    const assertionVerdicts = collectAssertionVerdicts(qr);

    for (const [assertion, condVerdicts] of assertionVerdicts) {
      checkNonDiscriminating(qr.questionId, assertion, condVerdicts, diags);
      checkFlaky(qr.questionId, assertion, condVerdicts, diags);
    }

    checkRedundant(qr.questionId, assertionVerdicts, diags);
    checkNegativeSignal(qr, diags);
  }

  return diags;
}

type CondVerdicts = Map<string, Verdict[]>;

function collectAssertionVerdicts(
  qr: QuestionResult,
): Map<string, CondVerdicts> {
  const map = new Map<string, CondVerdicts>();

  for (const cr of qr.conditions) {
    for (const trial of cr.trials) {
      if (!trial.scores) continue;
      for (const score of trial.scores) {
        let condMap = map.get(score.assertion);
        if (!condMap) {
          condMap = new Map();
          map.set(score.assertion, condMap);
        }
        let verdicts = condMap.get(cr.conditionId);
        if (!verdicts) {
          verdicts = [];
          condMap.set(cr.conditionId, verdicts);
        }
        verdicts.push(score.verdict);
      }
    }
  }

  return map;
}

function checkNonDiscriminating(
  questionId: string,
  assertion: string,
  condVerdicts: CondVerdicts,
  diags: AssertionDiagnostic[],
): void {
  const passRates: Record<string, number> = {};
  for (const [condId, verdicts] of condVerdicts) {
    passRates[condId] = verdicts.filter((v) => v === "PASS").length / verdicts.length;
  }

  const rates = Object.values(passRates);
  if (rates.length < 2) return;

  const maxDiff = Math.max(...rates) - Math.min(...rates);
  if (maxDiff < 0.05) {
    const avgRate = rates.reduce((a, b) => a + b, 0) / rates.length;
    const label = avgRate > 0.95 ? "PASS" : avgRate < 0.05 ? "FAIL" : `${(avgRate * 100).toFixed(0)}%`;
    diags.push({
      type: "non-discriminating",
      questionId,
      assertion,
      detail: `${label} across all conditions (max diff ${(maxDiff * 100).toFixed(1)}%)`,
      passRates,
    });
  }
}

function checkFlaky(
  questionId: string,
  assertion: string,
  condVerdicts: CondVerdicts,
  diags: AssertionDiagnostic[],
): void {
  for (const [condId, verdicts] of condVerdicts) {
    if (verdicts.length < 3) continue;
    const scores = verdicts.map(verdictToScore);
    const cv = computeCV(scores);
    if (cv > 0.3) {
      diags.push({
        type: "flaky",
        questionId,
        assertion,
        detail: `CV=${cv.toFixed(2)} in condition ${condId} (trials: ${scores.join(", ")})`,
        trialScores: scores,
        cv,
      });
      break; // Only flag once per assertion
    }
  }
}

function computeCV(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return values.some((v) => v !== 0) ? Infinity : 0;
  return computeStddev(values) / mean;
}

function checkRedundant(
  questionId: string,
  assertionVerdicts: Map<string, CondVerdicts>,
  diags: AssertionDiagnostic[],
): void {
  const assertions = [...assertionVerdicts.keys()];
  if (assertions.length < 2) return;

  const vectors = new Map<string, number[]>();
  for (const [assertion, condMap] of assertionVerdicts) {
    const vec: number[] = [];
    for (const [, verdicts] of [...condMap.entries()].sort()) {
      for (const v of verdicts) vec.push(verdictToScore(v));
    }
    vectors.set(assertion, vec);
  }

  const flagged = new Set<string>();
  for (let i = 0; i < assertions.length; i++) {
    for (let j = i + 1; j < assertions.length; j++) {
      const a = assertions[i]!;
      const b = assertions[j]!;
      if (flagged.has(a) || flagged.has(b)) continue;

      const vecA = vectors.get(a)!;
      const vecB = vectors.get(b)!;
      const rho = spearmanCorrelation(vecA, vecB);

      if (Math.abs(rho) > 0.9) {
        flagged.add(b);
        diags.push({
          type: "redundant",
          questionId,
          assertion: b,
          detail: `Spearman rho=${rho.toFixed(2)} with "${a}"`,
          pairedWith: a,
          correlation: rho,
        });
      }
    }
  }
}

function spearmanCorrelation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;

  const rankA = toRanks(a.slice(0, n));
  const rankB = toRanks(b.slice(0, n));

  let sumD2 = 0;
  for (let i = 0; i < n; i++) {
    const d = rankA[i]! - rankB[i]!;
    sumD2 += d * d;
  }

  return 1 - (6 * sumD2) / (n * (n * n - 1));
}

function toRanks(values: number[]): number[] {
  const indexed = values.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(values.length);
  for (let i = 0; i < indexed.length; ) {
    let j = i;
    while (j < indexed.length && indexed[j]!.v === indexed[i]!.v) j++;
    const avgRank = (i + j - 1) / 2 + 1;
    for (let k = i; k < j; k++) ranks[indexed[k]!.i] = avgRank;
    i = j;
  }
  return ranks;
}

function checkNegativeSignal(
  qr: QuestionResult,
  diags: AssertionDiagnostic[],
): void {
  const sorted = [...qr.conditions].sort((a, b) => b.aggregateScore - a.aggregateScore);
  if (sorted.length < 2) return;

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const better = sorted[i]!;
      const worse = sorted[j]!;
      if (
        worse.conditionName.toLowerCase().includes("full") &&
        !better.conditionName.toLowerCase().includes("full") &&
        better.aggregateScore - worse.aggregateScore > 0.05
      ) {
        diags.push({
          type: "negative-signal",
          questionId: qr.questionId,
          assertion: `${worse.conditionName} vs ${better.conditionName}`,
          detail: `"${worse.conditionName}" (${worse.aggregateScore.toFixed(2)}) scores lower than "${better.conditionName}" (${better.aggregateScore.toFixed(2)})`,
        });
      }
    }
  }
}
