# Phase 1: Temporal Revenue — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship `strand history` (git backfill), `strand trend` (metric trends), license key gating, and npm publication — the minimum viable paid product.

**Architecture:** New `src/history/` module with three components: a git checkpoint finder, a worktree-based history scanner, and a snapshot storage layer. Pro commands (`history`, `trend`) are gated behind a license key check. The scanner and analyzer are reused as-is — we just run them at different git checkpoints via a temporary worktree.

**Tech Stack:** Node.js, TypeScript (strict ESM, `nodenext` resolution), `child_process.execSync` for git operations, vitest for tests. No new dependencies.

**Deferred to Phase 2:** `strand drift`, GitHub App, dashboard, Slack integration.

---

### Task 1: Snapshot Data Model & Storage

Define the snapshot format and write/read functions for `.strand-history/`.

**Files:**
- Create: `src/history/snapshot.ts`
- Create: `src/history/__tests__/snapshot.test.ts`

**Step 1: Write the failing test for snapshot types and serialization**

```typescript
// src/history/__tests__/snapshot.test.ts
import { describe, it, expect } from "vitest";
import type { Snapshot, SnapshotIndex } from "../snapshot.js";
import { serializeSnapshot, deserializeSnapshot, serializeIndex, deserializeIndex } from "../snapshot.js";

describe("Snapshot serialization", () => {
  const snapshot: Snapshot = {
    commitHash: "abc123",
    commitDate: "2025-09-01T00:00:00Z",
    weekLabel: "2025-W35",
    fileCount: 10,
    lineCount: 500,
    moduleCount: 3,
    nodes: [
      {
        id: "src/auth.ts",
        lines: 100,
        complexity: 0.45,
        imports: ["src/db.ts"],
        domain: "auth",
      },
    ],
    edges: [{ from: "src/auth.ts", to: "src/db.ts" }],
    blastRadii: [
      {
        nodeId: "src/db.ts",
        directImporters: 1,
        affectedCount: 3,
        maxDepth: 2,
        amplificationRatio: 3,
      },
    ],
    conventions: [
      { anchorFile: "src/db.ts", consumerType: "file", coverage: 0.8 },
    ],
    deadCodeCount: 2,
  };

  it("round-trips a snapshot through JSON", () => {
    const json = serializeSnapshot(snapshot);
    const parsed = deserializeSnapshot(json);
    expect(parsed.commitHash).toBe("abc123");
    expect(parsed.nodes).toHaveLength(1);
    expect(parsed.nodes[0]?.id).toBe("src/auth.ts");
    expect(parsed.blastRadii[0]?.affectedCount).toBe(3);
  });

  it("round-trips a snapshot index", () => {
    const index: SnapshotIndex = {
      version: 1,
      projectName: "strand",
      generatedAt: "2026-03-02T00:00:00Z",
      depthWeeks: 26,
      snapshots: [
        { weekLabel: "2025-W35", commitHash: "abc123", commitDate: "2025-09-01T00:00:00Z", fileCount: 10, lineCount: 500 },
      ],
    };
    const json = serializeIndex(index);
    const parsed = deserializeIndex(json);
    expect(parsed.snapshots).toHaveLength(1);
    expect(parsed.snapshots[0]?.weekLabel).toBe("2025-W35");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/history/__tests__/snapshot.test.ts`
Expected: FAIL — module `../snapshot.js` not found

**Step 3: Write minimal implementation**

```typescript
// src/history/snapshot.ts

/**
 * Snapshot — a lightweight capture of architecture state at a point in time.
 *
 * Intentionally denormalized from StrandGraph/GraphAnalysis to keep
 * snapshots small and self-contained (no import of scanner/analyzer types).
 */

export interface SnapshotNode {
  id: string;
  lines: number;
  complexity: number;
  imports: string[];
  domain: string | undefined;
}

export interface SnapshotEdge {
  from: string;
  to: string;
}

export interface SnapshotBlastRadius {
  nodeId: string;
  directImporters: number;
  affectedCount: number;
  maxDepth: number;
  amplificationRatio: number;
}

export interface SnapshotConvention {
  anchorFile: string;
  consumerType: string;
  coverage: number;
}

export interface Snapshot {
  commitHash: string;
  commitDate: string;
  weekLabel: string; // ISO week: "2025-W35"
  fileCount: number;
  lineCount: number;
  moduleCount: number;
  nodes: SnapshotNode[];
  edges: SnapshotEdge[];
  blastRadii: SnapshotBlastRadius[];
  conventions: SnapshotConvention[];
  deadCodeCount: number;
}

export interface SnapshotIndexEntry {
  weekLabel: string;
  commitHash: string;
  commitDate: string;
  fileCount: number;
  lineCount: number;
}

export interface SnapshotIndex {
  version: number;
  projectName: string;
  generatedAt: string;
  depthWeeks: number;
  snapshots: SnapshotIndexEntry[];
}

export function serializeSnapshot(s: Snapshot): string {
  return JSON.stringify(s);
}

export function deserializeSnapshot(json: string): Snapshot {
  return JSON.parse(json) as Snapshot;
}

export function serializeIndex(idx: SnapshotIndex): string {
  return JSON.stringify(idx, null, 2);
}

export function deserializeIndex(json: string): SnapshotIndex {
  return JSON.parse(json) as SnapshotIndex;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/history/__tests__/snapshot.test.ts`
