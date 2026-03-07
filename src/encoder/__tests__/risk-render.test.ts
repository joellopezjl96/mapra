import { describe, it, expect } from "vitest";
import { encodeToStrandFormat } from "../strand-format-encode.js";
import type { StrandGraph } from "../../scanner/index.js";
import type { GraphAnalysis } from "../../analyzer/index.js";

function makeGraph(overrides?: Partial<StrandGraph>): StrandGraph {
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
    ...overrides,
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
  };
}

describe("header", () => {
  it("includes v3 version and generation timestamp", () => {
    const graph = makeGraph();
    const analysis = makeAnalysis();
    const output = encodeToStrandFormat(graph, analysis);

    expect(output).toMatch(/^STRAND v3 \|/);
    expect(output).toMatch(/\| generated \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

describe("RISK section rendering", () => {
  it("includes export symbols for RISK entries", () => {
    const graph = makeGraph();
    const analysis = makeAnalysis();
    const output = encodeToStrandFormat(graph, analysis);

    expect(output).toContain("exports: checkAvailability, isWeekend, CUTOFF_HOUR");
  });

  it("includes per-file test count on RISK entries", () => {
    const graph = makeGraph();
    const analysis = makeAnalysis();
    const output = encodeToStrandFormat(graph, analysis);

    // ordering.ts has 1 test edge pointing at it
    expect(output).toMatch(/T1\s+src\/lib\/ordering\.ts/);
  });
});
