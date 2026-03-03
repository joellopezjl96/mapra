/**
 * Templates and pure logic for CLAUDE.md section management.
 *
 * applyStrandSection() is a pure function: given existing CLAUDE.md content
 * (or null), it returns the new content and an action describing what changed.
 */

export const STRAND_MARKER_START = "<!-- strand:start -->";
export const STRAND_MARKER_END = "<!-- strand:end -->";

/**
 * The canonical section content placed between markers.
 * Starts and ends with a newline so markers sit on their own lines.
 */
export const CLAUDE_MD_SECTION = `
---

## Codebase Map

Before exploring files for any task \u2014 read .strand first. The USAGE line
tells you which sections matter for your task type. Only open individual
files when you need implementation details the encoding doesn't provide.

@.strand
`;

/** Full marked section: start marker + content + end marker + trailing newline. */
export const MARKED_SECTION = `${STRAND_MARKER_START}${CLAUDE_MD_SECTION}${STRAND_MARKER_END}\n`;

export type StrandAction =
  | "created"
  | "upgraded"
  | "legacy-upgraded"
  | "appended"
  | "up-to-date";

/**
 * Pure function: given existing CLAUDE.md content (or null if file doesn't
 * exist), returns the new content with strand section markers and the
 * action that was taken.
 */
export function applyStrandSection(
  existingContent: string | null,
): { content: string; action: StrandAction } {
  // Case A: No CLAUDE.md exists — create from scratch
  if (existingContent === null) {
    return {
      content: `# Project Notes\n\n${MARKED_SECTION}`,
      action: "created",
    };
  }

  // Case B: Markers already present
  const startIdx = existingContent.indexOf(STRAND_MARKER_START);
  const endIdx = existingContent.indexOf(STRAND_MARKER_END);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const between = existingContent.slice(
      startIdx + STRAND_MARKER_START.length,
      endIdx,
    );

    // B1: Content matches — nothing to do
    if (between === CLAUDE_MD_SECTION) {
      return { content: existingContent, action: "up-to-date" };
    }

    // B2: Content differs — replace between markers (inclusive)
    const before = existingContent.slice(0, startIdx);
    const afterRaw = existingContent.slice(
      endIdx + STRAND_MARKER_END.length,
    );
    // Consume one trailing newline since MARKED_SECTION already includes it
    const after = afterRaw.startsWith("\n") ? afterRaw.slice(1) : afterRaw;

    return {
      content: before + MARKED_SECTION + after,
      action: "upgraded",
    };
  }

  // Case C: Legacy @.strand without markers
  const legacyRegex = /\n?---\n+## Codebase Map[\s\S]*?@\.strand\n?/;

  if (legacyRegex.test(existingContent)) {
    let content = existingContent.replace(
      legacyRegex,
      "\n" + MARKED_SECTION,
    );
    // Fix leading newline if legacy section was at the very start
    if (content.startsWith("\n") && !existingContent.startsWith("\n")) {
      content = content.slice(1);
    }
    return { content, action: "legacy-upgraded" };
  }

  // Case D: Neither markers nor @.strand — append
  return {
    content: existingContent.trimEnd() + "\n\n" + MARKED_SECTION,
    action: "appended",
  };
}
