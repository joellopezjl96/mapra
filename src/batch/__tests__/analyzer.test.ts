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
} from "../analyzer.js";

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
