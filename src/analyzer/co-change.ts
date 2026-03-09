/**
 * Co-change Analyzer — finds files that frequently change together in git history.
 *
 * Builds a co-occurrence matrix from `git log --name-only` across recent commits,
 * then surfaces pairs with high co-change frequency but low import-graph proximity
 * (the most surprising signal: files that change together but don't import each other).
 */

import { execSync } from "child_process";

export interface CoChangePair {
  fileA: string;
  fileB: string;
  coChangeCount: number;     // number of commits where both changed
  totalCommitsA: number;     // total commits touching fileA
  totalCommitsB: number;     // total commits touching fileB
  confidence: number;        // coChangeCount / min(totalA, totalB)
  importConnected: boolean;  // whether A imports B or B imports A
}

/**
 * Parse `git log --name-only --format="%h"` output into per-commit file lists.
 * Returns an array of sets, each set being the files changed in one commit.
 */
export function parseGitLogNameOnly(raw: string): Set<string>[] {
  const commits: Set<string>[] = [];
  if (!raw.trim()) return commits;

  let currentFiles: Set<string> | null = null;

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      // Blank line = end of commit block
      if (currentFiles && currentFiles.size > 0) {
        commits.push(currentFiles);
      }
      currentFiles = null;
      continue;
    }

    // Header line: short hash
    if (/^[a-f0-9]{7,40}$/.test(trimmed)) {
      if (currentFiles && currentFiles.size > 0) {
        commits.push(currentFiles);
      }
      currentFiles = new Set();
      continue;
    }

    // File path line
    if (currentFiles) {
      // Normalize Windows backslashes
      currentFiles.add(trimmed.replace(/\\/g, "/"));
    }
  }

  // Don't forget the last commit block
  if (currentFiles && currentFiles.size > 0) {
    commits.push(currentFiles);
  }

  return commits;
}

/**
 * Build co-occurrence counts from commit file sets.
 * Only considers commits with <= maxFilesPerCommit files to filter out
 * large merges/reformats that would create noise.
 *
 * Returns a map of "fileA\0fileB" -> count (canonical order: fileA < fileB).
 */
export function buildCoOccurrenceMatrix(
  commits: Set<string>[],
  maxFilesPerCommit = 20,
): { pairs: Map<string, number>; fileCounts: Map<string, number> } {
  const pairs = new Map<string, number>();
  const fileCounts = new Map<string, number>();

  for (const files of commits) {
    // Skip large commits (merges, reformats, CI-generated changes)
    if (files.size > maxFilesPerCommit || files.size < 2) continue;

    const sorted = [...files].sort();

    // Count per-file occurrences
    for (const f of sorted) {
      fileCounts.set(f, (fileCounts.get(f) ?? 0) + 1);
    }

    // Count pairwise co-occurrences
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const key = `${sorted[i]}\0${sorted[j]}`;
        pairs.set(key, (pairs.get(key) ?? 0) + 1);
      }
    }
  }

  return { pairs, fileCounts };
}

/**
 * Compute co-change pairs, prioritizing those with high co-change frequency
 * but low import-graph proximity (surprising co-changes).
 *
 * @param commits  Per-commit file sets from parseGitLogNameOnly
 * @param importEdges  Set of "from\0to" keys representing import relationships
 * @param topN  Maximum number of pairs to return
 * @param minCoChanges  Minimum co-change count to consider
 */
export function findCoChangePairs(
  commits: Set<string>[],
  importEdges: Set<string>,
  topN = 8,
  minCoChanges = 3,
): CoChangePair[] {
  const { pairs, fileCounts } = buildCoOccurrenceMatrix(commits);

  const results: CoChangePair[] = [];

  for (const [key, count] of pairs) {
    if (count < minCoChanges) continue;

    const [fileA, fileB] = key.split("\0") as [string, string];
    const totalA = fileCounts.get(fileA) ?? count;
    const totalB = fileCounts.get(fileB) ?? count;
    const confidence = count / Math.min(totalA, totalB);

    // Check if there's a direct import relationship
    const importConnected =
      importEdges.has(`${fileA}\0${fileB}`) ||
      importEdges.has(`${fileB}\0${fileA}`);

    results.push({
      fileA,
      fileB,
      coChangeCount: count,
      totalCommitsA: totalA,
      totalCommitsB: totalB,
      confidence,
      importConnected,
    });
  }

  // Sort: prioritize unconnected pairs (surprising), then by confidence * count
  results.sort((a, b) => {
    // Unconnected pairs first (most surprising signal)
    if (a.importConnected !== b.importConnected) {
      return a.importConnected ? 1 : -1;
    }
    // Then by confidence * coChangeCount (frequency-weighted)
    return b.confidence * b.coChangeCount - a.confidence * a.coChangeCount;
  });

  return results.slice(0, topN);
}

/**
 * Build a set of import edge keys from graph edges for import-proximity checking.
 */
export function buildImportEdgeSet(
  edges: Array<{ from: string; to: string; type: string }>,
): Set<string> {
  const set = new Set<string>();
  for (const edge of edges) {
    if (edge.type === "tests") continue;
    set.add(`${edge.from}\0${edge.to}`);
  }
  return set;
}

/**
 * Shell out to git and compute co-change pairs for a repository.
 * Returns empty array if not in a git repo or git is unavailable.
 */
export function computeCoChanges(
  rootDir: string,
  edges: Array<{ from: string; to: string; type: string }>,
): CoChangePair[] {
  try {
    const raw = execSync(
      `git log --name-only --format="%h" --since="30 days ago"`,
      {
        cwd: rootDir,
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024, // 10MB
        timeout: 15000, // 15s
      },
    );

    const commits = parseGitLogNameOnly(raw);
    const importEdges = buildImportEdgeSet(edges);
    return findCoChangePairs(commits, importEdges);
  } catch {
    // Not a git repo or git unavailable — co-change is optional
    return [];
  }
}
