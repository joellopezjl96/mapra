import { describe, it, expect } from "vitest";
import { shouldStopEarly } from "../runner.js";
import type { Verdict } from "../types.js";

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
