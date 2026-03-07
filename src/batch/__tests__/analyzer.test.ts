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
  computeDiagnostics,
  analyzeResults,
  formatReport,
} from "../analyzer.js";
import type { QuestionResult, Verdict, BatchResults } from "../types.js";

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

describe("computeDiagnostics", () => {
  it("flags non-discriminating assertions (100% PASS all conditions)", () => {
    const results = makeResults(); // q2 has PASS 100% both conditions
    const diags = computeDiagnostics(results);

    const nonDisc = diags.filter((d) => d.type === "non-discriminating");
    expect(nonDisc.length).toBeGreaterThan(0);
    expect(nonDisc.some((d) => d.questionId === "q2")).toBe(true);
  });

  it("flags flaky assertions (high CV within condition)", () => {
    const results: QuestionResult[] = [
      {
        questionId: "flaky-q",
        question: "test",
        taskType: "planning",
        codebaseName: "sbc",
        conditions: [
          {
            conditionId: "full",
            conditionName: "Full",
            trials: [
              {
                trial: 1, response: "", tokens: { input: 100, output: 50 },
                latencyMs: 1000,
                scores: [{ assertion: "flaky check", verdict: "PASS", reasoning: "" }],
              },
              {
                trial: 2, response: "", tokens: { input: 100, output: 50 },
                latencyMs: 1000,
                scores: [{ assertion: "flaky check", verdict: "FAIL", reasoning: "" }],
              },
              {
                trial: 3, response: "", tokens: { input: 100, output: 50 },
                latencyMs: 1000,
                scores: [{ assertion: "flaky check", verdict: "PASS", reasoning: "" }],
              },
              {
                trial: 4, response: "", tokens: { input: 100, output: 50 },
                latencyMs: 1000,
                scores: [{ assertion: "flaky check", verdict: "FAIL", reasoning: "" }],
              },
            ],
            aggregateScore: 0.5,
          },
        ],
      },
    ];

    const diags = computeDiagnostics(results);
    const flaky = diags.filter((d) => d.type === "flaky");
    expect(flaky.length).toBeGreaterThan(0);
    expect(flaky[0]!.cv).toBeGreaterThan(0.3);
  });

  it("flags redundant assertion pairs (Spearman rho > 0.9)", () => {
    const results: QuestionResult[] = [
      {
        questionId: "redundant-q",
        question: "test",
        taskType: "planning",
        codebaseName: "sbc",
        conditions: [
          {
            conditionId: "c1",
            conditionName: "C1",
            trials: [1, 2, 3].map((t) => ({
              trial: t, response: "", tokens: { input: 100, output: 50 },
              latencyMs: 1000,
              scores: [
                { assertion: "check A", verdict: "PASS" as Verdict, reasoning: "" },
                { assertion: "check B", verdict: "PASS" as Verdict, reasoning: "" },
              ],
            })),
            aggregateScore: 1.0,
          },
          {
            conditionId: "c2",
            conditionName: "C2",
            trials: [1, 2, 3].map((t) => ({
              trial: t, response: "", tokens: { input: 100, output: 50 },
              latencyMs: 1000,
              scores: [
                { assertion: "check A", verdict: "FAIL" as Verdict, reasoning: "" },
                { assertion: "check B", verdict: "FAIL" as Verdict, reasoning: "" },
              ],
            })),
            aggregateScore: 0.0,
          },
        ],
      },
    ];

    const diags = computeDiagnostics(results);
    const redundant = diags.filter((d) => d.type === "redundant");
    expect(redundant.length).toBeGreaterThan(0);
    expect(redundant[0]!.pairedWith).toBeDefined();
  });
});

function makeBatchResults(): BatchResults {
  return {
    config: { name: "test", timestamp: "2026-03-06", codebases: ["sbc"] },
    results: makeResults(),
    summary: {
      totalApiCalls: 12,
      totalTokens: { input: 48000, output: 6000 },
      totalCostEstimate: 0.23,
      durationMs: 120000,
    },
  };
}

describe("analyzeResults", () => {
  it("produces a complete AnalysisReport from BatchResults", () => {
    const report = analyzeResults(makeBatchResults());
    expect(report.conditionStats.length).toBe(2);
    expect(report.comparisons.length).toBe(1);
    expect(report.diagnostics.length).toBeGreaterThan(0);
    expect(report.budget).toBeDefined();
  });
});

describe("formatReport", () => {
  it("produces human-readable stdout text", () => {
    const report = analyzeResults(makeBatchResults());
    const text = formatReport(report);

    expect(text).toContain("CONDITION COMPARISON");
    expect(text).toContain("Strand full");
    expect(text).toContain("ASSERTION DIAGNOSTICS");
    expect(text).toContain("non-discriminating");
  });
});
