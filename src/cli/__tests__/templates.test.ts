import { describe, it, expect } from "vitest";
import {
  applyStrandSection,
  CLAUDE_MD_SECTION,
  MARKED_SECTION,
  STRAND_MARKER_START,
  STRAND_MARKER_END,
  SUPERSESSION_MESSAGE,
} from "../templates.js";

describe("applyStrandSection", () => {
  it("Case A: null input creates new CLAUDE.md with markers", () => {
    const { content, action } = applyStrandSection(null);
    expect(action).toBe("created");
    expect(content).toContain("# Project Notes");
    expect(content).toContain(STRAND_MARKER_START);
    expect(content).toContain(STRAND_MARKER_END);
    expect(content).toContain("@.strand");
  });

  it("Case B1: markers present with matching content returns up-to-date", () => {
    const existing = `# My Project\n\n${MARKED_SECTION}`;
    const { content, action } = applyStrandSection(existing);
    expect(action).toBe("up-to-date");
    expect(content).toBe(existing);
  });

  it("section content includes freshness carve-out", () => {
    expect(CLAUDE_MD_SECTION).toContain(
      "always prefer the\nmost recently read version",
    );
    expect(CLAUDE_MD_SECTION).toContain("generated");
  });

  it("Case B2: markers present with different content replaces section", () => {
    const oldSection = `${STRAND_MARKER_START}\nold content\n${STRAND_MARKER_END}\n`;
    const existing = `# My Project\n\n${oldSection}`;
    const { content, action } = applyStrandSection(existing);
    expect(action).toBe("upgraded");
    expect(content).toContain(STRAND_MARKER_START);
    expect(content).toContain(CLAUDE_MD_SECTION);
    expect(content).toContain(STRAND_MARKER_END);
    expect(content).not.toContain("old content");
  });

  it("Case C: legacy @.strand without markers gets legacy-upgraded", () => {
    const existing =
      "# Project Notes\n\n---\n\n## Codebase Map\n\nOld description.\n\n@.strand\n";
    const { content, action } = applyStrandSection(existing);
    expect(action).toBe("legacy-upgraded");
    expect(content).toContain(STRAND_MARKER_START);
    expect(content).toContain(STRAND_MARKER_END);
    expect(content).toContain("# Project Notes");
    expect(content).not.toContain("Old description");
  });

  it("Case D: neither markers nor @.strand appends section", () => {
    const existing = "# My Project\n\nSome existing content.";
    const { content, action } = applyStrandSection(existing);
    expect(action).toBe("appended");
    expect(content.startsWith("# My Project")).toBe(true);
    expect(content).toContain("Some existing content.");
    expect(content).toContain(STRAND_MARKER_START);
    expect(content).toContain(STRAND_MARKER_END);
  });

  it("Edge: preserves content above and below legacy section", () => {
    const existing =
      "# Notes\n\nAbove content.\n\n---\n\n## Codebase Map\n\nOld text.\n\n@.strand\n\nBelow content.\n";
    const { content, action } = applyStrandSection(existing);
    expect(action).toBe("legacy-upgraded");
    expect(content).toContain("Above content.");
    expect(content).toContain("Below content.");
    expect(content).toContain(STRAND_MARKER_START);
  });

  it("Edge: handles CLAUDE.md that is just the legacy section", () => {
    const existing = "---\n\n## Codebase Map\n\nOld.\n\n@.strand\n";
    const { content, action } = applyStrandSection(existing);
    expect(action).toBe("legacy-upgraded");
    expect(content).toContain(STRAND_MARKER_START);
    expect(content).toContain(STRAND_MARKER_END);
    expect(content.startsWith("\n")).toBe(false);
  });

  it("Edge: @.strand exists but legacy regex doesn't match — wraps instead of duplicating", () => {
    const existing = "# Notes\n\nSome custom section with\n\n@.strand\n";
    const { content, action } = applyStrandSection(existing);
    expect(action).toBe("legacy-upgraded");
    expect(content).toContain(STRAND_MARKER_START);
    // Must not duplicate @.strand
    const count = (content.match(/@\.strand/g) || []).length;
    expect(count).toBe(1);
  });

  it("Edge: markers always wrap CLAUDE_MD_SECTION content exactly", () => {
    const cases = [
      applyStrandSection(null), // created
      applyStrandSection(
        `# X\n\n${STRAND_MARKER_START}\nold\n${STRAND_MARKER_END}\n`,
      ), // upgraded
      applyStrandSection("---\n\n## Codebase Map\n\n@.strand\n"), // legacy-upgraded
      applyStrandSection("# X"), // appended
    ];

    for (const { content, action } of cases) {
      const startIdx = content.indexOf(STRAND_MARKER_START);
      const endIdx = content.indexOf(STRAND_MARKER_END);
      expect(startIdx, `${action}: start marker missing`).not.toBe(-1);
      expect(endIdx, `${action}: end marker missing`).not.toBe(-1);
      const between = content.slice(
        startIdx + STRAND_MARKER_START.length,
        endIdx,
      );
      expect(between, `${action}: section content mismatch`).toBe(
        CLAUDE_MD_SECTION,
      );
    }
  });
});

describe("SUPERSESSION_MESSAGE", () => {
  it("includes ISO timestamp and supersession text", () => {
    const msg = SUPERSESSION_MESSAGE("2026-03-02T14:22:10");
    expect(msg).toContain("2026-03-02T14:22:10");
    expect(msg).toContain("supersedes any prior .strand in context");
    expect(msg).toContain(".strand regenerated");
  });
});
