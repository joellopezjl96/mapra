/**
 * Git Hash Utility — resolves the current HEAD short hash.
 *
 * Used to embed commit identity in .mapra headers for staleness detection.
 */

import { execSync } from "child_process";

/**
 * Get the short git hash of the current HEAD commit.
 * Returns null if not in a git repo or git is unavailable.
 */
export function getGitHash(rootDir: string): string | null {
  try {
    const hash = execSync("git rev-parse --short HEAD", {
      cwd: rootDir,
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return hash || null;
  } catch {
    return null;
  }
}
