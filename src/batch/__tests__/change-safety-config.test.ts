import { describe, it, expect } from "vitest";
import { stripSections } from "../runner.js";
import * as fs from "fs";
import * as path from "path";

describe("change-safety config", () => {
  it("config file is valid JSON with required fields", () => {
    const configPath = path.resolve("experiments/configs/change-safety.json");
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));

    expect(raw.name).toBe("change-safety");
    expect(raw.conditions).toHaveLength(3);
    expect(raw.questions).toHaveLength(6);
    expect(raw.trials).toBe(5);

    // Verify conditions have correct excludeSections
    const lite = raw.conditions.find((c: any) => c.id === "strand-lite");
    expect(lite.excludeSections).toEqual(["RISK", "MOST IMPORTED"]);

    const noRisk = raw.conditions.find((c: any) => c.id === "strand-no-risk");
    expect(noRisk.excludeSections).toEqual(["RISK"]);

    const full = raw.conditions.find((c: any) => c.id === "strand-full");
    expect(full.excludeSections).toBeUndefined();
  });

  it("all questions have taskType 'change-safety'", () => {
    const configPath = path.resolve("experiments/configs/change-safety.json");
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    for (const q of raw.questions) {
      expect(q.taskType).toBe("change-safety");
    }
  });

  it("stripSections produces different encodings per condition", () => {
    // Simulate what the runner does with a sample encoding
    const sample = [
      "STRAND v3 | test | Typescript | 10 files",
      "",
      "─── RISK (change with care) ─────────────────────────────",
      "src/lib/foo.ts  10 affected",
      "",
      "─── MOST IMPORTED ───────────────────────────────────────",
      "×24  src/lib/bar.ts",
      "",
      "─── TERRAIN ─────────────────────────────────────────────",
      "Module heatmap",
      "",
    ].join("\n");

    const full = sample;
    const noRisk = stripSections(sample, ["RISK"]);
    const lite = stripSections(sample, ["RISK", "MOST IMPORTED"]);

    // All three should be different
    expect(full).not.toBe(noRisk);
    expect(noRisk).not.toBe(lite);
    expect(full).not.toBe(lite);

    // Full has everything
    expect(full).toContain("─── RISK");
    expect(full).toContain("─── MOST IMPORTED");

    // No-risk has MOST IMPORTED but not RISK
    expect(noRisk).not.toContain("─── RISK");
    expect(noRisk).toContain("─── MOST IMPORTED");

    // Lite has neither
    expect(lite).not.toContain("─── RISK");
    expect(lite).not.toContain("─── MOST IMPORTED");

    // All have TERRAIN
    expect(full).toContain("─── TERRAIN");
    expect(noRisk).toContain("─── TERRAIN");
    expect(lite).toContain("─── TERRAIN");
  });
});
