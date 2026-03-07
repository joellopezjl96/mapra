import { describe, it, expect } from "vitest";
import type {
  AnalysisReport,
  ConditionStats,
  AssertionDiagnostic,
  DiagnosticType,
} from "../types.js";

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
