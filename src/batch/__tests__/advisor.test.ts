import { describe, it, expect } from "vitest";
import { buildAdvicePrompt, parseAdviceResponse } from "../advisor.js";
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

describe("parseAdviceResponse", () => {
  it("parses well-formed REWRITE blocks", () => {
    const text = `REWRITE: [route-debug-1] "Response mentions file X"
PROBLEM: Too easy — any keyword match passes
NEW: "Response explains WHY file X is relevant to the bug"
WHY: Tests reasoning, not just keyword presence

CONDITION: Merge strand-lite and strand-no-risk — scores are identical

QUESTION: Retire route-inventory-1 — ceiling effect across all conditions

SAVINGS: ~15% budget reduction`;

    const advice = parseAdviceResponse(text);
    expect(advice.assertionRewrites).toHaveLength(1);
    expect(advice.assertionRewrites[0]!.questionId).toBe("route-debug-1");
    expect(advice.assertionRewrites[0]!.assertion).toBe("Response mentions file X");
    expect(advice.assertionRewrites[0]!.rewrite).toBe("Response explains WHY file X is relevant to the bug");
    expect(advice.conditionSuggestions).toHaveLength(1);
    expect(advice.conditionSuggestions[0]).toContain("Merge strand-lite");
    expect(advice.questionSuggestions).toHaveLength(1);
    expect(advice.questionSuggestions[0]).toContain("Retire route-inventory-1");
    expect(advice.estimatedSavings).toBe("~15% budget reduction");
  });

  it("returns empty arrays for malformed input", () => {
    const advice = parseAdviceResponse("Here are my thoughts on improving your experiment...");
    expect(advice.assertionRewrites).toHaveLength(0);
    expect(advice.conditionSuggestions).toHaveLength(0);
    expect(advice.questionSuggestions).toHaveLength(0);
    expect(advice.estimatedSavings).toBe("");
  });

  it("parses multiple REWRITE blocks", () => {
    const text = `REWRITE: [q1] "check A"
PROBLEM: weak
NEW: "better A"
WHY: stronger

REWRITE: [q2] "check B"
PROBLEM: also weak
NEW: "better B"
WHY: also stronger`;

    const advice = parseAdviceResponse(text);
    expect(advice.assertionRewrites).toHaveLength(2);
    expect(advice.assertionRewrites[0]!.questionId).toBe("q1");
    expect(advice.assertionRewrites[1]!.questionId).toBe("q2");
  });
});
