import * as fs from "fs";
import * as path from "path";

export interface WorkspacePackage {
  dir: string;          // relative to monorepo root, forward slashes
  entryPoint?: string;  // e.g., "src/index.ts"
}

export interface WorkspaceContext {
  packages: Map<string, WorkspacePackage>;  // key = package name
  rootOffset: string;   // relative path from monorepo root to scan root
}

function toForwardSlash(p: string): string {
  return p.replace(/\\/g, "/");
}

export function detectWorkspaceAliases(scanRoot: string): WorkspaceContext {
  const empty: WorkspaceContext = { packages: new Map(), rootOffset: "" };
  const resolvedScanRoot = path.resolve(scanRoot);

  // Walk up to find monorepo root (max 5 levels, stop at fs root or .git)
  let current = resolvedScanRoot;
  let monorepoRoot: string | null = null;
  let workspaceGlobs: string[] | null = null;

  for (let level = 0; level < 6; level++) {
    const found = readWorkspaceGlobs(current);
    if (found) {
      monorepoRoot = current;
      workspaceGlobs = found;
      break;
    }
    // Stop conditions (after checking current level)
    if (current === path.dirname(current)) break; // filesystem root
    if (fs.existsSync(path.join(current, ".git"))) break; // .git boundary
    current = path.dirname(current);
  }

  if (!monorepoRoot || !workspaceGlobs) return empty;

  const dirs = expandWorkspaceGlobs(workspaceGlobs, monorepoRoot);
  const packages = new Map<string, WorkspacePackage>();

  for (const dir of dirs) {
    const pkgPath = path.join(monorepoRoot, dir, "package.json");
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      const name = pkg.name;
      if (!name) continue;
      if (packages.has(name)) {
        console.warn(`Duplicate workspace name '${name}' at ${packages.get(name)!.dir} and ${dir}, keeping first`);
        continue;
      }
      packages.set(name, {
        dir: toForwardSlash(dir),
        entryPoint: extractEntryPoint(pkg),
      });
    } catch (err) {
      console.warn(`Skipping workspace at ${dir}: ${err instanceof Error ? err.message : err}`);
      continue;
    }
  }

  const rootOffset =
    monorepoRoot === resolvedScanRoot
      ? ""
      : toForwardSlash(path.relative(monorepoRoot, resolvedScanRoot));

  if (packages.size > 0) {
    console.warn(`Found monorepo root at ${monorepoRoot} with ${packages.size} workspace packages`);
  }

  return { packages, rootOffset };
}

// --- Internal helpers ---

function readWorkspaceGlobs(dir: string): string[] | null {
  // npm/yarn: package.json with workspaces field
  const pkgPath = path.join(dir, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      if (Array.isArray(pkg.workspaces)) return pkg.workspaces;
      if (Array.isArray(pkg.workspaces?.packages)) return pkg.workspaces.packages;
    } catch {
      // malformed — try pnpm
    }
  }

  // pnpm: pnpm-workspace.yaml
  const pnpmPath = path.join(dir, "pnpm-workspace.yaml");
  if (fs.existsSync(pnpmPath)) return parsePnpmWorkspace(pnpmPath);

  return null;
}

function parsePnpmWorkspace(filePath: string): string[] | null {
  const lines = fs.readFileSync(filePath, "utf-8").split("\n");
  const globs: string[] = [];
  let inPackages = false;

  for (const line of lines) {
    if (/^packages\s*:/.test(line)) {
      inPackages = true;
      continue;
    }
    if (inPackages) {
      if (line.trim() !== "" && !/^\s/.test(line)) break; // new top-level key
      const stripped = line.replace(/#.*$/, ""); // strip inline comments
      const match = stripped.match(/^\s*-\s*['"]?([^'"\s]+)['"]?\s*$/);
      if (match?.[1]) globs.push(match[1]);
    }
  }

  return globs.length > 0 ? globs : null;
}

function expandWorkspaceGlobs(globs: string[], rootDir: string): string[] {
  const positive: string[] = [];
  const negations: string[] = [];

  for (const g of globs) {
    if (g.startsWith("!")) negations.push(g.slice(1));
    else positive.push(g);
  }

  let dirs: string[] = [];

  for (const glob of positive) {
    if (glob.includes("**")) {
      const baseDir = glob.replace(/\/?\*\*.*$/, "");
      const absBase = path.join(rootDir, baseDir);
      if (fs.existsSync(absBase)) dirs.push(...walkForPackages(absBase, rootDir));
    } else if (glob.includes("*")) {
      const parentDir = glob.replace(/\/?\*$/, "");
      const absParent = path.join(rootDir, parentDir);
      if (fs.existsSync(absParent)) {
        for (const e of fs.readdirSync(absParent, { withFileTypes: true })) {
          if (e.isDirectory()) {
            dirs.push(toForwardSlash(path.relative(rootDir, path.join(absParent, e.name))));
          }
        }
      }
    } else {
      const absPath = path.join(rootDir, glob);
      if (fs.existsSync(absPath) && fs.statSync(absPath).isDirectory()) {
        dirs.push(toForwardSlash(glob));
      }
    }
  }

  if (negations.length > 0) {
    dirs = dirs.filter((d) => !negations.some((neg) => matchGlob(d, neg)));
  }

  return dirs;
}

function walkForPackages(dir: string, rootDir: string): string[] {
  const results: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name === "node_modules" || e.name === ".git") continue;
    const full = path.join(dir, e.name);
    if (fs.existsSync(path.join(full, "package.json"))) {
      results.push(toForwardSlash(path.relative(rootDir, full)));
    }
    results.push(...walkForPackages(full, rootDir));
  }
  return results;
}

function matchGlob(value: string, pattern: string): boolean {
  const regex = new RegExp(
    "^" + pattern.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*") + "$",
  );
  return regex.test(value);
}

function extractEntryPoint(pkg: Record<string, unknown>): string | undefined {
  if (pkg.exports && typeof pkg.exports === "object") {
    const dot = (pkg.exports as Record<string, unknown>)["."];
    if (dot) {
      const resolved = unwrapConditionalExport(dot, 0);
      if (resolved) return resolved.replace(/^\.\//, "");
    }
  }
  if (typeof pkg.main === "string") return pkg.main.replace(/^\.\//, "");
  return undefined;
}

function unwrapConditionalExport(value: unknown, depth: number): string | null {
  if (depth > 3) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    for (const key of ["import", "default", "require"]) {
      if (key in obj) {
        const result = unwrapConditionalExport(obj[key], depth + 1);
        if (result) return result;
      }
    }
  }
  return null;
}

export function resolveWorkspaceImport(
  importPath: string,
  ctx: WorkspaceContext,
  hasNode: (id: string) => boolean,
): string | null {
  return null; // stub — implemented in Task 3
}
