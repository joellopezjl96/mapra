import { describe, it, expect } from "vitest";
import { stripSections } from "../runner.js";

describe("stripSections", () => {
  const sampleStrand = [
    "MAPRA v3 | test | Typescript | 10 files",
    "LEGEND: ...",
    "USAGE: ...",
    "",
    "─── RISK (change with care) ─────────────────────────────",
    "src/lib/foo.ts  10 affected  depth 2  ×5 in  2 mod  amp 2.0",
    "",
    "─── CHURN (last 30 days, top movers) ─────────────────────",
    "3 commits  +50 -10  src/lib/foo.ts",
    "",
    "─── MOST IMPORTED ───────────────────────────────────────",
    "×24  src/lib/bar.ts",
    "",
    "─── TERRAIN ─────────────────────────────────────────────",
    "Module complexity heatmap",
    "█░········  app  0.22",
    "",
  ].join("\n");

  it("strips a single section by name", () => {
    const result = stripSections(sampleStrand, ["RISK"]);
    expect(result).not.toContain("─── RISK");
    expect(result).not.toContain("src/lib/foo.ts  10 affected");
    expect(result).toContain("─── CHURN");
    expect(result).toContain("─── MOST IMPORTED");
    expect(result).toContain("─── TERRAIN");
  });

  it("strips multiple sections", () => {
    const result = stripSections(sampleStrand, ["RISK", "MOST IMPORTED"]);
    expect(result).not.toContain("─── RISK");
    expect(result).not.toContain("─── MOST IMPORTED");
    expect(result).toContain("─── CHURN");
    expect(result).toContain("─── TERRAIN");
  });

  it("preserves header and legend when stripping sections", () => {
    const result = stripSections(sampleStrand, ["RISK", "CHURN", "TERRAIN"]);
    expect(result).toContain("MAPRA v3");
    expect(result).toContain("LEGEND:");
    expect(result).toContain("USAGE:");
  });

  it("handles empty exclude list (no-op)", () => {
    const result = stripSections(sampleStrand, []);
    expect(result).toBe(sampleStrand);
  });

  it("handles section name not found (no-op)", () => {
    const result = stripSections(sampleStrand, ["NONEXISTENT"]);
    expect(result).toBe(sampleStrand);
  });

  it("matches section name prefix (RISK matches 'RISK (change with care)')", () => {
    const result = stripSections(sampleStrand, ["RISK"]);
    expect(result).not.toContain("RISK");
    expect(result).toContain("─── CHURN");
  });

  it("does not leave double blank lines after stripping", () => {
    const result = stripSections(sampleStrand, ["CHURN"]);
    expect(result).not.toContain("\n\n\n");
  });
});
