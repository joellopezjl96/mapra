// src/query/cache.ts
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import type { StrandGraph } from "../scanner/index.js";
import type { GraphAnalysis } from "../analyzer/index.js";
import type { ChurnResult } from "../analyzer/churn.js";

export interface StrandCache {
  version: 1;
  generated: string;
  gitHead?: string;
  graph: StrandGraph;
  analysis: GraphAnalysis;
}

/** JSON-safe shape where churn is a plain object instead of Map. */
interface StrandCacheJSON {
  version: 1;
  generated: string;
  gitHead?: string;
  graph: StrandGraph;
  analysis: Omit<GraphAnalysis, "churn"> & {
    churn: Record<string, ChurnResult>;
  };
}

/**
 * Serialize StrandGraph + GraphAnalysis to .strand-cache.json.
 * Uses atomic write (tmp + rename) for safety.
 */
export function writeCache(
  targetPath: string,
  graph: StrandGraph,
  analysis: GraphAnalysis,
  gitHead?: string,
): void {
  const cache: StrandCacheJSON = {
    version: 1,
    generated: new Date().toISOString(),
    ...(gitHead !== undefined ? { gitHead } : {}),
    graph,
    analysis: {
      ...analysis,
      churn: Object.fromEntries(analysis.churn),
    },
  };

  const cachePath = path.join(targetPath, ".strand-cache.json");
  const tmpPath = cachePath + ".tmp";
  const json = JSON.stringify(cache, null, 2);

  fs.writeFileSync(tmpPath, json, "utf-8");
  try {
    fs.renameSync(tmpPath, cachePath);
  } catch {
    fs.writeFileSync(cachePath, json, "utf-8");
  } finally {
    try { fs.unlinkSync(tmpPath); } catch { /* already renamed or gone */ }
  }
}

/**
 * Load and validate .strand-cache.json from the given directory,
 * walking up to git root if not found in startDir.
 */
export function loadCache(startDir?: string): StrandCache {
  const dir = startDir ?? process.cwd();
  const cachePath = findCacheFile(dir);

  if (!cachePath) {
    throw new Error("No .strand-cache.json found. Run 'strnd generate' first.");
  }

  let raw: string;
  try {
    raw = fs.readFileSync(cachePath, "utf-8");
  } catch {
    throw new Error("No .strand-cache.json found. Run 'strnd generate' first.");
  }

  let data: StrandCacheJSON;
  try {
    data = JSON.parse(raw) as StrandCacheJSON;
  } catch {
    throw new Error(".strand-cache.json is corrupted. Run 'strnd generate' to rebuild.");
  }

  if (data.version !== 1) {
    throw new Error("Cache format is incompatible. Run 'strnd generate' to rebuild.");
  }

  return {
    ...data,
    analysis: {
      ...data.analysis,
      churn: new Map(Object.entries(data.analysis.churn)),
    },
  };
}

/**
 * Check if cache is stale relative to current git HEAD.
 * Returns a warning string, or null if current/not-git.
 */
export function checkStaleness(cache: StrandCache): string | null {
  if (!cache.gitHead) return null;

  try {
    const currentHead = execSync("git rev-parse HEAD", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();

    if (currentHead === cache.gitHead) return null;

    try {
      const count = execSync(
        `git rev-list --count ${cache.gitHead}..HEAD`,
        { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
      ).trim();
      return `\u26A0 cache generated before ${count} commits \u2014 run 'strnd generate' to refresh`;
    } catch {
      return "\u26A0 cache may be stale \u2014 run 'strnd generate' to refresh";
    }
  } catch {
    return null;
  }
}

/**
 * Append `.strand-cache.json` to .gitignore if not already present.
 */
export function ensureCacheInGitignore(targetPath: string): void {
  const gitignorePath = path.join(targetPath, ".gitignore");
  const entry = ".strand-cache.json";

  let content = "";
  try {
    content = fs.readFileSync(gitignorePath, "utf-8");
  } catch { /* file doesn't exist yet */ }

  if (content.split("\n").some(line => line.trim() === entry)) return;

  const separator = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
  fs.writeFileSync(gitignorePath, content + separator + entry + "\n", "utf-8");
}

/** Walk up from startDir to git root looking for .strand-cache.json. */
function findCacheFile(startDir: string): string | null {
  let dir = path.resolve(startDir);

  let gitRoot: string | null = null;
  try {
    gitRoot = path.resolve(
      execSync("git rev-parse --show-toplevel", {
        cwd: dir,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim(),
    );
  } catch { /* not a git repo */ }

  while (true) {
    const candidate = path.join(dir, ".strand-cache.json");
    if (fs.existsSync(candidate)) return candidate;
    if (gitRoot && path.resolve(dir) === gitRoot) return null;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
