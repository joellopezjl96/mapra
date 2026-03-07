import { describe, it, expect } from "vitest";
import { computeConsistency, computeVerdictBias } from "../judge-check.js";
import type { Verdict } from "../types.js";

describe("computeConsistency", () => {
  it("returns 1.0 when all repetitions agree", () => {
    const reps: Verdict[][] = [
      ["PASS", "PASS", "PASS"],
      ["FAIL", "FAIL", "FAIL"],
    ];
    expect(computeConsistency(reps)).toBe(1.0);
  });

  it("returns < 1.0 when repetitions disagree", () => {
    const reps: Verdict[][] = [
      ["PASS", "PARTIAL", "PASS"],
      ["FAIL", "FAIL", "FAIL"],
    ];
    expect(computeConsistency(reps)).toBe(0.5);
  });
});

describe("computeVerdictBias", () => {
  it("detects PARTIAL underuse", () => {
    const verdicts: Verdict[] = [
      "PASS", "PASS", "PASS", "PASS", "PASS",
      "FAIL", "FAIL", "FAIL", "FAIL", "FAIL",
    ];
    const bias = computeVerdictBias(verdicts);
    expect(bias.partialRate).toBe(0);
    expect(bias.biased).toBe(true);
  });

  it("reports no bias when PARTIAL is used", () => {
    const verdicts: Verdict[] = [
      "PASS", "PASS", "PARTIAL", "PARTIAL", "FAIL",
      "PASS", "PARTIAL", "FAIL", "FAIL", "PARTIAL",
    ];
    const bias = computeVerdictBias(verdicts);
    expect(bias.partialRate).toBeGreaterThan(0);
    expect(bias.biased).toBe(false);
  });
});
