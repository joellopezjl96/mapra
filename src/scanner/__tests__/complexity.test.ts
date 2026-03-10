import { describe, it, expect } from "vitest";
import { scanCodebase } from "../index.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

function scaffoldAndScan(files: Record<string, string>) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "strand-complexity-"));
  fs.writeFileSync(
    path.join(tmp, "package.json"),
    '{"name":"test","dependencies":{"react":"18.0.0"}}',
  );
  for (const [filePath, content] of Object.entries(files)) {
    const full = path.join(tmp, filePath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  const graph = scanCodebase(tmp);
  fs.rmSync(tmp, { recursive: true, force: true });
  return graph;
}

describe("calculateComplexity — P95 normalization", () => {
  it("outlier file clamps to 1.0, does not compress others", () => {
    const files: Record<string, string> = {};
    // 20 normal files (~50 lines each)
    for (let i = 0; i < 20; i++) {
      const lines = Array.from({ length: 50 }, (_, j) =>
        `export const val${j} = ${j};`,
      ).join("\n");
      files[`src/file-${i}.ts`] = lines;
    }
    // 1 outlier with 5000 lines
    const outlierLines = Array.from({ length: 5000 }, (_, j) =>
      `export const data${j} = "${j}";`,
    ).join("\n");
    files["src/outlier.ts"] = outlierLines;

    const graph = scaffoldAndScan(files);
    const outlier = graph.nodes.find(n => n.name === "outlier.ts");
    const normal = graph.nodes.filter(n => n.name.startsWith("file-"));

    // Outlier should clamp to 1.0 (or very close due to rounding)
    expect(outlier!.complexity).toBeGreaterThanOrEqual(0.59);

    // Normal files should NOT be compressed near 0
    // Old behavior: 50/5000 * 0.6 = 0.006. New: 50/~50 * 0.6 = ~0.6
    const avgComplexity = normal.reduce((sum, n) => sum + n.complexity, 0) / normal.length;
    expect(avgComplexity).toBeGreaterThan(0.3);
  });

  it("files above P95 all clamp to max complexity", () => {
    const files: Record<string, string> = {};
    // 19 small files
    for (let i = 0; i < 19; i++) {
      const lines = Array.from({ length: 10 }, (_, j) =>
        `export const v${j} = ${j};`,
      ).join("\n");
      files[`src/small-${i}.ts`] = lines;
    }
    // 2 large files above P95
    for (let i = 0; i < 2; i++) {
      const lines = Array.from({ length: 2000 }, (_, j) =>
        `export const big${j} = ${j};`,
      ).join("\n");
      files[`src/big-${i}.ts`] = lines;
    }

    const graph = scaffoldAndScan(files);
    const bigFiles = graph.nodes.filter(n => n.name.startsWith("big-"));

    // Both should be clamped high (above P95)
    for (const f of bigFiles) {
      expect(f.complexity).toBeGreaterThanOrEqual(0.6); // line component alone should be 0.6
    }
  });

  it("uniform files get similar complexity scores", () => {
    const files: Record<string, string> = {};
    // 10 files, all ~100 lines
    for (let i = 0; i < 10; i++) {
      const lines = Array.from({ length: 100 }, (_, j) =>
        `export const v${j} = ${j};`,
      ).join("\n");
      files[`src/uniform-${i}.ts`] = lines;
    }

    const graph = scaffoldAndScan(files);
    const uniformFiles = graph.nodes.filter(n => n.name.startsWith("uniform-"));
    const complexities = uniformFiles.map(n => n.complexity);

    // All should be close to each other
    const min = Math.min(...complexities);
    const max = Math.max(...complexities);
    expect(max - min).toBeLessThan(0.1);
  });
});
