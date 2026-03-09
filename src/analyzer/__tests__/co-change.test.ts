import { describe, it, expect } from "vitest";
import {
  parseGitLogNameOnly,
  buildCoOccurrenceMatrix,
  findCoChangePairs,
  buildImportEdgeSet,
} from "../co-change.js";

describe("parseGitLogNameOnly", () => {
  it("parses git log --name-only output into per-commit file sets", () => {
    const raw = [
      "abc1234",
      "src/orders/route.ts",
      "src/lib/utils.ts",
      "",
      "def5678",
      "src/orders/route.ts",
      "src/lib/auth.ts",
      "",
    ].join("\n");

    const commits = parseGitLogNameOnly(raw);

    expect(commits).toHaveLength(2);
    expect(commits[0]).toEqual(new Set(["src/orders/route.ts", "src/lib/utils.ts"]));
    expect(commits[1]).toEqual(new Set(["src/orders/route.ts", "src/lib/auth.ts"]));
  });

  it("handles empty input", () => {
    expect(parseGitLogNameOnly("")).toHaveLength(0);
    expect(parseGitLogNameOnly("  \n  \n")).toHaveLength(0);
  });

  it("normalizes Windows backslashes", () => {
    const raw = [
      "abc1234",
      "src\\orders\\route.ts",
      "",
    ].join("\n");

    const commits = parseGitLogNameOnly(raw);
    expect(commits[0]).toContain("src/orders/route.ts");
  });

  it("handles commits with single files (excluded from co-change)", () => {
    const raw = [
      "abc1234",
      "src/solo-file.ts",
      "",
    ].join("\n");

    const commits = parseGitLogNameOnly(raw);
    // Single-file commits are still parsed; filtering happens in buildCoOccurrenceMatrix
    expect(commits).toHaveLength(1);
    expect(commits[0]).toEqual(new Set(["src/solo-file.ts"]));
  });

  it("handles final commit without trailing newline", () => {
    const raw = [
      "abc1234",
      "src/a.ts",
      "src/b.ts",
    ].join("\n");

    const commits = parseGitLogNameOnly(raw);
    expect(commits).toHaveLength(1);
    expect(commits[0]).toEqual(new Set(["src/a.ts", "src/b.ts"]));
  });
});

describe("buildCoOccurrenceMatrix", () => {
  it("counts pairwise co-occurrences across commits", () => {
    const commits = [
      new Set(["a.ts", "b.ts", "c.ts"]),
      new Set(["a.ts", "b.ts"]),
      new Set(["a.ts", "d.ts"]),
    ];

    const { pairs, fileCounts } = buildCoOccurrenceMatrix(commits);

    // a.ts + b.ts appear together in 2 commits
    expect(pairs.get("a.ts\0b.ts")).toBe(2);
    // a.ts + c.ts appear together in 1 commit
    expect(pairs.get("a.ts\0c.ts")).toBe(1);
    // a.ts + d.ts appear together in 1 commit
    expect(pairs.get("a.ts\0d.ts")).toBe(1);
    // b.ts + c.ts appear together in 1 commit
    expect(pairs.get("b.ts\0c.ts")).toBe(1);

    // File counts
    expect(fileCounts.get("a.ts")).toBe(3);
    expect(fileCounts.get("b.ts")).toBe(2);
    expect(fileCounts.get("c.ts")).toBe(1);
    expect(fileCounts.get("d.ts")).toBe(1);
  });

  it("skips single-file commits", () => {
    const commits = [
      new Set(["a.ts"]),       // single file, skipped
      new Set(["a.ts", "b.ts"]),
    ];

    const { pairs, fileCounts } = buildCoOccurrenceMatrix(commits);

    expect(pairs.get("a.ts\0b.ts")).toBe(1);
    // a.ts only counted once (the single-file commit is skipped)
    expect(fileCounts.get("a.ts")).toBe(1);
  });

  it("skips large commits (> maxFilesPerCommit)", () => {
    const largeCommit = new Set(Array.from({ length: 25 }, (_, i) => `file${i}.ts`));
    const smallCommit = new Set(["a.ts", "b.ts"]);

    const { pairs } = buildCoOccurrenceMatrix([largeCommit, smallCommit], 20);

    // Large commit should be skipped, only small commit's pair counted
    expect(pairs.get("a.ts\0b.ts")).toBe(1);
    expect(pairs.size).toBe(1);
  });
});

