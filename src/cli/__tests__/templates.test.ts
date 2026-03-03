import { describe, it, expect } from "vitest";
import { SUPERSESSION_MESSAGE, CLAUDE_MD_SECTION } from "../templates.js";

describe("SUPERSESSION_MESSAGE", () => {
  it("contains a timestamp placeholder token", () => {
    // The message is a function that takes an ISO timestamp
    const msg = SUPERSESSION_MESSAGE("2026-03-02T14:22:10");
    expect(msg).toContain("2026-03-02T14:22:10");
  });

  it("contains the word 'supersedes'", () => {
    const msg = SUPERSESSION_MESSAGE("2026-03-02T14:22:10");
    expect(msg).toContain("supersedes");
  });

  it("mentions 'prior .strand in context'", () => {
    const msg = SUPERSESSION_MESSAGE("2026-03-02T14:22:10");
    expect(msg).toContain("prior .strand in context");
  });
});

describe("SUPERSESSION_MESSAGE format", () => {
  it("produces ISO-8601 compatible output when given a real timestamp", () => {
    const ts = new Date().toISOString().slice(0, 19);
    const msg = SUPERSESSION_MESSAGE(ts);
    // Verify the full line matches the expected shape
    expect(msg).toMatch(/^\.strand regenerated \(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\) — supersedes any prior \.strand in context\.$/)
  });
});

describe("CLAUDE_MD_SECTION", () => {
  it("contains the @.strand reference", () => {
    expect(CLAUDE_MD_SECTION).toContain("@.strand");
  });

  it("contains the mid-session carve-out", () => {
    expect(CLAUDE_MD_SECTION).toContain("most recently read .strand");
  });

  it("contains the original trust directive", () => {
    expect(CLAUDE_MD_SECTION).toContain("ground truth");
  });
});
