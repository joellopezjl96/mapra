import { describe, it, expect } from "vitest";
import { encodeToStrandFormat } from "../strand-format-encode.js";
import type { StrandGraph } from "../../scanner/index.js";
import type { GraphAnalysis } from "../../analyzer/index.js";

function makeGraph(nodes: Array<{ id: string; type: string }>): StrandGraph {
  return {
    projectName: "test",
    projectType: "app",
    framework: "nextjs",
    totalFiles: nodes.length,
    totalLines: 1000,
    modules: [],
    nodes: nodes.map(n => ({
      id: n.id,
      path: n.id,
      type: n.type as any,
      name: n.id.split("/").pop()!,
      lines: 100,
      imports: [],
      exports: ["foo"],
      complexity: 0.5,
    })),
    edges: [
      // Make production file imported by 5 things
      ...Array.from({ length: 5 }, (_, i) => ({
        from: `src/importer-${i}.ts`,
        to: "src/lib/production.ts",
        type: "imports" as const,
        weight: 1,
      })),
      // Make test file imported by 10 things
      ...Array.from({ length: 10 }, (_, i) => ({
        from: `test/importer-${i}.ts`,
        to: "playwright/fixtures.ts",
        type: "imports" as const,
        weight: 1,
      })),
    ],
  };
}

function makeAnalysis(): GraphAnalysis {
  return {
    risk: [
      {
        nodeId: "playwright/fixtures.ts",
        directImporters: 10,
        affectedCount: 50,
        weightedImpact: 35.0,
        amplificationRatio: 5.0,
        maxDepth: 3,
        modulesAffected: 1,
        affectedModuleNames: ["test"],
      },
      {
        nodeId: "src/lib/production.ts",
        directImporters: 5,
        affectedCount: 20,
        weightedImpact: 14.0,
        amplificationRatio: 4.0,
        maxDepth: 2,
        modulesAffected: 2,
        affectedModuleNames: ["src/app", "src/lib"],
      },
    ],
    churn: new Map(),
    conventions: [],
    coChanges: [],
  };
}

describe("test file filtering in encoder", () => {
  const graph = makeGraph([
    { id: "src/lib/production.ts", type: "utility" },
    { id: "playwright/fixtures.ts", type: "test" },
  ]);
  const analysis = makeAnalysis();

  it("RISK excludes test files", () => {
    const output = encodeToStrandFormat(graph, analysis);
    expect(output).toContain("src/lib/production.ts");
    // Test file should not appear in RISK section
    const riskSection = output.split("RISK")[1]?.split("───")[0] ?? "";
    expect(riskSection).not.toContain("playwright/fixtures.ts");
  });

  it("MOST IMPORTED excludes test files", () => {
    const output = encodeToStrandFormat(graph, analysis);
    // Extract MOST IMPORTED section: from header line to next section header
    const lines = output.split("\n");
    const startIdx = lines.findIndex(l => l.includes("MOST IMPORTED"));
    const sectionLines: string[] = [];
    for (let i = startIdx + 1; i < lines.length; i++) {
      if (lines[i]!.startsWith("───")) break;
      sectionLines.push(lines[i]!);
    }
    const section = sectionLines.join("\n");
    // The test file has 10 importers but should not appear in MOST IMPORTED
    expect(section).not.toContain("playwright/fixtures.ts");
    expect(section).toContain("src/lib/production.ts");
  });

  it("remaining count in RISK uses filtered list", () => {
    // Create analysis with many risk entries, some test files
    const bigAnalysis: GraphAnalysis = {
      ...makeAnalysis(),
      risk: [
        // 3 test files
        ...Array.from({ length: 3 }, (_, i) => ({
          nodeId: `playwright/helper-${i}.ts`,
          directImporters: 20 - i,
          affectedCount: 100 - i * 10,
          weightedImpact: 70.0 - i * 7,
          amplificationRatio: 5.0,
          maxDepth: 3,
          modulesAffected: 1,
          affectedModuleNames: ["test"],
        })),
        // 10 production files in distinct modules (so dedup doesn't collapse them)
        ...Array.from({ length: 10 }, (_, i) => ({
          nodeId: `src/mod${i}/prod.ts`,
          directImporters: 10 - i,
          affectedCount: 50 - i * 5,
          weightedImpact: 35.0 - i * 3.5,
          amplificationRatio: 4.0,
          maxDepth: 2,
          modulesAffected: 2,
          affectedModuleNames: ["src/app", `src/mod${i}`],
        })),
      ],
    };

    const bigGraph = makeGraph([
      ...Array.from({ length: 3 }, (_, i) => ({
        id: `playwright/helper-${i}.ts`,
        type: "test",
      })),
      ...Array.from({ length: 10 }, (_, i) => ({
        id: `src/mod${i}/prod.ts`,
        type: "utility",
      })),
    ]);

    const output = encodeToStrandFormat(bigGraph, bigAnalysis);
    // 10 production files, 8 shown, so "+2 more" expected
    expect(output).toContain("+2 more with blast radius > 1");
    // Should NOT count test files in remaining
    expect(output).not.toContain("+5 more");
  });
});
