// src/query/__tests__/cache.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
import { writeCache, loadCache, checkStaleness, ensureCacheInGitignore, type MapraCache } from "../cache.js";
import { createTestGraph, createTestAnalysis, createTestCache } from "./fixture.js";

describe("writeCache + loadCache roundtrip", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "strand-cache-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("roundtrips graph and analysis through JSON", () => {
    const graph = createTestGraph();
    const analysis = createTestAnalysis();

    writeCache(tmpDir, graph, analysis, "abc123");

    const cache = loadCache(tmpDir);
    expect(cache.version).toBe(1);
    expect(cache.gitHead).toBe("abc123");
    expect(cache.graph.nodes).toHaveLength(graph.nodes.length);
    expect(cache.graph.edges).toHaveLength(graph.edges.length);
    expect(cache.analysis.risk).toHaveLength(analysis.risk.length);
    expect(cache.analysis.coChanges).toHaveLength(analysis.coChanges.length);
  });

  it("converts churn Map to object and back", () => {
    const graph = createTestGraph();
    const analysis = createTestAnalysis();

    writeCache(tmpDir, graph, analysis);

    const cache = loadCache(tmpDir);
    expect(cache.analysis.churn).toBeInstanceOf(Map);
    expect(cache.analysis.churn.size).toBe(1);
    const entry = cache.analysis.churn.get("src/lib/utils.ts");
    expect(entry?.commits30d).toBe(8);
    expect(entry?.linesAdded30d).toBe(120);
  });

  it("writes gitHead as undefined when no git", () => {
    writeCache(tmpDir, createTestGraph(), createTestAnalysis());
    const cache = loadCache(tmpDir);
    expect(cache.gitHead).toBeUndefined();
  });
});

describe("loadCache error handling", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "strand-cache-err-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("throws when cache file does not exist", () => {
    expect(() => loadCache(tmpDir)).toThrow(
      "No .mapra-cache.json found. Run 'mapra generate' first."
    );
  });

  it("throws on corrupted JSON", () => {
    fs.writeFileSync(path.join(tmpDir, ".mapra-cache.json"), "not json{{{");
    expect(() => loadCache(tmpDir)).toThrow(
      ".mapra-cache.json is corrupted. Run 'mapra generate' to rebuild."
    );
  });

  it("throws on version mismatch", () => {
    const bad = JSON.stringify({ version: 99, graph: {}, analysis: {} });
    fs.writeFileSync(path.join(tmpDir, ".mapra-cache.json"), bad);
    expect(() => loadCache(tmpDir)).toThrow(
      "Cache format is incompatible. Run 'mapra generate' to rebuild."
    );
  });
});

describe("checkStaleness", () => {
  it("returns null when gitHead is absent", () => {
    // Omit gitHead entirely to satisfy exactOptionalPropertyTypes
    const { gitHead: _, ...rest } = createTestCache();
    const cache = rest as MapraCache;
    expect(checkStaleness(cache)).toBeNull();
  });

  it("returns null when gitHead matches current HEAD", () => {
    // This test only works inside a git repo (which this project is).
    const currentHead = execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
    const cache = createTestCache({ gitHead: currentHead });
    expect(checkStaleness(cache)).toBeNull();
  });

  it("returns warning with commit count when gitHead is stale", () => {
    // Use a known-old commit from this repo's history
    const oldHead = execSync("git rev-parse HEAD~1", { encoding: "utf-8" }).trim();
    const cache = createTestCache({ gitHead: oldHead });
    const result = checkStaleness(cache);
    expect(result).toContain("cache generated before");
    expect(result).toContain("commits");
  });

  it("returns generic warning when rev-list fails (e.g. pruned history)", () => {
    const cache = createTestCache({ gitHead: "0000000000000000000000000000000000000000" });
    const result = checkStaleness(cache);
    expect(result).toContain("cache may be stale");
  });
});

describe("ensureCacheInGitignore", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "strand-gitignore-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates .gitignore if it does not exist", () => {
    ensureCacheInGitignore(tmpDir);
    const content = fs.readFileSync(path.join(tmpDir, ".gitignore"), "utf-8");
    expect(content).toBe(".mapra-cache.json\n");
  });

  it("appends entry to existing .gitignore", () => {
    fs.writeFileSync(path.join(tmpDir, ".gitignore"), "node_modules\n");
    ensureCacheInGitignore(tmpDir);
    const content = fs.readFileSync(path.join(tmpDir, ".gitignore"), "utf-8");
    expect(content).toBe("node_modules\n.mapra-cache.json\n");
  });

  it("adds newline separator when existing file lacks trailing newline", () => {
    fs.writeFileSync(path.join(tmpDir, ".gitignore"), "node_modules");
    ensureCacheInGitignore(tmpDir);
    const content = fs.readFileSync(path.join(tmpDir, ".gitignore"), "utf-8");
    expect(content).toBe("node_modules\n.mapra-cache.json\n");
  });

  it("skips if entry is already present", () => {
    fs.writeFileSync(path.join(tmpDir, ".gitignore"), "node_modules\n.mapra-cache.json\n");
    ensureCacheInGitignore(tmpDir);
    const content = fs.readFileSync(path.join(tmpDir, ".gitignore"), "utf-8");
    expect(content).toBe("node_modules\n.mapra-cache.json\n");
  });
});
