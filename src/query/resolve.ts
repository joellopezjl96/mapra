// src/query/resolve.ts

/**
 * Resolve user-provided file path against cached node IDs.
 * Supports exact match, backslash normalization, and suffix matching.
 * Throws with actionable error messages on ambiguous or missing matches.
 */
export function resolveFile(nodeIds: string[], input: string): string {
  const normalized = input.replace(/\\/g, "/").replace(/^\//, "");

  // Exact match (O(1) via Set)
  const idSet = new Set(nodeIds);
  if (idSet.has(normalized)) return normalized;

  // Suffix match
  const suffix = "/" + normalized;
  const matches = nodeIds.filter(id => id.endsWith(suffix));

  if (matches.length === 1) return matches[0]!;

  if (matches.length > 1) {
    const candidates = matches.map(m => "  " + m).join("\n");
    throw new Error(
      `Multiple matches for '${input}':\n${candidates}\nSpecify the full path.`,
    );
  }

  throw new Error(`'${input}' not found in cache. Check the path or run 'strnd generate'.`);
}
