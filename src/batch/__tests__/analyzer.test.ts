import { describe, it, expect } from "vitest";
import type {
  AnalysisReport,
  ConditionStats,
  AssertionDiagnostic,
  DiagnosticType,
} from "../types.js";
import {
  computeStddev,
  computeCliffsDelta,
  cliffsMagnitude,
  computeWinRate,
  verdictToScore,
  computeConditionStats,
  computeComparisons,
} from "../analyzer.js";
import type { QuestionResult, Verdict } from "../types.js";

describe("analysis types", () => {
  it("ConditionStats has mean, stddev, min, max", () => {
    const stats: ConditionStats = {
      conditionId: "full",
      conditionName: "Strand full",
      mean: 0.82,
      stddev: 0.18,
      min: 0.50,
      max: 1.00,
      verdictDistribution: { PASS: 0.68, PARTIAL: 0.14, FAIL: 0.18 },
      avgInputTokens: 4500,
      avgLatencyMs: 19000,
    };
    expect(stats.stddev).toBe(0.18);
  });

  it("AssertionDiagnostic captures flagged assertions", () => {
    const diag: AssertionDiagnostic = {
      type: "non-discriminating",
      questionId: "route-debug-1",
      assertion: "traces order submission flow",
      detail: "PASS 100% across all conditions",
      passRates: { full: 1.0, lite: 1.0 },
    };
    expect(diag.type).toBe("non-discriminating");
  });
});

describe("computeStddev", () => {
  it("returns 0 for single value", () => {
    expect(computeStddev([5])).toBe(0);
  });

  it("computes population stddev", () => {
    // [2, 4, 4, 4, 5, 5, 7, 9] -> mean=5, stddev=2.0
    expect(computeStddev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.0, 1);
  });

  it("returns 0 for empty array", () => {
    expect(computeStddev([])).toBe(0);
  });
});

describe("verdictToScore", () => {
  it("maps PASS=1, PARTIAL=0.5, FAIL=0", () => {
    expect(verdictToScore("PASS")).toBe(1.0);
    expect(verdictToScore("PARTIAL")).toBe(0.5);
    expect(verdictToScore("FAIL")).toBe(0.0);
  });
});

describe("computeCliffsDelta", () => {
  it("returns 0 for identical arrays", () => {
    expect(computeCliffsDelta([1, 1, 1], [1, 1, 1])).toBe(0);
  });

  it("returns 1.0 when A always dominates B", () => {
    expect(computeCliffsDelta([1, 1, 1], [0, 0, 0])).toBe(1.0);
  });

  it("returns -1.0 when B always dominates A", () => {
    expect(computeCliffsDelta([0, 0, 0], [1, 1, 1])).toBe(-1.0);
  });

  it("handles mixed ordinal scores", () => {
    const a = [1.0, 1.0, 0.5, 0.0]; // PASS, PASS, PARTIAL, FAIL
    const b = [0.5, 0.0, 0.0, 0.0]; // PARTIAL, FAIL, FAIL, FAIL
    const d = computeCliffsDelta(a, b);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(1);
  });
});

describe("cliffsMagnitude", () => {
  it("classifies effect sizes", () => {
    expect(cliffsMagnitude(0.1)).toBe("negligible");
    expect(cliffsMagnitude(0.2)).toBe("small");
    expect(cliffsMagnitude(0.4)).toBe("medium");
    expect(cliffsMagnitude(0.6)).toBe("large");
    expect(cliffsMagnitude(-0.5)).toBe("large");
  });
});

describe("computeWinRate", () => {
  it("counts wins, losses, ties across questions", () => {
    // condA scores per question: [0.8, 0.5, 1.0]
    // condB scores per question: [0.5, 0.5, 0.7]
    const result = computeWinRate(
      [0.8, 0.5, 1.0],
      [0.5, 0.5, 0.7],
    );
    expect(result).toEqual({ wins: 2, losses: 0, ties: 1, total: 3 });
  });
});

// Reusable fixture: 2 questions, 2 conditions, 3 trials each
function makeResults(): QuestionResult[] {
  function trial(scores: Verdict[], trialNum: number) {
    return {
      trial: trialNum,
      response: "test",
      tokens: { input: 4000, output: 500 },
      latencyMs: 20000,
      scores: scores.map((v) => ({
        assertion: "test assertion",
        verdict: v,
        reasoning: "test",
      })),
    };
  }

  return [
    {
      questionId: "q1",
      question: "test q1",
      taskType: "planning",
      codebaseName: "sbc",
      conditions: [
        {
          conditionId: "full",
          conditionName: "Strand full",
          trials: [
            trial(["PASS", "PASS"], 1),
            trial(["PASS", "PARTIAL"], 2),
            trial(["PASS", "PASS"], 3),
          ],
          aggregateScore: 0.92,
        },
        {
          conditionId: "lite",
          conditionName: "Strand lite",
          trials: [
            trial(["PARTIAL", "FAIL"], 1),
            trial(["PASS", "FAIL"], 2),
            trial(["FAIL", "FAIL"], 3),
          ],
          aggregateScore: 0.33,
        },
      ],
    },
    {
      questionId: "q2",
      question: "test q2",
      taskType: "debugging",
      codebaseName: "sbc",
      conditions: [
        {
          conditionId: "full",
          conditionName: "Strand full",
          trials: [
            trial(["PASS", "PASS"], 1),
            trial(["PASS", "PASS"], 2),
            trial(["PASS", "PASS"], 3),
          ],
          aggregateScore: 1.0,
        },
        {
          conditionId: "lite",
          conditionName: "Strand lite",
          trials: [
            trial(["PASS", "PASS"], 1),
            trial(["PASS", "PASS"], 2),
            trial(["PASS", "PASS"], 3),
          ],
          aggregateScore: 1.0,
        },
      ],
    },
  ];
}

describe("computeConditionStats", () => {
  it("computes mean, stddev, min, max, verdict distribution", () => {
    const stats = computeConditionStats(makeResults());

    const full = stats.find((s) => s.conditionId === "full")!;
    expect(full.mean).toBeGreaterThan(0.9);
    expect(full.stddev).toBeGreaterThanOrEqual(0);
    expect(full.min).toBeLessThanOrEqual(full.mean);
    expect(full.max).toBeGreaterThanOrEqual(full.mean);
    expect(full.verdictDistribution.PASS).toBeGreaterThan(0);
    expect(
      full.verdictDistribution.PASS +
      full.verdictDistribution.PARTIAL +
      full.verdictDistribution.FAIL,
    ).toBeCloseTo(1.0, 2);
  });
});

describe("computeComparisons", () => {
  it("produces pairwise comparisons with Cliff's Delta", () => {
    const comps = computeComparisons(makeResults());

    expect(comps.length).toBe(1); // 2 conditions -> 1 pair
    const comp = comps[0]!;
    expect(comp.conditionA).toBe("full");
    expect(comp.conditionB).toBe("lite");
    expect(comp.cliffsDelta).toBeGreaterThan(0);
    expect(["negligible", "small", "medium", "large"]).toContain(comp.cliffsMagnitude);
    expect(comp.winRate.total).toBe(2);
  });
});