Expected: PASS (2 tests)

**Step 5: Commit**

```bash
git add src/history/snapshot.ts src/history/__tests__/snapshot.test.ts
git commit -m "feat(history): add snapshot data model and serialization"
```

---

### Task 2: Snapshot Storage (Filesystem)

Write snapshots to `.strand-history/` and read them back. Add `.strand-history/` to `.gitignore` default recommendations.

**Files:**
- Create: `src/history/storage.ts`
- Create: `src/history/__tests__/storage.test.ts`

**Step 1: Write the failing test**

```typescript
// src/history/__tests__/storage.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { writeSnapshot, readSnapshot, writeIndex, readIndex, listSnapshots } from "../storage.js";
import type { Snapshot, SnapshotIndex } from "../snapshot.js";

describe("Snapshot storage", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "strand-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const fakeSnapshot: Snapshot = {
    commitHash: "abc123",
    commitDate: "2025-09-01T00:00:00Z",
    weekLabel: "2025-W35",
    fileCount: 5,
    lineCount: 200,
    moduleCount: 2,
    nodes: [],
    edges: [],
    blastRadii: [],
    conventions: [],
    deadCodeCount: 0,
  };

  it("writes and reads a snapshot by week label", () => {
    writeSnapshot(tmpDir, fakeSnapshot);
    const loaded = readSnapshot(tmpDir, "2025-W35");
    expect(loaded).not.toBeUndefined();
    expect(loaded!.commitHash).toBe("abc123");
  });

  it("returns undefined for missing snapshot", () => {
    const loaded = readSnapshot(tmpDir, "2099-W01");
    expect(loaded).toBeUndefined();
  });

  it("writes and reads the index", () => {
    const index: SnapshotIndex = {
      version: 1,
      projectName: "test",
      generatedAt: "2026-03-02T00:00:00Z",
      depthWeeks: 26,
      snapshots: [{ weekLabel: "2025-W35", commitHash: "abc123", commitDate: "2025-09-01T00:00:00Z", fileCount: 5, lineCount: 200 }],
    };
    writeIndex(tmpDir, index);
    const loaded = readIndex(tmpDir);
    expect(loaded).not.toBeUndefined();
    expect(loaded!.snapshots).toHaveLength(1);
  });

  it("lists snapshot week labels in sorted order", () => {
    writeSnapshot(tmpDir, fakeSnapshot);
    writeSnapshot(tmpDir, { ...fakeSnapshot, weekLabel: "2025-W36", commitHash: "def456" });
    const weeks = listSnapshots(tmpDir);
    expect(weeks).toEqual(["2025-W35", "2025-W36"]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/history/__tests__/storage.test.ts`
Expected: FAIL — module `../storage.js` not found

**Step 3: Write minimal implementation**

```typescript
// src/history/storage.ts
import * as fs from "fs";
import * as path from "path";
import { serializeSnapshot, deserializeSnapshot, serializeIndex, deserializeIndex } from "./snapshot.js";
import type { Snapshot, SnapshotIndex } from "./snapshot.js";

const SNAPSHOTS_DIR = "snapshots";
const INDEX_FILE = "index.json";

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function writeSnapshot(historyDir: string, snapshot: Snapshot): void {
  const dir = path.join(historyDir, SNAPSHOTS_DIR);
  ensureDir(dir);
  const filePath = path.join(dir, `${snapshot.weekLabel}.json`);
  fs.writeFileSync(filePath, serializeSnapshot(snapshot), "utf-8");
}

export function readSnapshot(historyDir: string, weekLabel: string): Snapshot | undefined {
  const filePath = path.join(historyDir, SNAPSHOTS_DIR, `${weekLabel}.json`);
  if (!fs.existsSync(filePath)) return undefined;
  return deserializeSnapshot(fs.readFileSync(filePath, "utf-8"));
}

export function writeIndex(historyDir: string, index: SnapshotIndex): void {
  ensureDir(historyDir);
  fs.writeFileSync(path.join(historyDir, INDEX_FILE), serializeIndex(index), "utf-8");
}

export function readIndex(historyDir: string): SnapshotIndex | undefined {
  const filePath = path.join(historyDir, INDEX_FILE);
  if (!fs.existsSync(filePath)) return undefined;
  return deserializeIndex(fs.readFileSync(filePath, "utf-8"));
}

export function listSnapshots(historyDir: string): string[] {
  const dir = path.join(historyDir, SNAPSHOTS_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith(".json"))
    .map(f => f.replace(".json", ""))
    .sort();
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/history/__tests__/storage.test.ts`
Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add src/history/storage.ts src/history/__tests__/storage.test.ts
git commit -m "feat(history): add snapshot filesystem storage"
```

---

### Task 3: Git Checkpoint Finder

Find one commit per ISO week from git history, going back N weeks.

**Files:**
- Create: `src/history/git-checkpoints.ts`
- Create: `src/history/__tests__/git-checkpoints.test.ts`

**Step 1: Write the failing test for parsing git log output**

```typescript
// src/history/__tests__/git-checkpoints.test.ts
import { describe, it, expect } from "vitest";
import { parseCheckpoints, toISOWeek } from "../git-checkpoints.js";

