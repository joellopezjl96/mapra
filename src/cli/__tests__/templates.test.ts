import { describe, it, expect } from "vitest";
import {
  applyMapraSection,
  CLAUDE_MD_SECTION,
  MARKED_SECTION,
  MAPRA_MARKER_START,
  MAPRA_MARKER_END,
  SUPERSESSION_MESSAGE,
} from "../templates.js";

describe("applyMapraSection", () => {
  it("Case A: null input creates new CLAUDE.md with markers", () => {
    const { content, action } = applyMapraSection(null);
    expect(action).toBe("created");
    expect(content).toContain("# Project Notes");
    expect(content).toContain(MAPRA_MARKER_START);
    expect(content).toContain(MAPRA_MARKER_END);
    expect(content).toContain("@.mapra");
  });

  it("Case B1: markers present with matching content returns up-to-date", () => {
    const existing = `# My Project\n\n${MARKED_SECTION}`;
    const { content, action } = applyMapraSection(existing);
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
    const oldSection = `${MAPRA_MARKER_START}\nold content\n${MAPRA_MARKER_END}\n`;
    const existing = `# My Project\n\n${oldSection}`;
    const { content, action } = applyMapraSection(existing);
    expect(action).toBe("upgraded");
    expect(content).toContain(MAPRA_MARKER_START);
    expect(content).toContain(CLAUDE_MD_SECTION);
    expect(content).toContain(MAPRA_MARKER_END);
    expect(content).not.toContain("old content");
  });

  it("Case C: legacy @.mapra without markers gets legacy-upgraded", () => {
    const existing =
      "# Project Notes\n\n---\n\n## Codebase Map\n\nOld description.\n\n@.mapra\n";
    const { content, action } = applyMapraSection(existing);
    expect(action).toBe("legacy-upgraded");
    expect(content).toContain(MAPRA_MARKER_START);
    expect(content).toContain(MAPRA_MARKER_END);
    expect(content).toContain("# Project Notes");
    expect(content).not.toContain("Old description");
  });

  it("Case D: neither markers nor @.mapra appends section", () => {
    const existing = "# My Project\n\nSome existing content.";
    const { content, action } = applyMapraSection(existing);
    expect(action).toBe("appended");
    expect(content.startsWith("# My Project")).toBe(true);
    expect(content).toContain("Some existing content.");
    expect(content).toContain(MAPRA_MARKER_START);
    expect(content).toContain(MAPRA_MARKER_END);
  });

  it("Edge: preserves content above and below legacy section", () => {
    const existing =
      "# Notes\n\nAbove content.\n\n---\n\n## Codebase Map\n\nOld text.\n\n@.mapra\n\nBelow content.\n";
    const { content, action } = applyMapraSection(existing);
    expect(action).toBe("legacy-upgraded");
    expect(content).toContain("Above content.");
    expect(content).toContain("Below content.");
    expect(content).toContain(MAPRA_MARKER_START);
  });

  it("Edge: handles CLAUDE.md that is just the legacy section", () => {
    const existing = "---\n\n## Codebase Map\n\nOld.\n\n@.mapra\n";
    const { content, action } = applyMapraSection(existing);
    expect(action).toBe("legacy-upgraded");
    expect(content).toContain(MAPRA_MARKER_START);
    expect(content).toContain(MAPRA_MARKER_END);
    expect(content.startsWith("\n")).toBe(false);
  });

  it("Edge: @.mapra exists but legacy regex doesn't match — wraps instead of duplicating", () => {
    const existing = "# Notes\n\nSome custom section with\n\n@.mapra\n";
    const { content, action } = applyMapraSection(existing);
    expect(action).toBe("legacy-upgraded");
    expect(content).toContain(MAPRA_MARKER_START);
    // Must not duplicate @.mapra
    const count = (content.match(/@\.mapra/g) || []).length;
    expect(count).toBe(1);
  });

  it("Edge: markers always wrap CLAUDE_MD_SECTION content exactly", () => {
    const cases = [
      applyMapraSection(null), // created
      applyMapraSection(
        `# X\n\n${MAPRA_MARKER_START}\nold\n${MAPRA_MARKER_END}\n`,
      ), // upgraded
      applyMapraSection("---\n\n## Codebase Map\n\n@.mapra\n"), // legacy-upgraded
      applyMapraSection("# X"), // appended
    ];

    for (const { content, action } of cases) {
      const startIdx = content.indexOf(MAPRA_MARKER_START);
      const endIdx = content.indexOf(MAPRA_MARKER_END);
      expect(startIdx, `${action}: start marker missing`).not.toBe(-1);
      expect(endIdx, `${action}: end marker missing`).not.toBe(-1);
      const between = content.slice(
        startIdx + MAPRA_MARKER_START.length,
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
    expect(msg).toContain("supersedes any prior .mapra in context");
    expect(msg).toContain(".mapra regenerated");
  });

  it("produces ISO-8601 compatible output when given a real timestamp", () => {
    const ts = new Date().toISOString().slice(0, 19);
    const msg = SUPERSESSION_MESSAGE(ts);
    expect(msg).toMatch(/^\.mapra regenerated \(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\)/);
  });
});
