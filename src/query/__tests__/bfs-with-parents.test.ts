// src/query/__tests__/bfs-with-parents.test.ts
import { describe, it, expect } from "vitest";
import { bfsWithParents } from "../../analyzer/graph-utils.js";

describe("bfsWithParents", () => {
  // A → B → C → D (linear chain)
  const linear = new Map<string, Set<string>>([
    ["A", new Set(["B"])],
    ["B", new Set(["C"])],
    ["C", new Set(["D"])],
  ]);

  it("returns correct depths for linear chain", () => {
    const { depths } = bfsWithParents("A", linear);
    expect(depths.get("B")).toBe(1);
    expect(depths.get("C")).toBe(2);
    expect(depths.get("D")).toBe(3);
    expect(depths.size).toBe(3);
  });

  it("returns parent pointers for path reconstruction", () => {
    const { parents } = bfsWithParents("A", linear);
    expect(parents.get("B")).toBe("A");
    expect(parents.get("C")).toBe("B");
    expect(parents.get("D")).toBe("C");
  });

  it("excludes start node from results", () => {
    const { depths, parents } = bfsWithParents("A", linear);
    expect(depths.has("A")).toBe(false);
    expect(parents.has("A")).toBe(false);
  });

  it("returns empty maps for isolated node", () => {
    const { depths, parents } = bfsWithParents("Z", linear);
    expect(depths.size).toBe(0);
    expect(parents.size).toBe(0);
  });

  // A → B, A → C, B → D, C → D (diamond — D reachable two ways)
  const diamond = new Map<string, Set<string>>([
    ["A", new Set(["B", "C"])],
    ["B", new Set(["D"])],
    ["C", new Set(["D"])],
  ]);

  it("handles diamond: D reached at depth 2 via first path visited", () => {
    const { depths } = bfsWithParents("A", diamond);
    expect(depths.get("B")).toBe(1);
    expect(depths.get("C")).toBe(1);
    expect(depths.get("D")).toBe(2);
  });

  // A → B → A (cycle)
  const cycle = new Map<string, Set<string>>([
    ["A", new Set(["B"])],
    ["B", new Set(["A"])],
  ]);

  it("handles cycles without infinite loop", () => {
    const { depths } = bfsWithParents("A", cycle);
    expect(depths.get("B")).toBe(1);
    expect(depths.size).toBe(1); // A not revisited
  });
});
