import { describe, it, expect, vi } from "vitest";
import { formatReport, analyzeResults } from "../analyzer.js";
import type { BatchResults, TrialResult, QuestionResult } from "../types.js";

function makeTrial(overrides?: Partial<TrialResult>): TrialResult {
  return {
    trial: 1,
    response: "test response",
    tokens: { input: 100, output: 50 },
    latencyMs: 500,
    scores: [{ assertion: "test", verdict: "PASS", reasoning: "ok" }],
    ...overrides,
  };
}

function makeResults(questionResults: QuestionResult[]): BatchResults {
  return {
    config: { name: "test", timestamp: new Date().toISOString(), codebases: ["test"] },
    results: questionResults,
    summary: {
      totalApiCalls: 10,
      totalTokens: { input: 1000, output: 500 },
      totalCostEstimate: 0.05,
      durationMs: 5000,
    },
  };
}

describe("tool-call tracking", () => {
  it("tracks stopReason and toolCallCount in TrialResult type", () => {
    // Verify the type allows these fields
    const trial: TrialResult = {
      trial: 1,
      response: "test",
      tokens: { input: 100, output: 50 },
      latencyMs: 500,
      stopReason: "tool_use",
      toolCallCount: 3,
    };
    expect(trial.stopReason).toBe("tool_use");
    expect(trial.toolCallCount).toBe(3);
  });

  it("toolCallCount is 0 for end_turn responses", () => {
    const trial: TrialResult = {
      trial: 1,
      response: "I can answer directly",
      tokens: { input: 100, output: 50 },
      latencyMs: 500,
      stopReason: "end_turn",
      toolCallCount: 0,
    };
    expect(trial.toolCallCount).toBe(0);
    expect(trial.stopReason).toBe("end_turn");
  });

  it("report includes tool usage section when trial data has toolCallCount", () => {
    const results = makeResults([
      {
        questionId: "q1",
        question: "test question",
        taskType: "impact",
        codebaseName: "test",
        conditions: [
          {
            conditionId: "with-tools",
            conditionName: "Strand + Tools",
            trials: [
              makeTrial({ stopReason: "end_turn", toolCallCount: 0 }),
              makeTrial({ stopReason: "end_turn", toolCallCount: 0 }),
              makeTrial({ stopReason: "end_turn", toolCallCount: 0 }),
            ],
            aggregateScore: 0.9,
          },
          {
            conditionId: "no-encoding-tools",
            conditionName: "No Encoding + Tools",
            trials: [
              makeTrial({ stopReason: "tool_use", toolCallCount: 3 }),
              makeTrial({ stopReason: "tool_use", toolCallCount: 5 }),
              makeTrial({ stopReason: "tool_use", toolCallCount: 2 }),
            ],
            aggregateScore: 0.5,
          },
        ],
      },
    ]);

    const report = analyzeResults(results);
    const output = formatReport(report);

    expect(output).toContain("TOOL USAGE");
    expect(output).toContain("Strand + Tools");
    expect(output).toContain("No Encoding + Tools");
    // Strand condition should show 0 avg tool calls
    expect(output).toMatch(/Strand \+ Tools.*0\.0/);
    // No-encoding condition should show >0 avg tool calls
    expect(output).toMatch(/No Encoding \+ Tools.*3\.3/);
  });

  it("report omits tool usage section when no trials have toolCallCount", () => {
    const results = makeResults([
      {
        questionId: "q1",
        question: "test question",
        taskType: "impact",
        codebaseName: "test",
        conditions: [
          {
            conditionId: "normal",
            conditionName: "Normal",
            trials: [makeTrial()],
            aggregateScore: 0.8,
          },
        ],
      },
    ]);

    const report = analyzeResults(results);
    const output = formatReport(report);

    expect(output).not.toContain("TOOL USAGE");
  });
});
