/**
 * Git Churn Analyzer — computes per-file change frequency from git history.
 *
 * Shells out to `git log --numstat` once for the entire repo,
 * parses the output, and returns per-file churn metrics.
 */

import { execSync } from "child_process";

export interface ChurnResult {
  nodeId: string;
  commits30d: number;
  linesAdded30d: number;
  linesRemoved30d: number;
  lastCommitHash: string;
  lastCommitDate: string;
  lastCommitMsg: string;
}

/**
 * Parse raw `git log --numstat --format="%h|%aI|%s"` output
 * into per-file churn metrics.
 */
export function parseGitLogOutput(raw: string): Map<string, ChurnResult> {
  const results = new Map<string, ChurnResult>();
  if (!raw.trim()) return results;

  const lines = raw.split("\n");
  let currentHash = "";
  let currentDate = "";
  let currentMsg = "";

  for (const line of lines) {
    // Header line: hash|date|message
    const headerMatch = line.match(/^([a-f0-9]+)\|([^|]+)\|(.+)$/);
    if (headerMatch) {
      currentHash = headerMatch[1]!;
      currentDate = headerMatch[2]!;
      currentMsg = headerMatch[3]!;
      continue;
    }

    // Numstat line: added\tremoved\tpath
    const statMatch = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
    if (statMatch) {
      const added = statMatch[1]!;
      const removed = statMatch[2]!;
      const filePath = statMatch[3]!;

      // Skip binary files (- - in numstat)
      if (added === "-" || removed === "-") continue;

      // Normalize Windows backslashes
      const normalized = filePath.replace(/\\/g, "/");

      const existing = results.get(normalized);
      if (existing) {
        existing.commits30d++;
        existing.linesAdded30d += parseInt(added, 10);
        existing.linesRemoved30d += parseInt(removed, 10);
        // Keep the first (most recent) commit info since git log is newest-first
      } else {
        results.set(normalized, {
          nodeId: normalized,
          commits30d: 1,
          linesAdded30d: parseInt(added, 10),
          linesRemoved30d: parseInt(removed, 10),
          lastCommitHash: currentHash,
          lastCommitDate: currentDate,
          lastCommitMsg: currentMsg,
        });
      }
    }
  }

  return results;
}

/**
 * Compute churn for all files in a git repo.
 * Returns empty map if not in a git repo or git is unavailable.
 */
export function computeChurn(rootDir: string): Map<string, ChurnResult> {
  try {
    // Detect shallow clone — churn data will be incomplete/empty
    try {
      const isShallow = execSync("git rev-parse --is-shallow-repository", {
        cwd: rootDir,
        encoding: "utf-8",
        timeout: 5000,
      }).trim();
      if (isShallow === "true") {
        console.warn(
          "Warning: shallow clone detected — churn data will be incomplete.",
        );
        console.warn(
          "  Run `git fetch --unshallow` for accurate CHURN section.\n",
        );
      }
    } catch {
      // git rev-parse failed — proceed anyway
    }

    const raw = execSync(
      `git log --numstat --format="%h|%aI|%s" --since="30 days ago"`,
      {
        cwd: rootDir,
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024, // 10MB
        timeout: 15000, // 15s
      },
    );
    return parseGitLogOutput(raw);
  } catch {
    // Not a git repo or git unavailable — churn is optional
    return new Map();
  }
}
