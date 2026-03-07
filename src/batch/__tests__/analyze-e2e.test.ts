import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { analyzeResults, formatReport } from "../analyzer.js";
import type { BatchResults } from "../types.js";

describe("analyze e2e", () => {
  // Try several known result files; skip if none available
  const candidates = [
    "experiments/experiments/output/usage-line-routing-results.json",
    "experiments/experiments/output/strand-analysis-value-results.json",
    "experiments/experiments/output/strand-v3-effectiveness-results.json",
    "experiments/output/change-safety-results.json",
  ];

  const resultsPath = candidates
    .map((c) => path.resolve(c))
    .find((p) => fs.existsSync(p));

  it("analyzes real experiment results without error", () => {
    if (!resultsPath) return; // skip if no results

    const batch = JSON.parse(
      fs.readFileSync(resultsPath, "utf-8"),
    ) as BatchResults;

    const report = analyzeResults(batch);
    const text = formatReport(report);

    expect(report.conditionStats.length).toBeGreaterThan(0);
    expect(report.diagnostics.length).toBeGreaterThan(0);
    expect(text.length).toBeGreaterThan(100);
    expect(text).toContain("CONDITION COMPARISON");
    expect(text).toContain("ASSERTION DIAGNOSTICS");
  });

  it("budget summary has non-negative values", () => {
    if (!resultsPath) return;

    const batch = JSON.parse(
      fs.readFileSync(resultsPath, "utf-8"),
    ) as BatchResults;

    const report = analyzeResults(batch);

    expect(report.budget.wastedOnNonDiscriminating).toBeGreaterThanOrEqual(0);
    expect(report.budget.recoverableFromRedundant).toBeGreaterThanOrEqual(0);
    expect(report.budget.totalSavingsPercent).toBeGreaterThanOrEqual(0);
  });
});
