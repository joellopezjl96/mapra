/**
 * Experiment analysis engine — statistical diagnostics for batch results.
 *
 * Pure computation, no API calls, no codebase access.
 * Reads BatchResults JSON and produces AnalysisReport.
 */

import type {
  BatchResults,
  QuestionResult,
  Verdict,
  ConditionStats,
  ConditionComparison,
  AssertionDiagnostic,
  BudgetSummary,
  AnalysisReport,
  ToolUsageStats,
  IterationDelta,
  IterationComparison,
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
      min: scores.reduce((a, b) => Math.min(a, b), Infinity),
      max: scores.reduce((a, b) => Math.max(a, b), -Infinity),
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

// ─── Tool usage stats ────────────────────────────────────

function computeToolUsage(results: QuestionResult[]): ToolUsageStats[] {
  const condMap = new Map<string, { name: string; toolCalls: number[]; }>();

  for (const qr of results) {
    for (const cr of qr.conditions) {
      for (const trial of cr.trials) {
        if (trial.toolCallCount === undefined) continue;
        let entry = condMap.get(cr.conditionId);
        if (!entry) {
          entry = { name: cr.conditionName, toolCalls: [] };
          condMap.set(cr.conditionId, entry);
        }
        entry.toolCalls.push(trial.toolCallCount);
      }
    }
  }

  const stats: ToolUsageStats[] = [];
  for (const [id, entry] of condMap) {
    const total = entry.toolCalls.reduce((a, b) => a + b, 0);
    const selfSufficient = entry.toolCalls.filter(c => c === 0).length;
    stats.push({
      conditionId: id,
      conditionName: entry.name,
      avgToolCalls: total / entry.toolCalls.length,
      selfSufficientRate: selfSufficient / entry.toolCalls.length,
      trialCount: entry.toolCalls.length,
    });
  }

  return stats;
}

// ─── Public API ──────────────────────────────────────────

export function analyzeResults(batch: BatchResults): AnalysisReport {
  const conditionStats = computeConditionStats(batch.results);
  const comparisons = computeComparisons(batch.results);
  const diagnostics = computeDiagnostics(batch.results);
  const budget = computeBudget(diagnostics, batch.summary.totalCostEstimate, batch.results);
  const toolUsage = computeToolUsage(batch.results);

  const report: AnalysisReport = { conditionStats, comparisons, diagnostics, budget };
  if (toolUsage.length > 0) {
    report.toolUsage = toolUsage;
  }
  return report;
}

function countUniqueAssertions(results: QuestionResult[]): number {
  const seen = new Set<string>();
  for (const qr of results) {
    for (const cr of qr.conditions) {
      for (const t of cr.trials) {
        if (t.scores) {
          for (const s of t.scores) seen.add(`${qr.questionId}:${s.assertion}`);
        }
      }
    }
  }
  return seen.size;
}

function computeBudget(
  diags: AssertionDiagnostic[],
  totalCost: number,
  results: QuestionResult[],
): BudgetSummary {
  const nonDisc = diags.filter((d) => d.type === "non-discriminating").length;
  const redundant = diags.filter((d) => d.type === "redundant").length;
  const totalAssertions = countUniqueAssertions(results) || (nonDisc + redundant + 1);
  const wastedOnNonDiscriminating = (nonDisc / totalAssertions) * totalCost;
  const recoverableFromRedundant = (redundant / totalAssertions) * totalCost;
  const totalSavings = wastedOnNonDiscriminating + recoverableFromRedundant;

  return {
    wastedOnNonDiscriminating: Math.round(wastedOnNonDiscriminating * 100) / 100,
    recoverableFromRedundant: Math.round(recoverableFromRedundant * 100) / 100,
    totalSavingsPercent: totalCost > 0 ? Math.round((totalSavings / totalCost) * 100) : 0,
  };
}

export function formatReport(report: AnalysisReport): string {
  const lines: string[] = [];

  lines.push("=== CONDITION COMPARISON ===\n");
  for (const s of report.conditionStats) {
    lines.push(
      `  ${s.conditionName.padEnd(24)} ${s.mean.toFixed(2)} +/- ${s.stddev.toFixed(2)}  (min ${s.min.toFixed(2)}, max ${s.max.toFixed(2)})`,
    );
  }
  lines.push("");

  for (const c of report.comparisons) {
    lines.push(
      `  Cliff's Delta (${c.conditionA} vs ${c.conditionB}):  ${c.cliffsDelta >= 0 ? "+" : ""}${c.cliffsDelta.toFixed(2)} [${c.cliffsMagnitude}]  CI: [${c.confidenceInterval[0]}, ${c.confidenceInterval[1]}]`,
    );
    lines.push(
      `  Win rate: ${c.conditionA} wins ${c.winRate.wins}/${c.winRate.total}, ties ${c.winRate.ties}, loses ${c.winRate.losses}`,
    );
  }
  lines.push("");

  for (const s of report.conditionStats) {
    const { PASS, PARTIAL, FAIL } = s.verdictDistribution;
    lines.push(
      `    ${s.conditionName.padEnd(20)} PASS ${(PASS * 100).toFixed(0)}% | PARTIAL ${(PARTIAL * 100).toFixed(0)}% | FAIL ${(FAIL * 100).toFixed(0)}%`,
    );
  }
  lines.push("");

  lines.push("=== ASSERTION DIAGNOSTICS ===\n");

  const grouped: Record<string, AssertionDiagnostic[]> = {};
  for (const d of report.diagnostics) {
    (grouped[d.type] ??= []).push(d);
  }

  const labels: Record<string, string> = {
    "non-discriminating": "NON-DISCRIMINATING",
    flaky: "FLAKY",
    redundant: "REDUNDANT",
    "negative-signal": "NEGATIVE SIGNAL",
  };

  const icons: Record<string, string> = {
    "non-discriminating": "!",
    flaky: "~",
    redundant: "#",
    "negative-signal": "v",
  };

  for (const [type, diags] of Object.entries(grouped)) {
    lines.push(`  ${labels[type] ?? type}:`);
    for (const d of diags) {
      lines.push(`  ${icons[type] ?? "?"} ${d.questionId}: "${d.assertion}"`);
      lines.push(`    ${d.detail}`);
    }
    lines.push("");
  }

  lines.push("  BUDGET SUMMARY:");
  lines.push(`    Wasted on non-discriminating: ~$${report.budget.wastedOnNonDiscriminating.toFixed(2)}`);
  lines.push(`    Recoverable from redundant:   ~$${report.budget.recoverableFromRedundant.toFixed(2)}`);
  lines.push(`    Total savings available:       ~${report.budget.totalSavingsPercent}%`);
  lines.push("");

  // Tool usage section — only shown when any trials have toolCallCount
  if (report.toolUsage && report.toolUsage.length > 0) {
    lines.push("=== TOOL USAGE ===\n");
    for (const tu of report.toolUsage) {
      const selfSuffPct = (tu.selfSufficientRate * 100).toFixed(0);
      lines.push(
        `  ${tu.conditionName.padEnd(28)} avg calls: ${tu.avgToolCalls.toFixed(1)}  self-sufficient: ${selfSuffPct}%  (${tu.trialCount} trials)`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ─── Cross-iteration comparison ──────────────────────────

export function compareIterations(
  before: BatchResults,
  after: BatchResults,
): IterationComparison {
  // Build condition score maps: conditionId -> questionId -> score
  const beforeScores = buildConditionScoreMap(before.results);
  const afterScores = buildConditionScoreMap(after.results);

  const deltas: IterationDelta[] = [];
  const regressions: IterationComparison["regressions"] = [];
  const improvements: IterationComparison["improvements"] = [];

  // For each condition, compute aggregate delta
  const allCondIds = new Set([...beforeScores.keys(), ...afterScores.keys()]);
  for (const condId of allCondIds) {
    const beforeMap = beforeScores.get(condId);
    const afterMap = afterScores.get(condId);
    if (!beforeMap || !afterMap) continue;

    const beforeArr: number[] = [];
    const afterArr: number[] = [];
    const allQIds = new Set([...beforeMap.keys(), ...afterMap.keys()]);

    for (const qId of allQIds) {
      const bScore = beforeMap.get(qId);
      const aScore = afterMap.get(qId);
      if (bScore === undefined || aScore === undefined) continue;

      beforeArr.push(bScore);
      afterArr.push(aScore);

      const diff = aScore - bScore;
      if (diff < -0.10) {
        regressions.push({ questionId: qId, conditionId: condId, before: bScore, after: aScore });
      } else if (diff > 0.10) {
        improvements.push({ questionId: qId, conditionId: condId, before: bScore, after: aScore });
      }
    }

    if (beforeArr.length > 0) {
      const meanBefore = beforeArr.reduce((a, b) => a + b, 0) / beforeArr.length;
      const meanAfter = afterArr.reduce((a, b) => a + b, 0) / afterArr.length;
      deltas.push({
        conditionId: condId,
        conditionName: findConditionName(before.results, condId) ?? condId,
        scoreBefore: Math.round(meanBefore * 100) / 100,
        scoreAfter: Math.round(meanAfter * 100) / 100,
        delta: Math.round((meanAfter - meanBefore) * 100) / 100,
        cliffsDelta: computeCliffsDelta(afterArr, beforeArr),
      });
    }
  }

  return {
    beforeName: before.config.name,
    afterName: after.config.name,
    deltas,
    regressions,
    improvements,
    costBefore: before.summary.totalCostEstimate,
    costAfter: after.summary.totalCostEstimate,
  };
}

function buildConditionScoreMap(
  results: QuestionResult[],
): Map<string, Map<string, number>> {
  const map = new Map<string, Map<string, number>>();
  for (const qr of results) {
    for (const cr of qr.conditions) {
      let qMap = map.get(cr.conditionId);
      if (!qMap) {
        qMap = new Map();
        map.set(cr.conditionId, qMap);
      }
      qMap.set(qr.questionId, cr.aggregateScore);
    }
  }
  return map;
}

function findConditionName(results: QuestionResult[], condId: string): string | undefined {
  for (const qr of results) {
    for (const cr of qr.conditions) {
      if (cr.conditionId === condId) return cr.conditionName;
    }
  }
  return undefined;
}

export function formatComparison(comp: IterationComparison): string {
  const lines: string[] = [];

  lines.push(`=== ITERATION COMPARISON: ${comp.beforeName} -> ${comp.afterName} ===\n`);

  for (const d of comp.deltas) {
    const sign = d.delta >= 0 ? "+" : "";
    lines.push(
      `  ${d.conditionName.padEnd(24)} ${d.scoreBefore.toFixed(2)} -> ${d.scoreAfter.toFixed(2)}  (${sign}${d.delta.toFixed(2)})  Cliff's d=${d.cliffsDelta.toFixed(2)}`,
    );
  }
  lines.push("");

  if (comp.improvements.length > 0) {
    lines.push("  IMPROVEMENTS:");
    for (const imp of comp.improvements) {
      lines.push(`    ${imp.questionId} [${imp.conditionId}]: ${imp.before.toFixed(2)} -> ${imp.after.toFixed(2)}`);
    }
    lines.push("");
  }

  if (comp.regressions.length > 0) {
    lines.push("  REGRESSIONS:");
    for (const reg of comp.regressions) {
      lines.push(`    ${reg.questionId} [${reg.conditionId}]: ${reg.before.toFixed(2)} -> ${reg.after.toFixed(2)}`);
    }
    lines.push("");
  }

  const costDelta = comp.costAfter - comp.costBefore;
  const sign = costDelta >= 0 ? "+" : "";
  lines.push(`  Cost: $${comp.costBefore.toFixed(2)} -> $${comp.costAfter.toFixed(2)} (${sign}$${costDelta.toFixed(2)})`);

  return lines.join("\n");
}