describe("toISOWeek", () => {
  it("computes ISO week for a known date", () => {
    // 2025-09-01 is a Monday in W36
    expect(toISOWeek("2025-09-01T12:00:00Z")).toBe("2025-W36");
  });

  it("handles year boundary", () => {
    // 2025-12-29 is in W01 of 2026
    expect(toISOWeek("2025-12-29T12:00:00Z")).toBe("2026-W01");
  });
});

describe("parseCheckpoints", () => {
  it("picks the latest commit per ISO week", () => {
    // git log output: newest first
    const raw = [
      "ccc333|2025-09-07T18:00:00Z",  // W36 (later)
      "bbb222|2025-09-05T12:00:00Z",  // W36 (earlier)
      "aaa111|2025-09-01T10:00:00Z",  // W36 (earliest, but actually Sep 1 is Monday of W36)
      "zzz000|2025-08-28T10:00:00Z",  // W35
    ].join("\n");

    const checkpoints = parseCheckpoints(raw);
    expect(checkpoints).toHaveLength(2);
    // W36: should pick ccc333 (latest in the week)
    expect(checkpoints.find(c => c.weekLabel === "2025-W36")?.commitHash).toBe("ccc333");
    // W35: only one commit
    expect(checkpoints.find(c => c.weekLabel === "2025-W35")?.commitHash).toBe("zzz000");
  });

  it("returns empty array for empty input", () => {
    expect(parseCheckpoints("")).toEqual([]);
    expect(parseCheckpoints("  \n  ")).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/history/__tests__/git-checkpoints.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// src/history/git-checkpoints.ts
import { execSync } from "child_process";

export interface Checkpoint {
  commitHash: string;
  commitDate: string;
  weekLabel: string;
}

/**
 * Compute ISO 8601 week label (e.g. "2025-W36") for a date string.
 */
export function toISOWeek(dateStr: string): string {
  const date = new Date(dateStr);
  // ISO week: week containing the year's first Thursday
  const thursday = new Date(date);
  thursday.setUTCDate(thursday.getUTCDate() + 3 - ((thursday.getUTCDay() + 6) % 7));
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

/**
 * Parse `git log --format="%H|%aI"` output into one checkpoint per ISO week.
 * Input is newest-first. We keep the latest commit per week.
 */
export function parseCheckpoints(raw: string): Checkpoint[] {
  const lines = raw.split("\n").filter(l => l.trim().length > 0);
  const byWeek = new Map<string, Checkpoint>();

  for (const line of lines) {
    const [hash, date] = line.split("|");
    if (!hash || !date) continue;
    const weekLabel = toISOWeek(date);
    // First seen = latest (git log is newest-first)
    if (!byWeek.has(weekLabel)) {
      byWeek.set(weekLabel, { commitHash: hash, commitDate: date, weekLabel });
    }
  }

  return Array.from(byWeek.values()).sort((a, b) => a.weekLabel.localeCompare(b.weekLabel));
}

/**
 * Get checkpoint commits from git history, one per week, going back `weeks` weeks.
 */
export function findCheckpoints(rootDir: string, weeks: number): Checkpoint[] {
  try {
    const raw = execSync(
      `git log --format="%H|%aI" --since="${weeks} weeks ago"`,
      { cwd: rootDir, encoding: "utf-8", maxBuffer: 10 * 1024 * 1024, timeout: 30000 },
    );
    return parseCheckpoints(raw);
  } catch {
    return [];
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/history/__tests__/git-checkpoints.test.ts`
Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add src/history/git-checkpoints.ts src/history/__tests__/git-checkpoints.test.ts
git commit -m "feat(history): add git checkpoint finder with ISO week grouping"
```

---

### Task 4: History Scanner (Worktree-Based)

Scan the codebase at a given git commit using a temporary worktree. Converts StrandGraph + GraphAnalysis into a lightweight Snapshot.

**Files:**
- Create: `src/history/history-scanner.ts`
- Create: `src/history/__tests__/history-scanner.test.ts`

**Step 1: Write the failing test for graph-to-snapshot conversion**

The worktree + git operations are hard to unit test, so we test the pure conversion function. The integration (worktree checkout + scan) is tested manually.

```typescript
// src/history/__tests__/history-scanner.test.ts
import { describe, it, expect } from "vitest";
import { graphToSnapshot } from "../history-scanner.js";
import type { StrandGraph } from "../../scanner/index.js";
import type { GraphAnalysis } from "../../analyzer/index.js";

function makeGraph(): StrandGraph {
  return {
    projectName: "test",
    projectType: "library",
    framework: "none",
    totalFiles: 3,
    totalLines: 300,
    nodes: [
      { id: "src/a.ts", path: "src/a.ts", type: "file", name: "a.ts", lines: 100, imports: ["src/b.ts"], exports: ["fnA"], complexity: 0.3, domain: "core" },
      { id: "src/b.ts", path: "src/b.ts", type: "file", name: "b.ts", lines: 100, imports: [], exports: ["fnB"], complexity: 0.5, domain: "core" },
      { id: "src/c.ts", path: "src/c.ts", type: "file", name: "c.ts", lines: 100, imports: ["src/a.ts"], exports: ["fnC"], complexity: 0.2, domain: "util" },
    ],
    edges: [
      { from: "src/a.ts", to: "src/b.ts", type: "imports", weight: 0.5 },
      { from: "src/c.ts", to: "src/a.ts", type: "imports", weight: 0.5 },
    ],
    modules: [
      { id: "src", name: "src", path: "src", nodeCount: 3, totalLines: 300, entryPoints: [] },
    ],
  };
}

function makeAnalysis(): GraphAnalysis {
  return {
    risk: [
      { nodeId: "src/b.ts", directImporters: 1, affectedCount: 2, weightedImpact: 1.5, modulesAffected: 1, maxDepth: 2, amplificationRatio: 2 },
    ],
    deadCode: ["src/c.ts"],
    churn: new Map(),
    conventions: [
      { anchorFile: "src/b.ts", anchorExports: ["fnB"], consumerType: "file", adoption: 2, total: 3, coverage: 0.67 },
    ],
  };
}

describe("graphToSnapshot", () => {
  it("converts graph + analysis into a snapshot", () => {
    const snap = graphToSnapshot(makeGraph(), makeAnalysis(), "abc123", "2025-09-01T00:00:00Z", "2025-W36");
    expect(snap.commitHash).toBe("abc123");
    expect(snap.weekLabel).toBe("2025-W36");
    expect(snap.fileCount).toBe(3);
    expect(snap.lineCount).toBe(300);
    expect(snap.nodes).toHaveLength(3);
    expect(snap.edges).toHaveLength(2);
    expect(snap.blastRadii).toHaveLength(1);
    expect(snap.blastRadii[0]?.affectedCount).toBe(2);
    expect(snap.conventions).toHaveLength(1);
    expect(snap.deadCodeCount).toBe(1);
  });

  it("handles empty analysis gracefully", () => {
    const emptyAnalysis: GraphAnalysis = { risk: [], deadCode: [], churn: new Map(), conventions: [] };
    const snap = graphToSnapshot(makeGraph(), emptyAnalysis, "def456", "2025-09-08T00:00:00Z", "2025-W37");
    expect(snap.blastRadii).toHaveLength(0);
    expect(snap.conventions).toHaveLength(0);
    expect(snap.deadCodeCount).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/history/__tests__/history-scanner.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// src/history/history-scanner.ts
import { execSync } from "child_process";
import type { StrandGraph } from "../scanner/index.js";
import type { GraphAnalysis } from "../analyzer/index.js";
import type { Snapshot } from "./snapshot.js";

/**
 * Convert a full StrandGraph + GraphAnalysis into a lightweight Snapshot.
 */
export function graphToSnapshot(
  graph: StrandGraph,
  analysis: GraphAnalysis,
  commitHash: string,
  commitDate: string,
  weekLabel: string,
): Snapshot {
  return {
    commitHash,
    commitDate,
    weekLabel,
    fileCount: graph.totalFiles,
    lineCount: graph.totalLines,
    moduleCount: graph.modules.length,
    nodes: graph.nodes.map(n => ({
      id: n.id,
      lines: n.lines,
      complexity: n.complexity,
      imports: n.imports,
      domain: n.domain,
    })),
    edges: graph.edges.map(e => ({ from: e.from, to: e.to })),
    blastRadii: analysis.risk.map(r => ({
      nodeId: r.nodeId,
      directImporters: r.directImporters,
      affectedCount: r.affectedCount,
      maxDepth: r.maxDepth,
      amplificationRatio: r.amplificationRatio,
    })),
    conventions: analysis.conventions.map(c => ({
      anchorFile: c.anchorFile,
      consumerType: c.consumerType,
      coverage: c.coverage,
    })),
    deadCodeCount: analysis.deadCode.length,
  };
}

const WORKTREE_DIR = ".strand-worktree";

/**
 * Scan the codebase at a specific git commit using a temporary worktree.
 * Returns the StrandGraph and GraphAnalysis for that commit.
 *
 * Callers must import scanner/analyzer dynamically to keep this module
 * lightweight for testing.
 */
export async function scanAtCommit(
  rootDir: string,
  commitHash: string,
  scanCodebase: (dir: string) => StrandGraph,
  analyzeGraph: (graph: StrandGraph) => GraphAnalysis,
): Promise<{ graph: StrandGraph; analysis: GraphAnalysis }> {
  const worktreePath = `${rootDir}/${WORKTREE_DIR}`;

  try {
    // Clean up stale worktree if it exists
    try {
      execSync(`git worktree remove "${worktreePath}" --force`, {
        cwd: rootDir, encoding: "utf-8", timeout: 10000,
      });
    } catch {
      // Doesn't exist yet — fine
    }

    // Create worktree at the target commit
    execSync(`git worktree add "${worktreePath}" "${commitHash}" --detach`, {
      cwd: rootDir, encoding: "utf-8", timeout: 30000,
    });

    // Run scanner + analyzer on the worktree
    const graph = scanCodebase(worktreePath);
    const analysis = analyzeGraph(graph);

    return { graph, analysis };
  } finally {
    // Always clean up the worktree
    try {
      execSync(`git worktree remove "${worktreePath}" --force`, {
        cwd: rootDir, encoding: "utf-8", timeout: 10000,
      });
    } catch {
      // Best-effort cleanup
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/history/__tests__/history-scanner.test.ts`
Expected: PASS (2 tests)

**Step 5: Commit**

```bash
git add src/history/history-scanner.ts src/history/__tests__/history-scanner.test.ts
git commit -m "feat(history): add graph-to-snapshot converter and worktree scanner"
```

---

### Task 5: `strand history` CLI Command

Wire up the full backfill pipeline: find checkpoints → scan each at worktree → store snapshots → build index.

**Files:**
- Create: `src/history/index.ts` (orchestrator)
- Modify: `src/cli/index.ts` (add `history` command)

**Step 1: Write the orchestrator**

No unit test for this — it's pure orchestration of tested components. Integration-tested via the CLI.

```typescript
// src/history/index.ts
import * as path from "path";
import { findCheckpoints } from "./git-checkpoints.js";
import { scanAtCommit, graphToSnapshot } from "./history-scanner.js";
import { writeSnapshot, writeIndex, readIndex, listSnapshots } from "./storage.js";
import type { SnapshotIndex } from "./snapshot.js";

export interface HistoryOptions {
  weeks: number;
  onProgress?: (msg: string) => void;
}

const HISTORY_DIR = ".strand-history";

export async function buildHistory(
  rootDir: string,
  options: HistoryOptions,
): Promise<{ snapshotCount: number; skipped: number }> {
  const { weeks, onProgress } = options;
  const historyDir = path.join(rootDir, HISTORY_DIR);
  const log = onProgress ?? (() => {});

  // 1. Find checkpoint commits
  log(`Scanning git history for the past ${weeks} weeks...`);
  const checkpoints = findCheckpoints(rootDir, weeks);
  if (checkpoints.length === 0) {
    log("No commits found in the specified range.");
    return { snapshotCount: 0, skipped: 0 };
  }
  log(`Found ${checkpoints.length} weekly checkpoints.`);

  // 2. Check which snapshots already exist (resume support)
  const existing = new Set(listSnapshots(historyDir));
  const toScan = checkpoints.filter(c => !existing.has(c.weekLabel));
  const skipped = checkpoints.length - toScan.length;
  if (skipped > 0) {
    log(`Skipping ${skipped} already-scanned weeks.`);
  }

  // 3. Lazy-load scanner and analyzer (heavy imports)
  const { scanCodebase } = await import("../scanner/index.js");
  const { analyzeGraph } = await import("../analyzer/index.js");

  // Wrap analyzeGraph to skip churn (no meaningful churn at historical checkpoints)
  const analyzeWithoutChurn = (graph: Parameters<typeof analyzeGraph>[0]) => {
    return analyzeGraph(graph); // churn will be empty in worktree (no .git log context)
  };

  // 4. Scan each checkpoint
  let scanned = 0;
  for (const checkpoint of toScan) {
    log(`[${scanned + 1}/${toScan.length}] Scanning ${checkpoint.weekLabel} (${checkpoint.commitHash.slice(0, 7)})...`);
    try {
      const { graph, analysis } = await scanAtCommit(
        rootDir,
        checkpoint.commitHash,
        scanCodebase,
        analyzeWithoutChurn,
      );
      const snapshot = graphToSnapshot(
        graph, analysis,
        checkpoint.commitHash, checkpoint.commitDate, checkpoint.weekLabel,
      );
      writeSnapshot(historyDir, snapshot);
      scanned++;
    } catch (err) {
      log(`  Warning: failed to scan ${checkpoint.weekLabel}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 5. Rebuild index
  const allWeeks = listSnapshots(historyDir);
  const index: SnapshotIndex = {
    version: 1,
    projectName: path.basename(rootDir),
    generatedAt: new Date().toISOString(),
    depthWeeks: weeks,
    snapshots: allWeeks.map(weekLabel => {
      // Read just the metadata from each snapshot
      const { readSnapshot } = await import("./storage.js");
      const snap = readSnapshot(historyDir, weekLabel);
      return {
        weekLabel,
        commitHash: snap?.commitHash ?? "unknown",
        commitDate: snap?.commitDate ?? "unknown",
        fileCount: snap?.fileCount ?? 0,
        lineCount: snap?.lineCount ?? 0,
      };
    }),
  };

  // Wait — the above has an await inside a map which won't work.
  // Fix: build index entries in a loop.
  const indexEntries = [];
  for (const weekLabel of allWeeks) {
    const { readSnapshot: readSnap } = await import("./storage.js");
    const snap = readSnap(historyDir, weekLabel);
    indexEntries.push({
      weekLabel,
      commitHash: snap?.commitHash ?? "unknown",
      commitDate: snap?.commitDate ?? "unknown",
      fileCount: snap?.fileCount ?? 0,
      lineCount: snap?.lineCount ?? 0,
    });
  }

  const finalIndex: SnapshotIndex = {
    version: 1,
    projectName: path.basename(rootDir),
    generatedAt: new Date().toISOString(),
    depthWeeks: weeks,
    snapshots: indexEntries,
  };
  writeIndex(historyDir, finalIndex);

  log(`Done. ${scanned} new snapshots. ${allWeeks.length} total weeks of history.`);
  return { snapshotCount: scanned, skipped };
}
```

**NOTE to implementer:** The orchestrator above has a bug — the index-building section has dead code (the first attempt with `map` + `await` followed by a corrected loop). When implementing, **use only the loop version** and delete the broken `map` version. The corrected implementation should look like:

```typescript
  // 5. Rebuild index
  const allWeeks = listSnapshots(historyDir);
  const indexEntries = [];
  for (const weekLabel of allWeeks) {
    const snap = readSnapshot(historyDir, weekLabel);
    indexEntries.push({
      weekLabel,
      commitHash: snap?.commitHash ?? "unknown",
      commitDate: snap?.commitDate ?? "unknown",
      fileCount: snap?.fileCount ?? 0,
      lineCount: snap?.lineCount ?? 0,
    });
  }

  const finalIndex: SnapshotIndex = {
    version: 1,
    projectName: path.basename(rootDir),
    generatedAt: new Date().toISOString(),
    depthWeeks: weeks,
    snapshots: indexEntries,
  };
  writeIndex(historyDir, finalIndex);
```

**Step 2: Wire into CLI**

Add to the `switch` statement in `src/cli/index.ts`:

```typescript
case "history": {
  const targetPath = resolveTarget(args[1]);
  const weeks = 26; // default 6 months
  // Parse --weeks flag if provided
  const weeksIdx = args.indexOf("--weeks");
  const weeksArg = weeksIdx !== -1 ? parseInt(args[weeksIdx + 1] ?? "26", 10) : weeks;

  const { buildHistory } = await import("../history/index.js");
  await buildHistory(targetPath, {
    weeks: weeksArg,
    onProgress: (msg) => console.log(msg),
  });
  break;
}
```

**Step 3: Manual integration test**

Run: `npx tsx src/cli/index.ts history`
Expected: Scans git history, creates `.strand-history/` with snapshot JSON files. Watch for errors in worktree creation/cleanup.

**Step 4: Add `.strand-history` and `.strand-worktree` to `.gitignore`**

Append to `.gitignore`:
```
.strand-history/
.strand-worktree/
```

**Step 5: Commit**

```bash
git add src/history/index.ts src/cli/index.ts .gitignore
git commit -m "feat(history): add strand history command with git backfill"
```

---

### Task 6: `strand trend` CLI Command

Load snapshots and display metric trends for a given file or module.

**Files:**
- Create: `src/history/trend.ts`
- Create: `src/history/__tests__/trend.test.ts`
- Modify: `src/cli/index.ts`

**Step 1: Write the failing test**

```typescript
// src/history/__tests__/trend.test.ts
import { describe, it, expect } from "vitest";
import { computeTrend, formatTrend } from "../trend.js";
import type { Snapshot } from "../snapshot.js";

function makeSnap(weekLabel: string, overrides: { lines: number; complexity: number; blastAffected: number }): Snapshot {
  return {
    commitHash: "aaa",
    commitDate: "2025-09-01T00:00:00Z",
    weekLabel,
    fileCount: 5,
    lineCount: 500,
    moduleCount: 2,
    nodes: [
      { id: "src/auth.ts", lines: overrides.lines, complexity: overrides.complexity, imports: [], domain: "auth" },
    ],
    edges: [],
    blastRadii: [
      { nodeId: "src/auth.ts", directImporters: 1, affectedCount: overrides.blastAffected, maxDepth: 2, amplificationRatio: overrides.blastAffected },
    ],
    conventions: [],
    deadCodeCount: 0,
  };
}

describe("computeTrend", () => {
  const snapshots = [
    makeSnap("2025-W36", { lines: 100, complexity: 0.3, blastAffected: 3 }),
    makeSnap("2025-W37", { lines: 120, complexity: 0.35, blastAffected: 5 }),
    makeSnap("2025-W38", { lines: 150, complexity: 0.5, blastAffected: 8 }),
  ];

  it("computes trend for a known file", () => {
    const trend = computeTrend(snapshots, "src/auth.ts");
    expect(trend).not.toBeUndefined();
    expect(trend!.points).toHaveLength(3);
    expect(trend!.points[0]?.lines).toBe(100);
    expect(trend!.points[2]?.lines).toBe(150);
    expect(trend!.points[0]?.blastRadius).toBe(3);
    expect(trend!.points[2]?.blastRadius).toBe(8);
  });

  it("returns undefined for unknown file", () => {
    expect(computeTrend(snapshots, "src/nope.ts")).toBeUndefined();
  });
});

describe("formatTrend", () => {
  it("produces a readable table", () => {
    const trend = {
      nodeId: "src/auth.ts",
      points: [
        { weekLabel: "2025-W36", lines: 100, complexity: 0.3, blastRadius: 3, importCount: 2 },
        { weekLabel: "2025-W38", lines: 150, complexity: 0.5, blastRadius: 8, importCount: 4 },
      ],
    };
    const output = formatTrend(trend);
    expect(output).toContain("src/auth.ts");
    expect(output).toContain("Blast radius");
    expect(output).toContain("+167%");  // (8-3)/3 = 167%
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/history/__tests__/trend.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// src/history/trend.ts
import type { Snapshot } from "./snapshot.js";

export interface TrendPoint {
  weekLabel: string;
  lines: number;
  complexity: number;
  blastRadius: number;
  importCount: number;
}

export interface Trend {
  nodeId: string;
  points: TrendPoint[];
}

/**
 * Extract the trend for a single file across snapshots (sorted by week).
 */
export function computeTrend(snapshots: Snapshot[], nodeId: string): Trend | undefined {
  const points: TrendPoint[] = [];

  for (const snap of snapshots) {
    const node = snap.nodes.find(n => n.id === nodeId);
    if (!node) continue;

    const blast = snap.blastRadii.find(b => b.nodeId === nodeId);

    points.push({
      weekLabel: snap.weekLabel,
      lines: node.lines,
      complexity: node.complexity,
      blastRadius: blast?.affectedCount ?? 0,
      importCount: node.imports.length,
    });
  }

  if (points.length === 0) return undefined;
  return { nodeId, points };
}

function pctChange(old: number, now: number): string {
  if (old === 0) return now === 0 ? "—" : "+∞";
  const pct = Math.round(((now - old) / old) * 100);
  if (pct === 0) return "stable";
  return pct > 0 ? `+${pct}%` : `${pct}%`;
}

function sparkline(values: number[]): string {
  const chars = "·▁▂▃▄▅▆▇█";
  if (values.length === 0) return "";
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  return values.map(v => chars[Math.round(((v - min) / range) * (chars.length - 1))]!).join("");
}

/**
 * Format a trend as a readable terminal table.
 */
export function formatTrend(trend: Trend): string {
  const { nodeId, points } = trend;
  const first = points[0]!;
  const last = points[points.length - 1]!;

  const lines = [
    `${nodeId} — ${points.length} snapshots (${first.weekLabel} → ${last.weekLabel})`,
    "─".repeat(56),
    `${"Metric".padEnd(20)} ${"First".padStart(8)} ${"Latest".padStart(8)} ${"Change".padStart(10)}`,
    `${"Lines".padEnd(20)} ${String(first.lines).padStart(8)} ${String(last.lines).padStart(8)} ${pctChange(first.lines, last.lines).padStart(10)}`,
    `${"Complexity".padEnd(20)} ${first.complexity.toFixed(2).padStart(8)} ${last.complexity.toFixed(2).padStart(8)} ${pctChange(first.complexity, last.complexity).padStart(10)}`,
    `${"Blast radius".padEnd(20)} ${String(first.blastRadius).padStart(8)} ${String(last.blastRadius).padStart(8)} ${pctChange(first.blastRadius, last.blastRadius).padStart(10)}`,
    `${"Imports".padEnd(20)} ${String(first.importCount).padStart(8)} ${String(last.importCount).padStart(8)} ${pctChange(first.importCount, last.importCount).padStart(10)}`,
    "",
    `Blast radius:  ${sparkline(points.map(p => p.blastRadius))}`,
    `Complexity:    ${sparkline(points.map(p => p.complexity))}`,
    `Lines:         ${sparkline(points.map(p => p.lines))}`,
  ];

  return lines.join("\n");
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/history/__tests__/trend.test.ts`
Expected: PASS (3 tests)

**Step 5: Wire into CLI**

Add to the `switch` statement in `src/cli/index.ts`:

```typescript
case "trend": {
  const targetFile = args[1];
  if (!targetFile) {
    console.error("Usage: strand trend <file-path> [--weeks N]");
    process.exit(1);
  }
  const targetPath = resolveTarget(args[2] ?? ".");
  const historyDir = path.join(targetPath, ".strand-history");
  const { readIndex, readSnapshot } = await import("../history/storage.js");
  const { computeTrend, formatTrend } = await import("../history/trend.js");

  const index = readIndex(historyDir);
  if (!index || index.snapshots.length === 0) {
    console.error("No history found. Run `strand history` first.");
    process.exit(1);
  }

  // Load all snapshots
  const snapshots = index.snapshots
    .map(entry => readSnapshot(historyDir, entry.weekLabel))
    .filter((s): s is NonNullable<typeof s> => s !== undefined);

  const trend = computeTrend(snapshots, targetFile);
  if (!trend) {
    console.error(`File "${targetFile}" not found in any snapshot.`);
    process.exit(1);
  }

  console.log(formatTrend(trend));
  break;
}
```

**Step 6: Commit**

```bash
git add src/history/trend.ts src/history/__tests__/trend.test.ts src/cli/index.ts
git commit -m "feat(history): add strand trend command with sparkline output"
```

---

### Task 7: License Key Gating

Gate Pro commands (`history`, `trend`) behind a license key check. Use a simple local validation for now — swap in Lemon Squeezy/Polar API validation later.

**Files:**
- Create: `src/license/index.ts`
- Create: `src/license/__tests__/license.test.ts`
- Modify: `src/cli/index.ts`

**Step 1: Write the failing test**

```typescript
// src/license/__tests__/license.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { checkLicense, saveLicense, LICENSE_ENV_VAR } from "../index.js";

describe("License key", () => {
  let tmpDir: string;
  const originalEnv = process.env[LICENSE_ENV_VAR];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "strand-lic-"));
    delete process.env[LICENSE_ENV_VAR];
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (originalEnv !== undefined) {
      process.env[LICENSE_ENV_VAR] = originalEnv;
    } else {
      delete process.env[LICENSE_ENV_VAR];
    }
  });

  it("returns false when no key is set", () => {
    expect(checkLicense(tmpDir)).toBe(false);
  });

  it("returns true when env var is set with valid format", () => {
    process.env[LICENSE_ENV_VAR] = "sk_strand_abc123def456";
    expect(checkLicense(tmpDir)).toBe(true);
  });

  it("returns true when license file exists", () => {
    saveLicense(tmpDir, "sk_strand_abc123def456");
    expect(checkLicense(tmpDir)).toBe(true);
  });

  it("rejects invalid key format", () => {
    process.env[LICENSE_ENV_VAR] = "invalid";
    expect(checkLicense(tmpDir)).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/license/__tests__/license.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// src/license/index.ts
import * as fs from "fs";
import * as path from "path";

export const LICENSE_ENV_VAR = "STRAND_LICENSE_KEY";
const LICENSE_FILE = ".strand-license";
const KEY_PATTERN = /^sk_strand_[a-zA-Z0-9]{12,}$/;

/**
 * Check if a valid license key is available.
 * Checks (in order): environment variable, license file in home dir, license file in project dir.
 */
export function checkLicense(projectDir?: string): boolean {
  // 1. Environment variable
  const envKey = process.env[LICENSE_ENV_VAR];
  if (envKey && KEY_PATTERN.test(envKey)) return true;

  // 2. Project-level license file
  if (projectDir) {
    const projFile = path.join(projectDir, LICENSE_FILE);
    if (fs.existsSync(projFile)) {
      const key = fs.readFileSync(projFile, "utf-8").trim();
      if (KEY_PATTERN.test(key)) return true;
    }
  }

  // 3. Home directory license file
  const homeDir = process.env["HOME"] ?? process.env["USERPROFILE"] ?? "";
  if (homeDir) {
    const homeFile = path.join(homeDir, LICENSE_FILE);
    if (fs.existsSync(homeFile)) {
      const key = fs.readFileSync(homeFile, "utf-8").trim();
      if (KEY_PATTERN.test(key)) return true;
    }
  }

  return false;
}

/**
 * Save a license key to the project directory.
 */
export function saveLicense(projectDir: string, key: string): void {
  fs.writeFileSync(path.join(projectDir, LICENSE_FILE), key, "utf-8");
}

/**
 * Print a message about needing a license and exit.
 */
export function requireLicense(projectDir: string): void {
  if (!checkLicense(projectDir)) {
    console.error(`
Strand Pro required for this command.

Set your license key:
  export STRAND_LICENSE_KEY=sk_strand_yourkey

Or save it to a file:
  echo "sk_strand_yourkey" > .strand-license

Get a license at https://strand.dev/pricing
`);
    process.exit(1);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/license/__tests__/license.test.ts`
Expected: PASS (4 tests)

**Step 5: Wire license check into CLI**

Add `requireLicense(targetPath)` at the start of the `history` and `trend` cases in `src/cli/index.ts`:

```typescript
case "history": {
  const targetPath = resolveTarget(args[1]);
  const { requireLicense } = await import("../license/index.js");
  requireLicense(targetPath);
  // ... rest of history command
}

case "trend": {
  // ... parse args
  const { requireLicense } = await import("../license/index.js");
  requireLicense(targetPath);
  // ... rest of trend command
}
```

**Step 6: Commit**

```bash
git add src/license/index.ts src/license/__tests__/license.test.ts src/cli/index.ts
git commit -m "feat(license): add license key gating for Pro commands"
```

---

### Task 8: npm Package Preparation

Update `package.json` for publication. Add `files` field, update metadata.

**Files:**
- Modify: `package.json`

**Step 1: Update package.json fields**

```json
{
  "name": "strand-map",
  "version": "1.0.0",
  "description": "Architecture intelligence for AI coding agents — gives your AI a map of your codebase",
  "keywords": ["ai", "codebase", "architecture", "blast-radius", "claude", "cursor", "copilot", "mcp"],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/joellopez/strand"
  },
  "files": ["dist", "README.md", "LICENSE"],
  "bin": { "strand": "dist/cli/index.js" }
}
```

**Note:** `name` may need to be scoped (`@strand/cli`) or adjusted based on npm availability. Check `npm info strand-map` before publishing. The `files` field ensures only compiled output is published (no `src/`, no experiments, no test data).

**Step 2: Build and verify**

Run: `npm run build && npm pack --dry-run`
Expected: Lists only `dist/`, `README.md`, `LICENSE`, `package.json`

**Step 3: Add `.strand-license` to `.gitignore`**

Append to `.gitignore`:
```
.strand-license
```

**Step 4: Commit**

```bash
git add package.json .gitignore
git commit -m "chore: prepare package.json for npm publication"
```

---

## Execution Order Summary

```
Task 1: Snapshot data model          (foundation — no deps)
Task 2: Snapshot filesystem storage  (depends on Task 1)
Task 3: Git checkpoint finder        (no deps, parallel with 1-2)
Task 4: History scanner + converter  (depends on Task 1)
Task 5: strand history CLI command   (depends on Tasks 2, 3, 4)
Task 6: strand trend CLI command     (depends on Tasks 1, 2)
Task 7: License key gating           (no deps, parallel with 1-6)
Task 8: npm package preparation      (depends on all above)
```

**Parallelizable:** Tasks 1+3+7 can be built simultaneously. Tasks 2+4 can follow. Task 5+6 after those. Task 8 last.

**Estimated effort:** ~15-20 hours total, achievable across 2-3 weekends.
