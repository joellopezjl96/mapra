import { describe, it, expect } from "vitest";
import {
  parseJudgeResponse,
  aggregateScores,
  buildJudgePrompt,
} from "../scorer.js";
import type { Assertion, AssertionScore } from "../types.js";

const testAssertions: Assertion[] = [
  { description: "Mentions ordering", check: "Response mentions ordering.ts" },
  {
    description: "Mentions payment",
    check: "Response mentions payment processing",
  },
  { description: "Mentions POS", check: "Response mentions Cluster POS" },
];

describe("parseJudgeResponse", () => {
  it("parses well-formatted PASS/PARTIAL/FAIL verdicts", () => {
    const text = `ASSERTION_1: PASS — The response clearly mentions ordering.ts
ASSERTION_2: PARTIAL — Payment is mentioned but not in detail
ASSERTION_3: FAIL — No mention of Cluster POS at all`;

    const scores = parseJudgeResponse(text, testAssertions);

    expect(scores).toHaveLength(3);
    expect(scores[0]?.verdict).toBe("PASS");
    expect(scores[0]?.reasoning).toContain("ordering.ts");
    expect(scores[1]?.verdict).toBe("PARTIAL");
    expect(scores[2]?.verdict).toBe("FAIL");
  });

  it("handles em-dash, en-dash, and hyphen separators", () => {
    const text = `ASSERTION_1: PASS — with em dash
ASSERTION_2: PARTIAL – with en dash
ASSERTION_3: FAIL - with hyphen`;

    const scores = parseJudgeResponse(text, testAssertions);

    expect(scores).toHaveLength(3);
    expect(scores[0]?.verdict).toBe("PASS");
    expect(scores[1]?.verdict).toBe("PARTIAL");
    expect(scores[2]?.verdict).toBe("FAIL");
  });

  it("handles case-insensitive verdicts", () => {
    const text = `ASSERTION_1: pass — lower case
ASSERTION_2: Partial — mixed case
ASSERTION_3: FAIL — upper case`;

    const scores = parseJudgeResponse(text, testAssertions);

    expect(scores[0]?.verdict).toBe("PASS");
    expect(scores[1]?.verdict).toBe("PARTIAL");
    expect(scores[2]?.verdict).toBe("FAIL");
  });

  it("returns FAIL for missing assertion lines", () => {
    // Only 1 out of 3 assertions present
    const text = `ASSERTION_1: PASS — Found it`;

    const scores = parseJudgeResponse(text, testAssertions);

    expect(scores).toHaveLength(3);
    expect(scores[0]?.verdict).toBe("PASS");
    expect(scores[1]?.verdict).toBe("FAIL");
    expect(scores[1]?.reasoning).toContain("did not include a verdict");
    expect(scores[2]?.verdict).toBe("FAIL");
  });

  it("handles empty response", () => {
    const scores = parseJudgeResponse("", testAssertions);

    expect(scores).toHaveLength(3);
    scores.forEach((s) => {
      expect(s.verdict).toBe("FAIL");
    });
  });

  it("handles extra text around the verdict lines", () => {
    const text = `Here is my evaluation:

ASSERTION_1: PASS — Clearly mentions ordering.ts as a key file
Some extra commentary here.
ASSERTION_2: FAIL — Not mentioned
ASSERTION_3: PARTIAL — Briefly referenced

Overall, the response was decent.`;

    const scores = parseJudgeResponse(text, testAssertions);

    expect(scores[0]?.verdict).toBe("PASS");
    expect(scores[1]?.verdict).toBe("FAIL");
    expect(scores[2]?.verdict).toBe("PARTIAL");
  });

  it("handles empty assertions array", () => {
    const scores = parseJudgeResponse("ASSERTION_1: PASS — ok", []);
    expect(scores).toHaveLength(0);
  });
});

describe("aggregateScores", () => {
  it("scores all PASS as 1.0", () => {
    const scores: AssertionScore[] = [
      { assertion: "a", verdict: "PASS", reasoning: "" },
      { assertion: "b", verdict: "PASS", reasoning: "" },
    ];
    expect(aggregateScores(scores)).toBe(1.0);
  });

  it("scores all FAIL as 0.0", () => {
    const scores: AssertionScore[] = [
      { assertion: "a", verdict: "FAIL", reasoning: "" },
      { assertion: "b", verdict: "FAIL", reasoning: "" },
    ];
    expect(aggregateScores(scores)).toBe(0.0);
  });

  it("scores mixed verdicts correctly", () => {
    const scores: AssertionScore[] = [
      { assertion: "a", verdict: "PASS", reasoning: "" },
      { assertion: "b", verdict: "PARTIAL", reasoning: "" },
      { assertion: "c", verdict: "FAIL", reasoning: "" },
    ];
    // (1.0 + 0.5 + 0.0) / 3 = 0.5
    expect(aggregateScores(scores)).toBe(0.5);
  });

  it("returns 0 for empty array", () => {
    expect(aggregateScores([])).toBe(0);
  });
});

describe("buildJudgePrompt", () => {
  it("includes question, response, and assertions", () => {
    const prompt = buildJudgePrompt(
      "What files are critical?",
      "The orders route is critical.",
      [{ description: "x", check: "Mentions orders route" }],
    );

    expect(prompt).toContain("What files are critical?");
    expect(prompt).toContain("The orders route is critical.");
    expect(prompt).toContain("1. Mentions orders route");
    expect(prompt).toContain("ASSERTION_1:");
  });
});
