import { describe, it, expect } from "vitest";
import { generateMarkdownReport } from "../reporter.js";
import type { BatchResults } from "../types.js";

function makeMockResults(): BatchResults {
  return {
    config: {
      name: "test-experiment",
      timestamp: "2026-03-01T12:00:00.000Z",
      codebases: ["sbc"],
    },
    results: [
      {
        questionId: "plan-1",
        question: "What are the blockers for pre-ordering?",
        taskType: "planning",
        codebaseName: "sbc",
        conditions: [
          {
            conditionId: "none",
            conditionName: "No encoding",
            trials: [
              {
                trial: 1,
                response: "Some response",
                tokens: { input: 500, output: 200 },
                latencyMs: 2000,
                scores: [
                  {
                    assertion: "check1",
                    verdict: "FAIL",
                    reasoning: "Missing",
                  },
                  {
                    assertion: "check2",
                    verdict: "PARTIAL",
                    reasoning: "Incomplete",
                  },
                ],
              },
            ],
            aggregateScore: 0.25,
          },
          {
            conditionId: "strand-v3",
            conditionName: "Strand v3",
            trials: [
              {
                trial: 1,
                response: "Better response",
                tokens: { input: 2500, output: 300 },
                latencyMs: 3000,
                scores: [
                  {
                    assertion: "check1",
                    verdict: "PASS",
                    reasoning: "Found it",
                  },
                  {
                    assertion: "check2",
                    verdict: "PASS",
                    reasoning: "Complete",
                  },
                ],
              },
            ],
            aggregateScore: 1.0,
          },
        ],
      },
      {
        questionId: "debug-1",
        question: "Where are the failure points?",
        taskType: "debugging",
        codebaseName: "sbc",
        conditions: [
          {
            conditionId: "none",
            conditionName: "No encoding",
            trials: [
              {
                trial: 1,
                response: "Vague response",
                tokens: { input: 500, output: 150 },
                latencyMs: 1800,
                scores: [
                  {
                    assertion: "check1",
                    verdict: "PARTIAL",
                    reasoning: "Half right",
                  },
                ],
              },
            ],
            aggregateScore: 0.5,
          },
          {
            conditionId: "strand-v3",
            conditionName: "Strand v3",
            trials: [
              {
                trial: 1,
                response: "Detailed response",
                tokens: { input: 2500, output: 250 },
                latencyMs: 2800,
                scores: [
                  {
                    assertion: "check1",
                    verdict: "PASS",
                    reasoning: "Correct",
                  },
                ],
              },
            ],
            aggregateScore: 1.0,
          },
        ],
      },
    ],
    summary: {
      totalApiCalls: 4,
      totalTokens: { input: 6000, output: 900 },
      totalCostEstimate: 0.03,
      durationMs: 15000,
    },
  };
}

describe("generateMarkdownReport", () => {
  it("includes experiment name in header", () => {
    const md = generateMarkdownReport(makeMockResults());
    expect(md).toContain("## Results: test-experiment");
  });

  it("generates overall scores table with correct headers", () => {
    const md = generateMarkdownReport(makeMockResults());
    expect(md).toContain("### Overall Scores by Condition");
    expect(md).toContain(
      "| Condition | Avg Score | Avg Tokens (in) | Avg Latency |",
    );
    expect(md).toContain("No encoding");
    expect(md).toContain("Strand v3");
  });

  it("generates task type breakdown table", () => {
    const md = generateMarkdownReport(makeMockResults());
    expect(md).toContain("### Scores by Task Type");
    expect(md).toContain("| planning |");
    expect(md).toContain("| debugging |");
  });

  it("generates per-question detail sections", () => {
    const md = generateMarkdownReport(makeMockResults());
    expect(md).toContain("plan-1");
    expect(md).toContain("debug-1");
    expect(md).toContain("<details>");
  });

  it("includes cost summary", () => {
    const md = generateMarkdownReport(makeMockResults());
    expect(md).toContain("### Cost Summary");
    expect(md).toContain("API calls");
    expect(md).toContain("$0.03");
  });

  it("shows assertion verdict icons in per-question detail", () => {
    const md = generateMarkdownReport(makeMockResults());
    // PASS gets +, PARTIAL gets ~, FAIL gets -
    expect(md).toContain("+ PASS:");
    expect(md).toContain("~ PARTIAL:");
    expect(md).toContain("- FAIL:");
  });

  it("omits task type table when all questions share one type", () => {
    const results = makeMockResults();
    for (const r of results.results) {
      r.taskType = "planning";
    }
    const md = generateMarkdownReport(results);
    // Only 1 task type → no breakdown table (nothing to compare)
    expect(md).not.toContain("### Scores by Task Type");
  });
});
