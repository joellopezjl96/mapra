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

/** Patterns that indicate architectural changes needing a checkpoint. */
const ARCH_PATTERNS = [
  /\bCreate:\s*`/i,
  /\bcreate\b.*\b(?:new file|module)\b/i,
  /\bSplit\b.*\binto\b/i,
  /\bDelete\b.*`[^`]+`/i,
  /\bRemove\b.*`[^`]+`/i,
  /\bMerge\b.*\binto\b/i,
  /\bMove\b.*\bto\b/i,
];

/**
 * Detects plan steps that make architectural changes (file creation,
 * deletion, splits, merges, moves) without a [CHECKPOINT] step following
 * within the next 2 steps.
 *
 * Returns an array of warning strings, one per missing checkpoint.
 */
export function detectMissingCheckpoints(markdown: string): string[] {
  // Split into steps by ### headings
  const stepRegex = /^###\s+.+$/gm;
  const stepPositions: Array<{ heading: string; start: number }> = [];
  let match;
  while ((match = stepRegex.exec(markdown)) !== null) {
    stepPositions.push({ heading: match[0], start: match.index });
  }

  if (stepPositions.length === 0) return [];

  // Build step bodies
  const steps = stepPositions.map((pos, i) => {
    const end =
      i + 1 < stepPositions.length
        ? stepPositions[i + 1]!.start
        : markdown.length;
    return {
      heading: pos.heading,
      body: markdown.slice(pos.start + pos.heading.length, end),
    };
  });

  const warnings: string[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    const fullText = step.heading + step.body;

    // Check if this step has architectural patterns
    const isArchitectural = ARCH_PATTERNS.some((p) => p.test(fullText));
    if (!isArchitectural) continue;

    // Look ahead up to 2 steps for a [CHECKPOINT]
    let hasCheckpoint = false;
    for (let j = i + 1; j <= Math.min(i + 2, steps.length - 1); j++) {
      if (/\[CHECKPOINT\]/i.test(steps[j]!.heading)) {
        hasCheckpoint = true;
        break;
      }
    }

    if (!hasCheckpoint) {
      // Extract file paths for the warning message
      const files: string[] = [];
      const backtickPaths = fullText.match(/`([^`]*\/[^`]+)`/g) ?? [];
      for (const bp of backtickPaths) {
        files.push(bp.replace(/`/g, ""));
      }
      const fileList = files.length > 0 ? ` (${files.join(", ")})` : "";
      const label = step.heading.replace(/^###\s+/, "").trim();
      warnings.push(
        `${label} creates/deletes/moves files${fileList} but no [CHECKPOINT] follows within 2 steps.`,
      );
    }
  }

  return warnings;
}
