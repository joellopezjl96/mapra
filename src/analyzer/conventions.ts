/**
 * Convention Detector — identifies import patterns repeated across files of the same type.
 *
 * A "convention" is a dependency imported by >= 60% of files with a given type
 * (e.g., 8/12 API routes import Sentry). Minimum 3 files of that type required.
 */

import type { StrandNode, StrandEdge } from "../scanner/index.js";

const CONVENTION_THRESHOLD = 0.6;
const VIOLATION_THRESHOLD = 0.7;
const MIN_TYPE_COUNT = 3;

export interface Convention {
  anchorFile: string;
  anchorExports: string[];
  consumerType: string;
  adoption: number;
  total: number;
  coverage: number;
  violators: string[];  // files of this type that DON'T follow the convention (for coverage >= 70%)
}

/**
 * Detect import conventions from graph data.
 * Returns conventions sorted by coverage descending.
 */
export function detectConventions(
  nodes: StrandNode[],
  edges: StrandEdge[],
): Convention[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Group non-test, non-config nodes by type
  const byType = new Map<string, StrandNode[]>();
  for (const node of nodes) {
    if (node.type === "test" || node.type === "config" || node.type === "schema") continue;
    const existing = byType.get(node.type) ?? [];
    existing.push(node);
    byType.set(node.type, existing);
  }

  // Build forward adjacency from non-test edges
  const imports = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (edge.type === "tests") continue;
    const set = imports.get(edge.from) ?? new Set();
    set.add(edge.to);
    imports.set(edge.from, set);
  }

  const conventions: Convention[] = [];

  for (const [type, typeNodes] of byType) {
    if (typeNodes.length < MIN_TYPE_COUNT) continue;

    // Count how many nodes of this type import each dependency
    const depCounts = new Map<string, number>();
    for (const node of typeNodes) {
      const deps = imports.get(node.id);
      if (!deps) continue;
      for (const dep of deps) {
        depCounts.set(dep, (depCounts.get(dep) ?? 0) + 1);
      }
    }

    // Check each dependency against threshold
    for (const [dep, count] of depCounts) {
      const coverage = count / typeNodes.length;
      if (coverage < CONVENTION_THRESHOLD) continue;

      // Skip self-type dependencies (api-route importing another api-route isn't a convention)
      const depNode = nodeMap.get(dep);
      if (depNode?.type === type) continue;

      // Find violators: files of this type that DON'T import the convention dep
      // Only populate for conventions with >= 70% adoption (strong conventions)
      let violators: string[] = [];
      if (coverage >= VIOLATION_THRESHOLD) {
        violators = typeNodes
          .filter((n) => {
            const deps = imports.get(n.id);
            return !deps || !deps.has(dep);
          })
          .map((n) => n.id);
      }

      conventions.push({
        anchorFile: dep,
        anchorExports: depNode?.exports?.filter((e) => e !== "default") ?? [],
        consumerType: type,
        adoption: count,
        total: typeNodes.length,
        coverage,
        violators,
      });
    }
  }

  return conventions.sort((a, b) => b.coverage - a.coverage);
}
