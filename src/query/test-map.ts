// src/query/test-map.ts
import { buildReverseAdjacency, bfsWithParents } from "../analyzer/graph-utils.js";
import type { StrandCache } from "./cache.js";

export interface TestMapResult {
  file: string;
  testCount: number;
  directTests: string[];
  transitiveTests: Array<{ test: string; via: string }>;
}

export function queryTestMap(fileId: string, cache: StrandCache): TestMapResult {
  // Build reverse adjacency WITHOUT excluding test edges —
  // the goal is specifically to find test files in the import chain
  const reverseAdj = buildReverseAdjacency(cache.graph.edges, false);
  const { depths, parents } = bfsWithParents(fileId, reverseAdj);

  const testNodeIds = new Set(
    cache.graph.nodes.filter(n => n.type === "test").map(n => n.id),
  );

  const directTests: string[] = [];
  const transitiveTests: Array<{ test: string; via: string }> = [];

  for (const [nodeId, depth] of depths) {
    if (!testNodeIds.has(nodeId)) continue;

    if (depth === 1) {
      directTests.push(nodeId);
    } else {
      // Trace one step back from test node to find the "via" intermediate
      const via = parents.get(nodeId) ?? "";
      transitiveTests.push({ test: nodeId, via });
    }
  }

  return {
    file: fileId,
    testCount: directTests.length + transitiveTests.length,
    directTests: directTests.sort(),
    transitiveTests: transitiveTests.sort((a, b) => a.test.localeCompare(b.test)),
  };
}

export function formatTestMap(result: TestMapResult, json: boolean): string {
  if (json) return JSON.stringify(result, null, 2);

  const lines: string[] = [];
  lines.push(
    `${result.file} \u2014 ${result.testCount} test files connected (structural, not runtime coverage)`,
  );

  if (result.directTests.length > 0) {
    lines.push(`direct: ${result.directTests.join(", ")}`);
  }

  for (const t of result.transitiveTests) {
    lines.push(`transitive: ${t.test} (via ${t.via})`);
  }

  return lines.join("\n");
}
