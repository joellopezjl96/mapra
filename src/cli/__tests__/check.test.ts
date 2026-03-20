import { describe, it, expect } from "vitest";
import { parseStrandHeader } from "../../encoder/parse-strand-header.js";
import { encodeToStrandFormat } from "../../encoder/strand-format-encode.js";
import { getGitHash } from "../../analyzer/git-hash.js";
import * as path from "path";

/**
 * Tests for the `mapra check` command logic.
 * These test the underlying utilities (parseStrandHeader + getGitHash) together,
 * since the check command is a thin orchestration layer on top.
 */
describe("check command logic", () => {
  it("detects current state when git hashes match", () => {
    const rootDir = path.resolve(__dirname, "../../..");
    const currentHash = getGitHash(rootDir);
    expect(currentHash).not.toBeNull();

    // Simulate a .mapra header generated at the current commit
    const header = `MAPRA v3 | test | Typescript | 10 files | 500 lines | generated 2026-03-08T00:00:00 | git:${currentHash}\n`;
    const parsed = parseStrandHeader(header);
    expect(parsed).not.toBeNull();
    expect(parsed!.gitHash).toBe(currentHash);

    // When hashes match, .mapra is current
    const isCurrent = parsed!.gitHash === currentHash;
    expect(isCurrent).toBe(true);
  });

  it("detects stale state when git hashes differ", () => {
    const rootDir = path.resolve(__dirname, "../../..");
    const currentHash = getGitHash(rootDir);
    expect(currentHash).not.toBeNull();

    // Simulate a .mapra header generated at a different commit
    const header = `MAPRA v3 | test | Typescript | 10 files | 500 lines | generated 2026-03-07T00:00:00 | git:0000000\n`;
    const parsed = parseStrandHeader(header);
    expect(parsed).not.toBeNull();
    expect(parsed!.gitHash).toBe("0000000");

    // When hashes differ, .mapra is stale
    const isCurrent = parsed!.gitHash === currentHash;
    expect(isCurrent).toBe(false);
  });

  it("handles legacy header without git hash", () => {
    const header = `MAPRA v3 | test | Typescript | 10 files | 500 lines | generated 2026-03-07T00:00:00\n`;
    const parsed = parseStrandHeader(header);
    expect(parsed).not.toBeNull();
    expect(parsed!.gitHash).toBeNull();

    // With no git hash in header, cannot determine staleness by hash
  });

  it("handles non-git directory gracefully", () => {
    const hash = getGitHash("/tmp");
    expect(hash).toBeNull();

    // With no git available, cannot determine staleness by hash
  });

  it("round-trips: encoded header can be parsed back", () => {
    const graph = {
      projectName: "roundtrip",
      projectType: "test",
      framework: "typescript",
      totalFiles: 42,
      totalLines: 5000,
      nodes: [],
      edges: [],
      modules: [],
    };

    const output = encodeToStrandFormat(graph, undefined, { gitHash: "abc1234" });
    const parsed = parseStrandHeader(output);

    expect(parsed).not.toBeNull();
    expect(parsed!.projectName).toBe("roundtrip");
    expect(parsed!.framework).toBe("Typescript");
    expect(parsed!.fileCount).toBe(42);
    expect(parsed!.lineCount).toBe(5000);
    expect(parsed!.gitHash).toBe("abc1234");
    expect(parsed!.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  });

  it("round-trips without git hash", () => {
    const graph = {
      projectName: "nogit",
      projectType: "test",
      framework: "typescript",
      totalFiles: 10,
      totalLines: 1000,
      nodes: [],
      edges: [],
      modules: [],
    };

    const output = encodeToStrandFormat(graph);
    const parsed = parseStrandHeader(output);

    expect(parsed).not.toBeNull();
    expect(parsed!.projectName).toBe("nogit");
    expect(parsed!.gitHash).toBeNull();
  });
});
