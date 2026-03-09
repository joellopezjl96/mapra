import { describe, it, expect } from "vitest";
import { computeBlastRadius } from "../blast-radius.js";
import { buildReverseAdjacency } from "../graph-utils.js";
import type { StrandEdge } from "../../scanner/index.js";

describe("buildReverseAdjacency — test-sourced edge exclusion", () => {
  it("excludes edges where source is a test node", () => {
    const edges: StrandEdge[] = [
      { from: "src/app/page.tsx", to: "src/lib/utils.ts", type: "imports", weight: 1 },
      { from: "playwright/fixtures.ts", to: "src/lib/utils.ts", type: "imports", weight: 1 },
      { from: "e2e/helpers.ts", to: "src/lib/utils.ts", type: "imports", weight: 1 },
    ];

    const testNodeIds = new Set(["playwright/fixtures.ts", "e2e/helpers.ts"]);
    const rev = buildReverseAdjacency(edges, false, testNodeIds);

    // Only the production import should remain
    const importers = rev.get("src/lib/utils.ts");
    expect(importers?.size).toBe(1);
    expect(importers?.has("src/app/page.tsx")).toBe(true);
    expect(importers?.has("playwright/fixtures.ts")).toBe(false);
    expect(importers?.has("e2e/helpers.ts")).toBe(false);
  });

  it("excludes both test edges and test-sourced edges when both flags used", () => {
    const edges: StrandEdge[] = [
      { from: "src/app/page.tsx", to: "src/lib/utils.ts", type: "imports", weight: 1 },
      { from: "src/__tests__/utils.test.ts", to: "src/lib/utils.ts", type: "tests", weight: 1 },
      { from: "playwright/fixtures.ts", to: "src/lib/utils.ts", type: "imports", weight: 1 },
    ];

    const testNodeIds = new Set(["src/__tests__/utils.test.ts", "playwright/fixtures.ts"]);
    const rev = buildReverseAdjacency(edges, true, testNodeIds);

    const importers = rev.get("src/lib/utils.ts");
    expect(importers?.size).toBe(1);
    expect(importers?.has("src/app/page.tsx")).toBe(true);
  });

  it("without testNodeIds, only excludes test-typed edges", () => {
    const edges: StrandEdge[] = [
      { from: "src/app/page.tsx", to: "src/lib/utils.ts", type: "imports", weight: 1 },
      { from: "playwright/fixtures.ts", to: "src/lib/utils.ts", type: "imports", weight: 1 },
      { from: "src/__tests__/utils.test.ts", to: "src/lib/utils.ts", type: "tests", weight: 1 },
    ];

    // excludeTestEdges=true, but no testNodeIds — playwright edge survives
    const rev = buildReverseAdjacency(edges, true);

    const importers = rev.get("src/lib/utils.ts");
    expect(importers?.size).toBe(2);
    expect(importers?.has("src/app/page.tsx")).toBe(true);
    expect(importers?.has("playwright/fixtures.ts")).toBe(true);
  });
});

describe("computeBlastRadius", () => {
  it("returns zero impact for a node with no importers", () => {
    const reverseAdj = new Map<string, Set<string>>();
    const result = computeBlastRadius("orphan.ts", reverseAdj);

    expect(result.directImporters).toBe(0);
    expect(result.affectedCount).toBe(0);
    expect(result.maxDepth).toBe(0);
    expect(result.amplificationRatio).toBe(0);
  });

  it("computes transitive cascade through a chain", () => {
    // a.ts imports b.ts imports c.ts
    // reverse: c -> {b}, b -> {a}
    const reverseAdj = new Map<string, Set<string>>([
      ["c.ts", new Set(["b.ts"])],
      ["b.ts", new Set(["a.ts"])],
    ]);
    const result = computeBlastRadius("c.ts", reverseAdj);

    expect(result.directImporters).toBe(1);
    expect(result.affectedCount).toBe(2); // b.ts + a.ts
    expect(result.maxDepth).toBe(2);
    expect(result.amplificationRatio).toBe(2.0);
  });
});
