/**
 * .mapra Header Parser — extracts metadata from the MAPRA header line.
 *
 * Parses headers like:
 *   MAPRA v3 | project | Typescript | 76 files | 12,629 lines | generated 2026-03-07T05:21:49 | git:f9e429a
 *   MAPRA v3 | project | Typescript | 76 files | 12,629 lines | generated 2026-03-07T05:21:49
 */

export interface StrandHeaderInfo {
  /** Format version string, e.g. "v3" */
  version: string;
  /** Project name */
  projectName: string;
  /** Framework/language, e.g. "Typescript" */
  framework: string;
  /** Total file count */
  fileCount: number;
  /** Total line count */
  lineCount: number;
  /** Generation timestamp (ISO-8601 without timezone, e.g. "2026-03-07T05:21:49") */
  timestamp: string;
  /** Short git hash at generation time, or null if not present (legacy format) */
  gitHash: string | null;
}

/**
 * Parse a .mapra file's header line and extract structured metadata.
 * Returns null if the content doesn't contain a valid MAPRA header.
 */
export function parseStrandHeader(content: string): StrandHeaderInfo | null {
  // Take only the first line
  const firstLine = content.split("\n")[0];
  if (!firstLine || !firstLine.startsWith("MAPRA ")) return null;

  // Split on " | " to get segments
  const segments = firstLine.split(" | ");
  if (segments.length < 6) return null;

  // Segment 0: "MAPRA v3"
  const versionMatch = segments[0]?.match(/^MAPRA\s+(v\d+)$/);
  if (!versionMatch) return null;
  const version = versionMatch[1]!;

  // Segment 1: project name
  const projectName = segments[1]?.trim() ?? "";

  // Segment 2: framework/language
  const framework = segments[2]?.trim() ?? "";

  // Segment 3: "76 files"
  const fileMatch = segments[3]?.match(/^([\d,]+)\s+files?$/);
  const fileCount = fileMatch ? parseInt(fileMatch[1]!.replace(/,/g, ""), 10) : 0;

  // Segment 4: "12,629 lines"
  const lineMatch = segments[4]?.match(/^([\d,]+)\s+lines?$/);
  const lineCount = lineMatch ? parseInt(lineMatch[1]!.replace(/,/g, ""), 10) : 0;

  // Segment 5: "generated 2026-03-07T05:21:49"
  const tsMatch = segments[5]?.match(/^generated\s+(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})$/);
  if (!tsMatch) return null;
  const timestamp = tsMatch[1]!;

  // Segment 6 (optional): "git:f9e429a"
  let gitHash: string | null = null;
  if (segments.length >= 7) {
    const gitMatch = segments[6]?.match(/^git:([a-f0-9]+)$/);
    if (gitMatch) {
      gitHash = gitMatch[1]!;
    }
  }

  return {
    version,
    projectName,
    framework,
    fileCount,
    lineCount,
    timestamp,
    gitHash,
  };
}
