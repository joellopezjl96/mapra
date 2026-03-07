import { describe, it, expect } from "vitest";
import { buildAdvicePrompt } from "../advisor.js";
import type { AnalysisReport } from "../types.js";

describe("buildAdvicePrompt", () => {
  it("includes diagnostics summary in the prompt", () => {
    const report: AnalysisReport = {
      conditionStats: [],
      comparisons: [],
      diagnostics: [
        {
          type: "non-discriminating",
          questionId: "q1",
          assertion: "test check",
          detail: "PASS 100% all conditions",
        },
      ],
      budget: { wastedOnNonDiscriminating: 0.12, recoverableFromRedundant: 0, totalSavingsPercent: 5 },
    };

    const prompt = buildAdvicePrompt(report);
    expect(prompt).toContain("non-discriminating");
    expect(prompt).toContain("test check");
    expect(prompt).toContain("ASSERTION REWRITES");
  });
});
