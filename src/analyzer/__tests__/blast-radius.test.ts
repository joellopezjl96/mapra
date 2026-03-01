import { describe, it, expect } from "vitest";
import { computeBlastRadius } from "../blast-radius.js";

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
