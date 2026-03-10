import { describe, it, expect } from "vitest";
import { encodeToStrandFormat } from "../strand-format-encode.js";
import type { StrandGraph } from "../../scanner/index.js";
import type { GraphAnalysis } from "../../analyzer/index.js";
import type { ChurnResult } from "../../analyzer/churn.js";

function makeGraph(nodeIds: string[]): StrandGraph {
  return {
    projectName: "test",
    projectType: "app",
    framework: "nextjs",
    totalFiles: nodeIds.length,
    totalLines: 1000,
    modules: [],
    nodes: nodeIds.map(id => ({
      id,
      path: id,
      type: "utility" as const,
      name: id.split("/").pop()!,
      lines: 100,
      imports: [],
      exports: ["foo"],
      complexity: 0.5,
    })),
    edges: [],
  };
}

function makeChurnEntry(nodeId: string, commits: number): ChurnResult {
  return {
    nodeId,
    commits30d: commits,
    linesAdded30d: 50,
    linesRemoved30d: 10,
    lastCommitHash: "abc1234",
    lastCommitDate: "2026-03-01",
    lastCommitMsg: "some commit message",
  };
}

function extractChurnSection(output: string): string {
  const lines = output.split("\n");
  const startIdx = lines.findIndex(l => l.startsWith("─── CHURN"));
  if (startIdx === -1) return "";
  const sectionLines: string[] = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i]!.startsWith("───")) break;
    sectionLines.push(lines[i]!);
  }
  return sectionLines.join("\n");
}

describe("CHURN graph-membership filter", () => {
  it("only includes files that exist in the scanner graph", () => {
    // Graph has only 2 source files
    const graph = makeGraph([
      "src/cli/index.ts",
      "src/encoder/strand-format-encode.ts",
    ]);

    // Churn includes both graph files and non-graph files
    const churn = new Map<string, ChurnResult>([
      ["src/cli/index.ts", makeChurnEntry("src/cli/index.ts", 10)],
      ["src/encoder/strand-format-encode.ts", makeChurnEntry("src/encoder/strand-format-encode.ts", 8)],
      ["yarn.lock", makeChurnEntry("yarn.lock", 15)],
      ["FINDINGS.md", makeChurnEntry("FINDINGS.md", 12)],
      [".strand", makeChurnEntry(".strand", 7)],
    ]);

    const analysis: GraphAnalysis = {
      risk: [],
      deadCode: [],
      churn,
      conventions: [],
      coChanges: [],
    };

    const output = encodeToStrandFormat(graph, analysis);
    const churnSection = extractChurnSection(output);

    // Graph-member files SHOULD appear
    expect(churnSection).toContain("src/cli/index.ts");
    expect(churnSection).toContain("src/encoder/strand-format-encode.ts");

    // Non-graph files should NOT appear
    expect(churnSection).not.toContain("yarn.lock");
    expect(churnSection).not.toContain("FINDINGS.md");
    expect(churnSection).not.toContain(".strand");
  });

  it("renders empty when all churn entries are non-graph files", () => {
    const graph = makeGraph(["src/cli/index.ts"]);

    const churn = new Map<string, ChurnResult>([
      ["yarn.lock", makeChurnEntry("yarn.lock", 15)],
      ["FINDINGS.md", makeChurnEntry("FINDINGS.md", 12)],
    ]);

    const analysis: GraphAnalysis = {
      risk: [],
      deadCode: [],
      churn,
      conventions: [],
      coChanges: [],
    };

    const output = encodeToStrandFormat(graph, analysis);
    // No CHURN section at all when all entries are filtered out
    expect(output).not.toContain("─── CHURN");
  });
});
