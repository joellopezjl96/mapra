// src/query/__tests__/risk-profile.test.ts
import { describe, it, expect } from "vitest";
import { queryRiskProfile, formatRiskProfile } from "../risk-profile.js";
import { createTestCache } from "./fixture.js";

describe("queryRiskProfile", () => {
  const cache = createTestCache();

  it("includes blast radius data for utils.ts", () => {
    const result = queryRiskProfile("src/lib/utils.ts", cache);
    expect(result.risk).not.toBeNull();
    expect(result.risk!.affectedCount).toBe(3);
    expect(result.risk!.amplificationRatio).toBe(3.0);
  });

  it("includes churn data for utils.ts", () => {
    const result = queryRiskProfile("src/lib/utils.ts", cache);
    expect(result.churn).not.toBeNull();
    expect(result.churn!.commits30d).toBe(8);
    expect(result.churn!.linesAdded).toBe(120);
    expect(result.churn!.lastCommitMsg).toBe("feat: add menu categories");
  });

  it("includes co-change partners", () => {
    const result = queryRiskProfile("src/lib/utils.ts", cache);
    expect(result.coChangePartners).toHaveLength(1);
    expect(result.coChangePartners[0]!.file).toBe("src/services/service.ts");
    expect(result.coChangePartners[0]!.confidence).toBe(1.0);
  });

  it("includes test connections via queryTestMap", () => {
    const result = queryRiskProfile("src/lib/utils.ts", cache);
    expect(result.tests.testCount).toBe(2);
    expect(result.tests.directTests).toContain("src/lib/utils.test.ts");
  });

  it("returns no convention violations for compliant file", () => {
    const result = queryRiskProfile("src/lib/utils.ts", cache);
    expect(result.conventionViolations).toEqual([]);
  });

  it("gracefully degrades when file has no risk data", () => {
    const result = queryRiskProfile("src/controllers/app.ts", cache);
    expect(result.risk).toBeNull();
    expect(result.churn).toBeNull();
    expect(result.coChangePartners).toEqual([]);
  });
});

describe("formatRiskProfile", () => {
  const cache = createTestCache();

  it("formats strand notation with all sections", () => {
    const result = queryRiskProfile("src/lib/utils.ts", cache);
    const output = formatRiskProfile(result, false);
    expect(output).toContain("src/lib/utils.ts");
    expect(output).toContain("risk:");
    expect(output).toContain("churn:");
    expect(output).toContain("co-change:");
    expect(output).toContain("tests:");
    expect(output).toContain("conventions:");
  });

  it("shows (none) for missing sections", () => {
    const result = queryRiskProfile("src/controllers/app.ts", cache);
    const output = formatRiskProfile(result, false);
    expect(output).toContain("risk: (none)");
    expect(output).toContain("churn: (none)");
    expect(output).toContain("co-change: (none)");
  });

  it("formats valid JSON", () => {
    const result = queryRiskProfile("src/lib/utils.ts", cache);
    const output = formatRiskProfile(result, true);
    const parsed = JSON.parse(output);
    expect(parsed.file).toBe("src/lib/utils.ts");
    expect(parsed.risk).not.toBeNull();
    expect(parsed.tests.testCount).toBe(2);
  });
});
