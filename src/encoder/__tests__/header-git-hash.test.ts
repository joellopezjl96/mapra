import { describe, it, expect } from "vitest";
import { encodeToStrandFormat } from "../strand-format-encode.js";
import type { StrandGraph } from "../../scanner/index.js";

function makeGraph(): StrandGraph {
  return {
    projectName: "test",
    projectType: "test",
    framework: "typescript",
    totalFiles: 3,
    totalLines: 300,
    nodes: [],
    edges: [],
    modules: [],
  };
}

describe("encodeToStrandFormat git hash in header", () => {
  it("includes git hash suffix when gitHash option is provided", () => {
    const graph = makeGraph();
    const output = encodeToStrandFormat(graph, undefined, { gitHash: "f9e429a" });
    const headerLine = output.split("\n")[0]!;
    expect(headerLine).toContain("| git:f9e429a");
    expect(headerLine).toMatch(/generated \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2} \| git:f9e429a$/);
  });

  it("omits git hash suffix when gitHash is null", () => {
    const graph = makeGraph();
    const output = encodeToStrandFormat(graph, undefined, { gitHash: null });
    const headerLine = output.split("\n")[0]!;
    expect(headerLine).not.toContain("git:");
    expect(headerLine).toMatch(/generated \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  });

  it("omits git hash suffix when no options provided", () => {
    const graph = makeGraph();
    const output = encodeToStrandFormat(graph);
    const headerLine = output.split("\n")[0]!;
    expect(headerLine).not.toContain("git:");
  });

  it("omits git hash suffix when gitHash is undefined", () => {
    const graph = makeGraph();
    const output = encodeToStrandFormat(graph, undefined, {});
    const headerLine = output.split("\n")[0]!;
    expect(headerLine).not.toContain("git:");
  });
});
