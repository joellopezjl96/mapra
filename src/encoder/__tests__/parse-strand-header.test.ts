import { describe, it, expect } from "vitest";
import { parseStrandHeader } from "../parse-strand-header.js";

describe("parseStrandHeader", () => {
  it("parses a full header with git hash", () => {
    const content =
      "STRAND v3 | myproject | Typescript | 76 files | 12,629 lines | generated 2026-03-07T05:21:49 | git:f9e429a\n" +
      "LEGEND: ...\n";
    const result = parseStrandHeader(content);
    expect(result).not.toBeNull();
    expect(result!.version).toBe("v3");
    expect(result!.projectName).toBe("myproject");
    expect(result!.framework).toBe("Typescript");
    expect(result!.fileCount).toBe(76);
    expect(result!.lineCount).toBe(12629);
    expect(result!.timestamp).toBe("2026-03-07T05:21:49");
    expect(result!.gitHash).toBe("f9e429a");
  });

  it("parses a header without git hash (legacy format)", () => {
    const content =
      "STRAND v3 | strand | Typescript | 76 files | 12,629 lines | generated 2026-03-07T05:21:49\n";
    const result = parseStrandHeader(content);
    expect(result).not.toBeNull();
    expect(result!.version).toBe("v3");
    expect(result!.projectName).toBe("strand");
    expect(result!.fileCount).toBe(76);
    expect(result!.lineCount).toBe(12629);
    expect(result!.timestamp).toBe("2026-03-07T05:21:49");
    expect(result!.gitHash).toBeNull();
  });

  it("parses headers with small file/line counts", () => {
    const content =
      "STRAND v3 | small | Typescript | 3 files | 300 lines | generated 2026-01-01T00:00:00\n";
    const result = parseStrandHeader(content);
    expect(result).not.toBeNull();
    expect(result!.fileCount).toBe(3);
    expect(result!.lineCount).toBe(300);
  });

  it("parses headers with large comma-separated counts", () => {
    const content =
      "STRAND v3 | calcom | Typescript | 7,444 files | 906,123 lines | generated 2026-03-08T12:00:00 | git:abc1234\n";
    const result = parseStrandHeader(content);
    expect(result).not.toBeNull();
    expect(result!.fileCount).toBe(7444);
    expect(result!.lineCount).toBe(906123);
    expect(result!.gitHash).toBe("abc1234");
  });

  it("returns null for empty input", () => {
    expect(parseStrandHeader("")).toBeNull();
  });

  it("returns null for non-strand content", () => {
    expect(parseStrandHeader("# README\n\nSome content.")).toBeNull();
  });

  it("returns null for malformed header (too few segments)", () => {
    expect(parseStrandHeader("STRAND v3 | myproject | Typescript")).toBeNull();
  });

  it("returns null for header without valid timestamp", () => {
    const content =
      "STRAND v3 | myproject | Typescript | 10 files | 500 lines | no-timestamp-here\n";
    expect(parseStrandHeader(content)).toBeNull();
  });

  it("handles multi-line content, only parses first line", () => {
    const content = [
      "STRAND v3 | test | Typescript | 5 files | 1,000 lines | generated 2026-03-08T10:00:00 | git:deadbeef",
      "LEGEND: some legend text",
      "USAGE: planning->RISK",
      "",
      "--- RISK ---",
    ].join("\n");
    const result = parseStrandHeader(content);
    expect(result).not.toBeNull();
    expect(result!.gitHash).toBe("deadbeef");
    expect(result!.fileCount).toBe(5);
  });
});