describe("findCoChangePairs", () => {
  it("returns pairs sorted by surprise (unconnected first) then frequency", () => {
    // a.ts and b.ts change together 5 times, have an import edge
    // a.ts and c.ts change together 4 times, NO import edge (more surprising)
    const commits = [
      ...Array.from({ length: 5 }, () => new Set(["a.ts", "b.ts"])),
      ...Array.from({ length: 4 }, () => new Set(["a.ts", "c.ts"])),
    ];

    const importEdges = new Set(["a.ts\0b.ts"]); // a imports b

    const pairs = findCoChangePairs(commits, importEdges, 8, 3);

    expect(pairs.length).toBe(2);
    // c.ts pair should come first (no import edge = more surprising)
    expect(pairs[0]!.fileA).toBe("a.ts");
    expect(pairs[0]!.fileB).toBe("c.ts");
    expect(pairs[0]!.importConnected).toBe(false);
    // b.ts pair second (has import edge)
    expect(pairs[1]!.fileA).toBe("a.ts");
    expect(pairs[1]!.fileB).toBe("b.ts");
    expect(pairs[1]!.importConnected).toBe(true);
  });

  it("filters out pairs below minCoChanges threshold", () => {
    const commits = [
      new Set(["a.ts", "b.ts"]),
      new Set(["a.ts", "b.ts"]),
      // Only 2 co-changes, below default minCoChanges=3
    ];

    const pairs = findCoChangePairs(commits, new Set(), 8, 3);
    expect(pairs).toHaveLength(0);
  });

  it("computes confidence correctly", () => {
    // a.ts changes in 5 commits, b.ts in 3 commits, they co-change 3 times
    // confidence = 3 / min(5, 3) = 3/3 = 1.0
    const commits = [
      new Set(["a.ts", "b.ts"]),
      new Set(["a.ts", "b.ts"]),
      new Set(["a.ts", "b.ts"]),
      new Set(["a.ts", "c.ts"]),
      new Set(["a.ts", "c.ts"]),
    ];

    const pairs = findCoChangePairs(commits, new Set(), 8, 3);

    const abPair = pairs.find((p) => p.fileB === "b.ts");
    expect(abPair).toBeDefined();
    expect(abPair!.confidence).toBeCloseTo(1.0);
    expect(abPair!.coChangeCount).toBe(3);
    expect(abPair!.totalCommitsA).toBe(5);
    expect(abPair!.totalCommitsB).toBe(3);
  });

  it("limits results to topN", () => {
    // Create many pairs all above threshold
    const commits = Array.from({ length: 5 }, () =>
      new Set(["a.ts", "b.ts", "c.ts", "d.ts", "e.ts"]),
    );

    const pairs = findCoChangePairs(commits, new Set(), 3, 3);
    expect(pairs.length).toBeLessThanOrEqual(3);
  });

  it("detects import connectivity in both directions", () => {
    const commits = [
      new Set(["a.ts", "b.ts"]),
      new Set(["a.ts", "b.ts"]),
      new Set(["a.ts", "b.ts"]),
    ];

    // Test that b->a is also detected (reverse direction)
    const importEdges = new Set(["b.ts\0a.ts"]);
    const pairs = findCoChangePairs(commits, importEdges, 8, 3);

    expect(pairs[0]!.importConnected).toBe(true);
  });
});

describe("buildImportEdgeSet", () => {
  it("builds set from import edges, excluding test edges", () => {
    const edges = [
      { from: "a.ts", to: "b.ts", type: "imports" },
      { from: "test.ts", to: "a.ts", type: "tests" },
      { from: "c.ts", to: "b.ts", type: "imports" },
    ];

    const set = buildImportEdgeSet(edges);

    expect(set.has("a.ts\0b.ts")).toBe(true);
    expect(set.has("c.ts\0b.ts")).toBe(true);
    // Test edge should be excluded
    expect(set.has("test.ts\0a.ts")).toBe(false);
  });
});
