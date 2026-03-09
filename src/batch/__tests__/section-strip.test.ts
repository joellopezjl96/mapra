import { describe, it, expect } from "vitest";
import { encodeToStrandFormat } from "../../encoder/strand-format-encode.js";
import type { StrandGraph } from "../../scanner/index.js";
import type { GraphAnalysis } from "../../analyzer/index.js";

/**
 * Tests the section-stripping regex used by buildEncoding() in runner.ts.
 * Mirrors the logic: replace ─── SECTION ... up to next ─── or end-of-string.
 */
function stripSection(encoding: string, section: string): string {
  let result = encoding.replace(
    new RegExp(`─── ${section}[\\s\\S]*?(?=\\n─── |\\s*$)`),
    "",
  );
  result = result.replace(/\n{3,}/g, "\n\n");
  return result;
}

function makeGraph(): StrandGraph {
  return {
    projectName: "test",
    projectType: "test",
    framework: "typescript",
    totalFiles: 3,
    totalLines: 300,
    nodes: [
      {
        id: "src/lib/ordering.ts",
        path: "src/lib/ordering.ts",
        type: "utility",
        name: "ordering.ts",
        lines: 100,
        imports: [],
        exports: ["checkAvailability", "isWeekend", "CUTOFF_HOUR"],
        complexity: 0.5,
      },
      {
        id: "src/app/page.tsx",
        path: "src/app/page.tsx",
        type: "route",
        name: "page.tsx",
        lines: 50,
        imports: ["src/lib/ordering.ts"],
        exports: ["default"],
        complexity: 0.3,
      },
      {
        id: "src/__tests__/ordering.test.ts",
        path: "src/__tests__/ordering.test.ts",
        type: "test",
        name: "ordering.test.ts",
        lines: 80,
        imports: ["src/lib/ordering.ts"],
        exports: [],
        complexity: 0.1,
      },
    ],
    edges: [
      { from: "src/app/page.tsx", to: "src/lib/ordering.ts", type: "imports", weight: 1 },
      { from: "src/__tests__/ordering.test.ts", to: "src/lib/ordering.ts", type: "tests", weight: 1 },
    ],
    modules: [],
  };
}

function makeAnalysis(): GraphAnalysis {
  return {
    risk: [
      {
        nodeId: "src/lib/ordering.ts",
        directImporters: 1,
        affectedCount: 1,
        weightedImpact: 0.7,
        modulesAffected: 1,
        affectedModuleNames: ["src/app"],
        maxDepth: 1,
        amplificationRatio: 1.0,
      },
    ],
    deadCode: [],
    churn: new Map(),
    conventions: [],
    coChanges: [],
  };
}

describe("section stripping", () => {
  it("removes RISK section while keeping other sections intact", () => {
    const encoding = encodeToStrandFormat(makeGraph(), makeAnalysis());

    // Baseline: RISK is present
    expect(encoding).toContain("─── RISK");

    const stripped = stripSection(encoding, "RISK");

    // RISK section should be gone
    expect(stripped).not.toContain("─── RISK");

    // Other sections should remain
    expect(stripped).toContain("─── TEST COVERAGE");
  });

  it("removes MOST IMPORTED section while keeping RISK", () => {
    const encoding = encodeToStrandFormat(makeGraph(), makeAnalysis());
    const stripped = stripSection(encoding, "MOST IMPORTED");

    expect(stripped).not.toContain("─── MOST IMPORTED");
    expect(stripped).toContain("─── RISK");
  });

  it("does not leave triple-newlines after stripping", () => {
    const encoding = encodeToStrandFormat(makeGraph(), makeAnalysis());
    const stripped = stripSection(encoding, "RISK");

    expect(stripped).not.toMatch(/\n{3,}/);
  });

  it("preserves the STRAND header after stripping", () => {
    const encoding = encodeToStrandFormat(makeGraph(), makeAnalysis());
    const stripped = stripSection(encoding, "RISK");

    expect(stripped).toMatch(/^STRAND v3 \|/);
  });
});
