// src/query/__tests__/integration.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { writeCache, loadCache } from "../cache.js";
import { resolveFile } from "../resolve.js";
import { queryBlastRadius, formatBlastRadius } from "../blast-radius.js";
import { queryTestMap } from "../test-map.js";
import { queryRiskProfile } from "../risk-profile.js";
import { createTestGraph, createTestAnalysis } from "./fixture.js";

describe("integration: write → load → query", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "strand-query-int-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("blast_radius query returns correct data after cache roundtrip", () => {
    const graph = createTestGraph();
    const analysis = createTestAnalysis();

    writeCache(tmpDir, graph, analysis, "abc123");
    const cache = loadCache(tmpDir);

    const nodeIds = cache.graph.nodes.map(n => n.id);
    const fileId = resolveFile(nodeIds, "utils.ts");
    expect(fileId).toBe("src/lib/utils.ts");

    const result = queryBlastRadius(fileId, cache);
    expect(result.affectedCount).toBe(3);
    expect(result.cascadePath.length).toBeGreaterThan(0);

    const output = formatBlastRadius(result, false);
    expect(output).toContain("src/lib/utils.ts");
  });

  it("test_map query finds both direct and transitive tests", () => {
    writeCache(tmpDir, createTestGraph(), createTestAnalysis());
    const cache = loadCache(tmpDir);

    const result = queryTestMap("src/lib/utils.ts", cache);
    expect(result.directTests).toContain("src/lib/utils.test.ts");
    expect(result.transitiveTests.length).toBeGreaterThan(0);
  });

  it("risk_profile query collates all data sources", () => {
    writeCache(tmpDir, createTestGraph(), createTestAnalysis());
    const cache = loadCache(tmpDir);

    const result = queryRiskProfile("src/lib/utils.ts", cache);
    expect(result.risk).not.toBeNull();
    expect(result.churn).not.toBeNull();
    expect(result.coChangePartners.length).toBeGreaterThan(0);
    expect(result.tests.testCount).toBe(2);
  });

  it("--json output is valid JSON for blast_radius", () => {
    writeCache(tmpDir, createTestGraph(), createTestAnalysis());
    const cache = loadCache(tmpDir);

    const result = queryBlastRadius("src/lib/utils.ts", cache);
    const json = formatBlastRadius(result, true);
    const parsed = JSON.parse(json);
    expect(parsed.file).toBe("src/lib/utils.ts");
    expect(typeof parsed.affectedCount).toBe("number");
    expect(Array.isArray(parsed.cascadePath)).toBe(true);
  });
});
