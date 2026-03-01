/**
 * Plan Parser — extracts file path references from markdown documents.
 *
 * Looks for paths in backticks, code blocks, and task file lists.
 * Strips line number suffixes (:123-145). Deduplicates.
 */

// Match src/... or prisma/... or similar project paths
const PATH_PATTERN = /(?:src|prisma|docs|scripts|public|app|lib|components)\/[\w./-]+\.(?:ts|tsx|js|jsx|json|prisma|css|md)/g;

/**
 * Extract file paths from markdown content.
 * Returns deduplicated array of normalized paths.
 */
export function extractFilePaths(markdown: string): string[] {
  const paths = new Set<string>();

  // Match paths in backticks: `src/lib/ordering.ts:123-145`
  const backtickRegex = /`([^`]+)`/g;
  let match;
  while ((match = backtickRegex.exec(markdown)) !== null) {
    const content = match[1]!;
    // Strip line number suffixes
    const cleaned = content.replace(/:\d+(-\d+)?$/, "");
    // Strip "Modify: ", "Create: ", "Test: " prefixes
    const stripped = cleaned.replace(/^(?:Modify|Create|Test|File):\s*/i, "");
    if (PATH_PATTERN.test(stripped)) {
      paths.add(stripped);
    }
    // Reset regex lastIndex since we're reusing it
    PATH_PATTERN.lastIndex = 0;
  }

  // Also scan raw text for paths (e.g., in code block comments)
  const rawMatches = markdown.match(PATH_PATTERN) ?? [];
  for (const p of rawMatches) {
    paths.add(p.replace(/:\d+(-\d+)?$/, ""));
  }

  return [...paths].sort();
}
