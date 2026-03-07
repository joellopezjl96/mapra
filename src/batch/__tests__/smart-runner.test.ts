import { describe, it, expect } from "vitest";
import { shouldStopEarly } from "../runner.js";
import { analyzeResults, formatReport } from "../analyzer.js";
import type { Verdict, BatchResults } from "../types.js";

describe("shouldStopEarly", () => {
  it("returns true when all trials unanimous PASS", () => {
    const verdicts: Verdict[][] = [
      ["PASS", "PASS"],
      ["PASS", "PASS"],
      ["PASS", "PASS"],
    ];
    expect(shouldStopEarly(verdicts, 3)).toBe(true);
  });

  it("returns true when all trials unanimous FAIL", () => {
    const verdicts: Verdict[][] = [
      ["FAIL", "FAIL"],
      ["FAIL", "FAIL"],
      ["FAIL", "FAIL"],
    ];
    expect(shouldStopEarly(verdicts, 3)).toBe(true);
  });

  it("returns false when trials disagree", () => {
    const verdicts: Verdict[][] = [
      ["PASS", "PASS"],
      ["FAIL", "PASS"],
      ["PASS", "FAIL"],
    ];
    expect(shouldStopEarly(verdicts, 3)).toBe(false);
  });

  it("returns false when fewer than minTrials", () => {
    const verdicts: Verdict[][] = [
      ["PASS", "PASS"],
      ["PASS", "PASS"],
    ];
    expect(shouldStopEarly(verdicts, 3)).toBe(false);
  });
});

describe("auto-analyze integration", () => {
  it("analyzeResults + formatReport produces output from BatchResults", () => {
    const batch: BatchResults = {
      config: { name: "test", timestamp: "2026-03-06", codebases: ["sbc"] },
      results: [
        {
          questionId: "q1",
          question: "test?",
          taskType: "planning",
          codebaseName: "sbc",
          conditions: [
            {
              conditionId: "full",
              conditionName: "Strand full",
              trials: [
                {
                  trial: 1,
                  response: "answer",
                  tokens: { input: 1000, output: 200 },
                  latencyMs: 5000,
                  scores: [
                    { assertion: "check1", verdict: "PASS", reasoning: "ok" },
                  ],
                },
              ],
              aggregateScore: 0.8,
            },
          ],
        },
      ],
      summary: {
        totalApiCalls: 2,
        totalTokens: { input: 1000, output: 200 },
        totalCostEstimate: 0.01,
        durationMs: 5000,
      },
    };

    const report = analyzeResults(batch);
    const text = formatReport(report);

    expect(text).toContain("CONDITION COMPARISON");
    expect(text).toContain("Strand full");
    expect(report.conditionStats.length).toBe(1);
  });
});
