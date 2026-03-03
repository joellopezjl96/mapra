# Strand v3 — Temporal + Symbol-Level Risk Intelligence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add export symbols and test coverage to RISK entries, git churn data, convention detection, and a `validate-plan` CLI command — so LLMs can assess plan safety from the encoding alone without `git log` or file reads.

**Architecture:** Phase 1 wires existing scanner data (`exports[]`, test edges) into the encoder. Phase 2 adds a new `churn.ts` analyzer that shells out to `git log --numstat --since="30 days ago"` and renders a CHURN section. Phase 3 adds a `conventions.ts` analyzer that detects repeated import patterns across files of the same type. Phase 4 adds a `validate-plan` CLI command that parses markdown files for path references and cross-references against .strand data. All phases are additive — no existing behavior changes.

**Tech Stack:** TypeScript (nodenext), vitest for unit tests, Node.js `child_process.execSync` for git, tsx for dev execution. New devDependency: vitest.

**Design doc:** `docs/plans/2026-03-01-strand-v3-temporal-intelligence-design.md`

---

## Task 1: Add vitest and verify build

The project has zero tests and no test runner. We need vitest before TDD.

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/analyzer/__tests__/blast-radius.test.ts`

**Step 1: Install vitest**

Run:
```bash
npm install -D vitest
```

**Step 2: Create vitest config**

Create `vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/__tests__/**/*.test.ts"],
  },
});
```

**Step 3: Update package.json test script**

Change:
```json
"test": "echo \"Error: no test specified\" && exit 1"
```
To:
```json
"test": "vitest run",
"test:watch": "vitest"
```

**Step 4: Write a smoke test for existing blast radius**

Create `src/analyzer/__tests__/blast-radius.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { computeBlastRadius } from "../blast-radius.js";

describe("computeBlastRadius", () => {
  it("returns zero impact for a node with no importers", () => {
    const reverseAdj = new Map<string, Set<string>>();
    const result = computeBlastRadius("orphan.ts", reverseAdj);

    expect(result.directImporters).toBe(0);
    expect(result.affectedCount).toBe(0);
    expect(result.maxDepth).toBe(0);
    expect(result.amplificationRatio).toBe(0);
  });

  it("computes transitive cascade through a chain", () => {
    // a.ts imports b.ts imports c.ts
    // reverse: c -> {b}, b -> {a}
    const reverseAdj = new Map<string, Set<string>>([
      ["c.ts", new Set(["b.ts"])],
      ["b.ts", new Set(["a.ts"])],
    ]);
    const result = computeBlastRadius("c.ts", reverseAdj);

    expect(result.directImporters).toBe(1);
    expect(result.affectedCount).toBe(2); // b.ts + a.ts
    expect(result.maxDepth).toBe(2);
    expect(result.amplificationRatio).toBe(2.0);
  });
});
```

**Step 5: Run tests**

Run: `npm test`
Expected: 2 tests pass.

**Step 6: Verify build still works**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/analyzer/__tests__/blast-radius.test.ts
git commit -m "chore: add vitest test runner with blast-radius smoke tests"
```

---

## Task 2: Add export symbols to RISK entries

Wire the existing `StrandNode.exports[]` data into the RISK section renderer.

**Files:**
- Create: `src/encoder/__tests__/risk-render.test.ts`
- Modify: `src/encoder/strand-format-encode.ts` (function `renderRisk`)

**Step 1: Write failing test**

Create `src/encoder/__tests__/risk-render.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { encodeToStrandFormat } from "../strand-format-encode.js";
import type { StrandGraph } from "../../scanner/index.js";
import type { GraphAnalysis } from "../../analyzer/index.js";

function makeGraph(overrides?: Partial<StrandGraph>): StrandGraph {
  return {
    projectName: "test",
    projectType: "test",
    framework: "typescript",
    totalFiles: 3,
    totalLines: 300,
    nodes: [
      {
        id: "src/lib/ordering.ts",
        path: "src/lib/ordering.ts",
        type: "utility",
        name: "ordering.ts",
        lines: 100,
        imports: [],
        exports: ["checkAvailability", "isWeekend", "CUTOFF_HOUR"],
        complexity: 0.5,
      },
      {
        id: "src/app/page.tsx",
        path: "src/app/page.tsx",
        type: "route",
        name: "page.tsx",
        lines: 50,
        imports: ["src/lib/ordering.ts"],
        exports: ["default"],
        complexity: 0.3,
      },
      {
        id: "src/__tests__/ordering.test.ts",
        path: "src/__tests__/ordering.test.ts",
        type: "test",
        name: "ordering.test.ts",
        lines: 80,
        imports: ["src/lib/ordering.ts"],
        exports: [],
        complexity: 0.1,
      },
    ],
    edges: [
      { from: "src/app/page.tsx", to: "src/lib/ordering.ts", type: "imports", weight: 1 },
      { from: "src/__tests__/ordering.test.ts", to: "src/lib/ordering.ts", type: "tests", weight: 1 },
    ],
    modules: [],
    ...overrides,
  };
}

function makeAnalysis(): GraphAnalysis {
  return {
    risk: [
      {
        nodeId: "src/lib/ordering.ts",
        directImporters: 1,
        affectedCount: 1,
        weightedImpact: 0.7,
        modulesAffected: 1,
        maxDepth: 1,
        amplificationRatio: 1.0,
      },
    ],
    deadCode: [],
  };
}

describe("RISK section rendering", () => {
  it("includes export symbols for RISK entries", () => {
    const graph = makeGraph();
    const analysis = makeAnalysis();
    const output = encodeToStrandFormat(graph, analysis);

    expect(output).toContain("exports: checkAvailability, isWeekend, CUTOFF_HOUR");
  });

  it("includes per-file test count on RISK entries", () => {
    const graph = makeGraph();
    const analysis = makeAnalysis();
    const output = encodeToStrandFormat(graph, analysis);

    // ordering.ts has 1 test edge pointing at it
    expect(output).toMatch(/T1\s+src\/lib\/ordering\.ts/);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/encoder/__tests__/risk-render.test.ts`
Expected: 2 failures — "exports:" not found in output, T1 not found in output.

**Step 3: Modify `renderRisk()` to include exports and test count**

In `src/encoder/strand-format-encode.ts`, modify `renderRisk()`. The function currently receives only `analysis: GraphAnalysis`. It needs `graph: StrandGraph` too for node exports and test edges.

First, update the call site in `encodeToStrandFormat()` — change:
```typescript
out += renderRisk(analysis);
```
to:
```typescript
out += renderRisk(graph, analysis);
```

Then replace `renderRisk`:
```typescript
function renderRisk(graph: StrandGraph, analysis: GraphAnalysis): string {
  const top = analysis.risk.slice(0, 8);
  if (top.length === 0) return "";

  // Build node lookup and test edge counts
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  const testCounts = new Map<string, number>();
  for (const edge of graph.edges) {
    if (edge.type === "tests") {
      testCounts.set(edge.to, (testCounts.get(edge.to) ?? 0) + 1);
    }
  }

  let out = `─── RISK (blast radius — modifying these cascades broadly) ─\n`;

  for (const r of top) {
    const isAmplified = r.amplificationRatio >= 2.0;
    const marker = isAmplified ? "[AMP]" : "     ";
    const amp = `amp${r.amplificationRatio.toFixed(1)}`.padEnd(7);
    const flow = `×${r.directImporters}→${r.affectedCount}`.padEnd(9);
    const depth = `d${r.maxDepth}`.padEnd(4);
    const mods = `${r.modulesAffected}mod`.padEnd(5);
    const tests = `T${testCounts.get(r.nodeId) ?? 0}`.padEnd(4);

    out += `${marker} ${amp} ${flow} ${depth} ${mods} ${tests} ${r.nodeId}\n`;

    // Export symbols (max 5, skip if empty)
    const node = nodeMap.get(r.nodeId);
    const exports = node?.exports?.filter((e) => e !== "default") ?? [];
    if (exports.length > 0) {
      const shown = exports.slice(0, 5);
      const suffix = exports.length > 5 ? `, +${exports.length - 5} more` : "";
      out += `  exports: ${shown.join(", ")}${suffix}\n`;
    }
  }

  const remaining = analysis.risk.length - top.length;
  if (remaining > 0) {
    out += `  +${remaining} more with blast radius > 1\n`;
  }

  out += `\n`;
  return out;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/encoder/__tests__/risk-render.test.ts`
Expected: 2 tests pass.

**Step 5: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 6: Commit**

```bash
git add src/encoder/strand-format-encode.ts src/encoder/__tests__/risk-render.test.ts
git commit -m "feat(encoder): add export symbols and test count to RISK entries

RISK rows now show T{n} for test file count and an 'exports:' line
listing up to 5 exported symbols. Both use data the scanner already
captures but wasn't surfacing."
```

---

## Task 3: Update LEGEND for new RISK notation

**Files:**
- Modify: `src/encoder/strand-format-encode.ts` (LEGEND line in `encodeToStrandFormat`)

**Step 1: Update LEGEND**

In `encodeToStrandFormat()`, the LEGEND line (line 24) currently reads:
```
LEGEND: ×N=imported by N files | █▓░·=complexity high→low | ═/·=coupling strong/weak | ×A→B=A direct, B total affected | dN=cascade depth | [AMP]=amplification≥2x | NL=lines of code
```

Replace with:
```
LEGEND: ×N=imported by N files | █▓░·=complexity high→low | ═/·=coupling strong/weak | ×A→B=A direct, B total affected | dN=cascade depth | [AMP]=amplification≥2x | TN=N test files | NL=lines of code
```

Only change: added `TN=N test files` before `NL`.

**Step 2: Verify build**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/encoder/strand-format-encode.ts
git commit -m "docs(encoder): add TN test count notation to LEGEND line"
```

---

## Task 4: Create git churn analyzer

New analyzer that shells out to `git log` and computes per-file churn metrics.

**Files:**
- Create: `src/analyzer/churn.ts`
- Create: `src/analyzer/__tests__/churn.test.ts`

**Step 1: Write failing test for git log output parsing**

Create `src/analyzer/__tests__/churn.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { parseGitLogOutput, type ChurnResult } from "../churn.js";

describe("parseGitLogOutput", () => {
  it("parses numstat output into per-file churn", () => {
    const raw = [
      "abc1234|2026-02-28T10:00:00-06:00|feat: add Sentry",
      "15\t20\tsrc/orders/route.ts",
      "5\t3\tsrc/lib/utils.ts",
      "",
      "def5678|2026-02-27T09:00:00-06:00|fix: remove personalEmail",
      "100\t200\tsrc/orders/route.ts",
      "",
    ].join("\n");

    const results = parseGitLogOutput(raw);

    const orders = results.get("src/orders/route.ts");
    expect(orders).toBeDefined();
    expect(orders!.commits30d).toBe(2);
    expect(orders!.linesAdded30d).toBe(115);   // 15 + 100
    expect(orders!.linesRemoved30d).toBe(220); // 20 + 200
    expect(orders!.lastCommitHash).toBe("abc1234");
    expect(orders!.lastCommitMsg).toBe("feat: add Sentry");

    const utils = results.get("src/lib/utils.ts");
    expect(utils).toBeDefined();
    expect(utils!.commits30d).toBe(1);
  });

  it("handles empty git log output", () => {
    const results = parseGitLogOutput("");
    expect(results.size).toBe(0);
  });

  it("handles binary files (- - in numstat)", () => {
    const raw = [
      "abc1234|2026-02-28T10:00:00-06:00|feat: add image",
      "-\t-\tpublic/logo.png",
      "5\t3\tsrc/app.ts",
      "",
    ].join("\n");

    const results = parseGitLogOutput(raw);
    expect(results.has("public/logo.png")).toBe(false);
    expect(results.has("src/app.ts")).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/analyzer/__tests__/churn.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement churn analyzer**

Create `src/analyzer/churn.ts`:
```typescript
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
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/analyzer/__tests__/churn.test.ts`
Expected: 3 tests pass.

**Step 5: Verify build**

Run: `npx tsc --noEmit`

**Step 6: Commit**

```bash
git add src/analyzer/churn.ts src/analyzer/__tests__/churn.test.ts
git commit -m "feat(analyzer): add git churn analyzer

Shells out to git log --numstat --since='30 days ago' and parses
per-file commit counts, lines added/removed, and last commit info.
Gracefully returns empty map if git is unavailable."
```

---

## Task 5: Wire churn into GraphAnalysis and encoder

Connect the churn analyzer to the analysis pipeline and add a CHURN section to the encoding output.

**Files:**
- Modify: `src/analyzer/index.ts`
- Modify: `src/encoder/strand-format-encode.ts`

**Step 1: Add churn to GraphAnalysis**

In `src/analyzer/index.ts`, add the import and wire it in:

Add import:
```typescript
import { type ChurnResult, computeChurn } from "./churn.js";
```

Update interface:
```typescript
export interface GraphAnalysis {
  risk: BlastResult[];
  deadCode: string[];
  churn: Map<string, ChurnResult>;  // NEW
}
```

Update `analyzeGraph` signature to accept `rootDir`:
```typescript
export function analyzeGraph(graph: StrandGraph, rootDir?: string): GraphAnalysis {
```

Add churn computation before the return:
```typescript
  const churn = rootDir ? computeChurn(rootDir) : new Map<string, ChurnResult>();

  return { risk, deadCode, churn };
```

**Step 2: Update CLI to pass rootDir**

In `src/cli/index.ts`, the `runGenerate()` function calls `analyzeGraph(graph)`. Change to:
```typescript
const analysis = analyzeGraph(graph, targetPath);
```

**Step 3: Add CHURN section to encoder**

In `src/encoder/strand-format-encode.ts`, add the render call in `encodeToStrandFormat()` after `renderRisk`:

```typescript
  // CHURN — temporal change data
  if (analysis) {
    out += renderChurn(graph, analysis);
  }
```

Add the render function:
```typescript
function renderChurn(graph: StrandGraph, analysis: GraphAnalysis): string {
  if (!analysis.churn || analysis.churn.size === 0) return "";

  // Get files with >= 3 commits (high churn)
  const highChurn = [...analysis.churn.values()]
    .filter((c) => c.commits30d >= 3)
    .sort((a, b) => b.commits30d - a.commits30d)
    .slice(0, 10);

  if (highChurn.length === 0) return "";

  let out = `─── CHURN (last 30 days, top movers) ─────────────────────\n`;

  for (const c of highChurn) {
    const commits = `${c.commits30d} commits`.padEnd(12);
    const delta = `+${c.linesAdded30d} -${c.linesRemoved30d}`.padEnd(12);
    const msg = c.lastCommitMsg.length > 50
      ? c.lastCommitMsg.slice(0, 47) + "..."
      : c.lastCommitMsg;
    out += `${commits} ${delta} ${c.nodeId}  "${msg}"\n`;
  }

  out += `\n`;
  return out;
}
```

**Step 4: Add churn type re-export**

In `src/analyzer/index.ts`, add:
```typescript
export type { ChurnResult } from "./churn.js";
```

**Step 5: Run all tests**

Run: `npm test`
Expected: All tests pass.

**Step 6: Verify build**

Run: `npx tsc --noEmit`

**Step 7: Integration verification**

Run on the strand repo itself:
```bash
npx tsx src/cli/index.ts generate .
cat .strand
```

Expected: CHURN section appears if there are files with >= 3 commits in the last 30 days. If the repo is new/quiet, the section is omitted (graceful fallback).

**Step 8: Commit**

```bash
git add src/analyzer/index.ts src/encoder/strand-format-encode.ts src/cli/index.ts
git commit -m "feat: wire git churn into analysis pipeline and encoder

GraphAnalysis now includes per-file churn data. The encoder renders
a CHURN section showing files with 3+ commits in the last 30 days,
including lines changed and last commit message. Section is omitted
if git is unavailable or no files meet the threshold."
```

---

## Task 6: Create convention detection analyzer

New analyzer that identifies import patterns repeated across >60% of files of the same type.

**Files:**
- Create: `src/analyzer/conventions.ts`
- Create: `src/analyzer/__tests__/conventions.test.ts`

**Step 1: Write failing test**

Create `src/analyzer/__tests__/conventions.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { detectConventions, type Convention } from "../conventions.js";
import type { StrandNode, StrandEdge } from "../../scanner/index.js";

describe("detectConventions", () => {
  it("detects a convention when 60%+ of a type import the same file", () => {
    // 3 of 4 API routes import sentry.ts (75%)
    const nodes: StrandNode[] = [
      { id: "src/sentry.ts", path: "src/sentry.ts", type: "utility", name: "sentry.ts", lines: 50, imports: [], exports: ["captureException"], complexity: 0.1 },
      { id: "src/api/a/route.ts", path: "src/api/a/route.ts", type: "api-route", name: "route.ts", lines: 30, imports: ["src/sentry.ts"], exports: ["GET"], complexity: 0.2 },
      { id: "src/api/b/route.ts", path: "src/api/b/route.ts", type: "api-route", name: "route.ts", lines: 30, imports: ["src/sentry.ts"], exports: ["POST"], complexity: 0.2 },
      { id: "src/api/c/route.ts", path: "src/api/c/route.ts", type: "api-route", name: "route.ts", lines: 30, imports: ["src/sentry.ts"], exports: ["GET"], complexity: 0.2 },
      { id: "src/api/d/route.ts", path: "src/api/d/route.ts", type: "api-route", name: "route.ts", lines: 30, imports: [], exports: ["DELETE"], complexity: 0.2 },
    ];

    const edges: StrandEdge[] = [
      { from: "src/api/a/route.ts", to: "src/sentry.ts", type: "imports", weight: 1 },
      { from: "src/api/b/route.ts", to: "src/sentry.ts", type: "imports", weight: 1 },
      { from: "src/api/c/route.ts", to: "src/sentry.ts", type: "imports", weight: 1 },
    ];

    const conventions = detectConventions(nodes, edges);

    expect(conventions.length).toBeGreaterThanOrEqual(1);
    const sentry = conventions.find((c) => c.anchorFile === "src/sentry.ts");
    expect(sentry).toBeDefined();
    expect(sentry!.consumerType).toBe("api-route");
    expect(sentry!.adoption).toBe(3);
    expect(sentry!.total).toBe(4);
    expect(sentry!.coverage).toBeCloseTo(0.75);
    expect(sentry!.anchorExports).toContain("captureException");
  });

  it("ignores patterns below 60% threshold", () => {
    // 2 of 5 routes import auth.ts (40%) — not a convention
    const nodes: StrandNode[] = [
      { id: "src/auth.ts", path: "src/auth.ts", type: "utility", name: "auth.ts", lines: 50, imports: [], exports: ["checkAuth"], complexity: 0.1 },
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `src/api/${i}/route.ts`,
        path: `src/api/${i}/route.ts`,
        type: "api-route" as const,
        name: "route.ts",
        lines: 30,
        imports: i < 2 ? ["src/auth.ts"] : [],
        exports: ["GET"],
        complexity: 0.2,
      })),
    ];

    const edges: StrandEdge[] = [
      { from: "src/api/0/route.ts", to: "src/auth.ts", type: "imports", weight: 1 },
      { from: "src/api/1/route.ts", to: "src/auth.ts", type: "imports", weight: 1 },
    ];

    const conventions = detectConventions(nodes, edges);
    const auth = conventions.find((c) => c.anchorFile === "src/auth.ts");
    expect(auth).toBeUndefined();
  });

  it("requires at least 3 files of a type to detect conventions", () => {
    // 2 of 2 routes import something (100%) but only 2 files — too few
    const nodes: StrandNode[] = [
      { id: "src/lib.ts", path: "src/lib.ts", type: "utility", name: "lib.ts", lines: 50, imports: [], exports: ["helper"], complexity: 0.1 },
      { id: "src/api/a/route.ts", path: "src/api/a/route.ts", type: "api-route", name: "route.ts", lines: 30, imports: ["src/lib.ts"], exports: ["GET"], complexity: 0.2 },
      { id: "src/api/b/route.ts", path: "src/api/b/route.ts", type: "api-route", name: "route.ts", lines: 30, imports: ["src/lib.ts"], exports: ["POST"], complexity: 0.2 },
    ];

    const edges: StrandEdge[] = [
      { from: "src/api/a/route.ts", to: "src/lib.ts", type: "imports", weight: 1 },
      { from: "src/api/b/route.ts", to: "src/lib.ts", type: "imports", weight: 1 },
    ];

    const conventions = detectConventions(nodes, edges);
    expect(conventions.length).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/analyzer/__tests__/conventions.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement convention detection**

Create `src/analyzer/conventions.ts`:
```typescript
/**
 * Convention Detector — identifies import patterns repeated across files of the same type.
 *
 * A "convention" is a dependency imported by >= 60% of files with a given type
 * (e.g., 8/12 API routes import Sentry). Minimum 3 files of that type required.
 */

import type { StrandNode, StrandEdge } from "../scanner/index.js";

const CONVENTION_THRESHOLD = 0.6;
const MIN_TYPE_COUNT = 3;

export interface Convention {
  anchorFile: string;
  anchorExports: string[];
  consumerType: string;
  adoption: number;
  total: number;
  coverage: number;
}

/**
 * Detect import conventions from graph data.
 * Returns conventions sorted by coverage descending.
 */
export function detectConventions(
  nodes: StrandNode[],
  edges: StrandEdge[],
): Convention[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Group non-test, non-config nodes by type
  const byType = new Map<string, StrandNode[]>();
  for (const node of nodes) {
    if (node.type === "test" || node.type === "config" || node.type === "schema") continue;
    const existing = byType.get(node.type) ?? [];
    existing.push(node);
    byType.set(node.type, existing);
  }

  // Build forward adjacency from non-test edges
  const imports = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (edge.type === "tests") continue;
    const set = imports.get(edge.from) ?? new Set();
    set.add(edge.to);
    imports.set(edge.from, set);
  }

  const conventions: Convention[] = [];

  for (const [type, typeNodes] of byType) {
    if (typeNodes.length < MIN_TYPE_COUNT) continue;

    // Count how many nodes of this type import each dependency
    const depCounts = new Map<string, number>();
    for (const node of typeNodes) {
      const deps = imports.get(node.id);
      if (!deps) continue;
      for (const dep of deps) {
        depCounts.set(dep, (depCounts.get(dep) ?? 0) + 1);
      }
    }

    // Check each dependency against threshold
    for (const [dep, count] of depCounts) {
      const coverage = count / typeNodes.length;
      if (coverage < CONVENTION_THRESHOLD) continue;

      // Skip self-type dependencies (api-route importing another api-route isn't a convention)
      const depNode = nodeMap.get(dep);
      if (depNode?.type === type) continue;

      conventions.push({
        anchorFile: dep,
        anchorExports: depNode?.exports?.filter((e) => e !== "default") ?? [],
        consumerType: type,
        adoption: count,
        total: typeNodes.length,
        coverage,
      });
    }
  }

  return conventions.sort((a, b) => b.coverage - a.coverage);
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/analyzer/__tests__/conventions.test.ts`
Expected: 3 tests pass.

**Step 5: Verify build**

Run: `npx tsc --noEmit`

**Step 6: Commit**

```bash
git add src/analyzer/conventions.ts src/analyzer/__tests__/conventions.test.ts
git commit -m "feat(analyzer): add convention detection

Identifies import patterns adopted by 60%+ of files of the same type
(e.g., 8/12 API routes import Sentry). Requires minimum 3 files of a
type to trigger. Returns anchor file, exports, and adoption rate."
```

---

## Task 7: Wire conventions into analysis pipeline and encoder

**Files:**
- Modify: `src/analyzer/index.ts`
- Modify: `src/encoder/strand-format-encode.ts`

**Step 1: Add conventions to GraphAnalysis**

In `src/analyzer/index.ts`, add import:
```typescript
import { type Convention, detectConventions } from "./conventions.js";
```

Update interface:
```typescript
export interface GraphAnalysis {
  risk: BlastResult[];
  deadCode: string[];
  churn: Map<string, ChurnResult>;
  conventions: Convention[];  // NEW
}
```

Add convention detection before the return:
```typescript
  const conventions = detectConventions(graph.nodes, graph.edges);

  return { risk, deadCode, churn, conventions };
```

Add re-export:
```typescript
export type { Convention } from "./conventions.js";
```

**Step 2: Add CONVENTIONS section to encoder**

In `encodeToStrandFormat()`, add after the CHURN render call:
```typescript
  // CONVENTIONS — detected import patterns
  if (analysis) {
    out += renderConventions(analysis);
  }
```

Add the render function:
```typescript
function renderConventions(analysis: GraphAnalysis): string {
  if (!analysis.conventions || analysis.conventions.length === 0) return "";

  // Cap at 8 conventions
  const top = analysis.conventions.slice(0, 8);

  let out = `─── CONVENTIONS ─────────────────────────────────────────\n`;

  for (const c of top) {
    const exports = c.anchorExports.slice(0, 3).join(", ");
    const label = exports || c.anchorFile.split("/").pop()?.replace(/\.(ts|tsx|js|jsx)$/, "") || "?";
    const coverage = `${c.adoption}/${c.total} ${c.consumerType}`;

    out += `${label.padEnd(32)} ${coverage.padEnd(16)} ${c.anchorFile}\n`;
  }

  out += `\n`;
  return out;
}
```

**Step 3: Run all tests**

Run: `npm test`
Expected: All tests pass.

**Step 4: Verify build**

Run: `npx tsc --noEmit`

**Step 5: Integration verification**

```bash
npx tsx src/cli/index.ts generate .
cat .strand
```

Expected: CONVENTIONS section appears if any patterns are detected. May be empty for the strand repo itself (small codebase).

**Step 6: Commit**

```bash
git add src/analyzer/index.ts src/encoder/strand-format-encode.ts
git commit -m "feat: wire convention detection into analysis pipeline and encoder

CONVENTIONS section shows import patterns adopted by 60%+ of files
of the same type. Helps LLMs flag when new code doesn't follow
established patterns (e.g., new API route missing Sentry)."
```

---

## Task 8: Add `validate-plan` CLI command

New command that parses a markdown plan for file path references and cross-references against .strand data.

**Files:**
- Create: `src/cli/plan-parser.ts`
- Create: `src/cli/__tests__/plan-parser.test.ts`
- Modify: `src/cli/index.ts`

**Step 1: Write failing test for plan parser**

Create `src/cli/__tests__/plan-parser.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { extractFilePaths } from "../plan-parser.js";

describe("extractFilePaths", () => {
  it("extracts paths from inline backticks", () => {
    const md = "Modify `src/lib/ordering.ts` and create `src/lib/cart/types.ts`.";
    const paths = extractFilePaths(md);
    expect(paths).toContain("src/lib/ordering.ts");
    expect(paths).toContain("src/lib/cart/types.ts");
  });

  it("extracts paths from code blocks", () => {
    const md = [
      "```typescript",
      "// File: src/app/api/orders/route.ts",
      "export async function POST() {}",
      "```",
    ].join("\n");
    const paths = extractFilePaths(md);
    expect(paths).toContain("src/app/api/orders/route.ts");
  });

  it("extracts paths from task file lists", () => {
    const md = [
      "**Files:**",
      "- Modify: `src/lib/auth.ts:45-60`",
      "- Create: `src/lib/new-file.ts`",
      "- Test: `src/__tests__/auth.test.ts`",
    ].join("\n");
    const paths = extractFilePaths(md);
    expect(paths).toContain("src/lib/auth.ts");
    expect(paths).toContain("src/lib/new-file.ts");
    expect(paths).toContain("src/__tests__/auth.test.ts");
  });

  it("deduplicates paths", () => {
    const md = "Edit `src/a.ts` then `src/a.ts` again.";
    const paths = extractFilePaths(md);
    expect(paths.filter((p) => p === "src/a.ts").length).toBe(1);
  });

  it("strips line number suffixes", () => {
    const md = "See `src/lib/ordering.ts:123-145` for context.";
    const paths = extractFilePaths(md);
    expect(paths).toContain("src/lib/ordering.ts");
    expect(paths).not.toContain("src/lib/ordering.ts:123-145");
  });

  it("ignores non-path backtick content", () => {
    const md = "Run `npm test` and check `PENDING` status.";
    const paths = extractFilePaths(md);
    expect(paths.length).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/cli/__tests__/plan-parser.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement plan parser**

Create `src/cli/plan-parser.ts`:
```typescript
/**
 * Plan Parser — extracts file path references from markdown documents.
 *
 * Looks for paths in backticks, code blocks, and task file lists.
 * Strips line number suffixes (:123-145). Deduplicates.
 */

// Match src/... or prisma/... or similar project paths
const PATH_PATTERN = /(?:src|prisma|docs|scripts|public|app|lib|components)\/[\w./-]+\.(?:ts|tsx|js|jsx|json|prisma|css|md)/g;

/**
 * Extract file paths from markdown content.
 * Returns deduplicated array of normalized paths.
 */
export function extractFilePaths(markdown: string): string[] {
  const paths = new Set<string>();

  // Match paths in backticks: `src/lib/ordering.ts:123-145`
  const backtickRegex = /`([^`]+)`/g;
  let match;
  while ((match = backtickRegex.exec(markdown)) !== null) {
    const content = match[1]!;
    // Strip line number suffixes
    const cleaned = content.replace(/:\d+(-\d+)?$/, "");
    // Strip "Modify: ", "Create: ", "Test: " prefixes
    const stripped = cleaned.replace(/^(?:Modify|Create|Test|File):\s*/i, "");
    if (PATH_PATTERN.test(stripped)) {
      paths.add(stripped);
    }
    // Reset regex lastIndex since we're reusing it
    PATH_PATTERN.lastIndex = 0;
  }

  // Also scan raw text for paths (e.g., in code block comments)
  const rawMatches = markdown.match(PATH_PATTERN) ?? [];
  for (const p of rawMatches) {
    paths.add(p.replace(/:\d+(-\d+)?$/, ""));
  }

  return [...paths].sort();
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/cli/__tests__/plan-parser.test.ts`
Expected: 6 tests pass.

**Step 5: Verify build**

Run: `npx tsc --noEmit`

**Step 6: Commit**

```bash
git add src/cli/plan-parser.ts src/cli/__tests__/plan-parser.test.ts
git commit -m "feat(cli): add markdown plan parser for file path extraction

Extracts file paths from backticks, code blocks, and task file lists.
Strips line number suffixes and deduplicates. Used by validate-plan."
```

---

## Task 9: Implement validate-plan command

Wire the plan parser into the CLI with cross-referencing against .strand data.

**Files:**
- Modify: `src/cli/index.ts`

**Step 1: Add the validate-plan case to the CLI switch**

In `src/cli/index.ts`, add to the switch statement:
```typescript
  case "validate-plan":
    await runValidatePlan(args[0], args[1]);
    break;
```

Add to `printHelp()`:
```
  validate-plan <plan.md> [--since YYYY-MM-DD]
                        Cross-reference plan file paths against .strand data
```

**Step 2: Implement runValidatePlan**

Add to `src/cli/index.ts`:
```typescript
async function runValidatePlan(planArg?: string, sinceArg?: string) {
  if (!planArg) {
    console.error("Usage: strand validate-plan <plan.md> [--since YYYY-MM-DD]");
    process.exit(1);
  }

  const planPath = path.resolve(planArg);
  if (!fs.existsSync(planPath)) {
    console.error(`Error: plan file not found: ${planPath}`);
    process.exit(1);
  }

  // Find project root (walk up to find .strand)
  let projectRoot = path.dirname(planPath);
  while (projectRoot !== path.dirname(projectRoot)) {
    if (fs.existsSync(path.join(projectRoot, ".strand"))) break;
    projectRoot = path.dirname(projectRoot);
  }

  if (!fs.existsSync(path.join(projectRoot, ".strand"))) {
    console.error("Error: no .strand file found. Run 'strand generate' first.");
    process.exit(1);
  }

  const { extractFilePaths } = await import("./plan-parser.js");
  const { scanCodebase } = await import("../scanner/index.js");
  const { analyzeGraph } = await import("../analyzer/index.js");

  const planContent = fs.readFileSync(planPath, "utf-8");
  const planPaths = extractFilePaths(planContent);

  console.log(`Plan references ${planPaths.length} files. Validating against current codebase...\n`);

  if (planPaths.length === 0) {
    console.log("No file paths found in plan. Nothing to validate.");
    return;
  }

  // Scan and analyze
  const graph = scanCodebase(projectRoot);
  const analysis = analyzeGraph(graph, projectRoot);

  // Build lookup maps
  const riskMap = new Map(analysis.risk.map((r) => [r.nodeId, r]));
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  const testCounts = new Map<string, number>();
  for (const edge of graph.edges) {
    if (edge.type === "tests") {
      testCounts.set(edge.to, (testCounts.get(edge.to) ?? 0) + 1);
    }
  }

  // Parse --since date
  let sinceDate: Date | undefined;
  if (sinceArg?.startsWith("--since")) {
    // Handle both "--since 2026-02-25" and "--since=2026-02-25"
    const dateStr = sinceArg.includes("=") ? sinceArg.split("=")[1] : undefined;
    if (dateStr) sinceDate = new Date(dateStr);
  } else if (sinceArg && /^\d{4}-\d{2}-\d{2}$/.test(sinceArg)) {
    sinceDate = new Date(sinceArg);
  }

  // Categorize plan files
  const stale: Array<{ path: string; churn?: import("../analyzer/churn.js").ChurnResult; risk?: import("../analyzer/blast-radius.js").BlastResult }> = [];
  const highCascade: Array<{ path: string; risk: import("../analyzer/blast-radius.js").BlastResult; node?: import("../scanner/index.js").StrandNode; tests: number }> = [];
  const notFound: string[] = [];

  for (const filePath of planPaths) {
    const node = nodeMap.get(filePath);
    const risk = riskMap.get(filePath);
    const churn = analysis.churn.get(filePath);

    if (!node) {
      notFound.push(filePath);
      continue;
    }

    // Stale: has churn data (modified recently)
    if (churn && churn.commits30d > 0) {
      if (!sinceDate || new Date(churn.lastCommitDate) >= sinceDate) {
        stale.push({ path: filePath, churn, risk });
      }
    }

    // High cascade: amplification >= 2.0
    if (risk && risk.amplificationRatio >= 2.0) {
      highCascade.push({
        path: filePath,
        risk,
        node,
        tests: testCounts.get(filePath) ?? 0,
      });
    }
  }

  // Report: STALE
  if (stale.length > 0) {
    console.log(`STALE (modified${sinceDate ? ` since ${sinceDate.toISOString().slice(0, 10)}` : " in last 30 days"}):`);
    for (const s of stale) {
      console.log(`  ${s.path}`);
      if (s.churn) {
        console.log(`    ${s.churn.commits30d} commits, +${s.churn.linesAdded30d} -${s.churn.linesRemoved30d} lines`);
        console.log(`    Last: "${s.churn.lastCommitMsg}" (${s.churn.lastCommitDate.slice(0, 10)})`);
      }
      if (s.risk) {
        const amp = s.risk.amplificationRatio >= 2.0 ? "[AMP] " : "";
        console.log(`    RISK: ${amp}amp${s.risk.amplificationRatio.toFixed(1)} ×${s.risk.directImporters}→${s.risk.affectedCount} d${s.risk.maxDepth}`);
      }
    }
    console.log();
  }

  // Report: HIGH CASCADE
  if (highCascade.length > 0) {
    console.log("HIGH CASCADE (amplification >= 2.0):");
    for (const h of highCascade) {
      console.log(`  ${h.path}`);
      console.log(`    RISK: [AMP] amp${h.risk.amplificationRatio.toFixed(1)} ×${h.risk.directImporters}→${h.risk.affectedCount} d${h.risk.maxDepth}`);
      if (h.node?.exports && h.node.exports.length > 0) {
        const shown = h.node.exports.filter((e) => e !== "default").slice(0, 5);
        if (shown.length > 0) console.log(`    exports: ${shown.join(", ")}`);
      }
      console.log(`    Tests: ${h.tests} file${h.tests !== 1 ? "s" : ""}`);
    }
    console.log();
  }

  // Report: MISSING CONVENTIONS
  if (analysis.conventions.length > 0) {
    const missing: string[] = [];
    for (const conv of analysis.conventions) {
      // Check if plan adds new files of this consumer type
      const newFilesOfType = notFound.filter((p) => {
        // Rough type detection from path
        if (conv.consumerType === "api-route" && /\/api\/.*route\.(ts|js)$/.test(p)) return true;
        if (conv.consumerType === "route" && /\/page\.(tsx|jsx)$/.test(p)) return true;
        return false;
      });

      if (newFilesOfType.length > 0) {
        const label = conv.anchorExports.slice(0, 2).join(", ") || conv.anchorFile.split("/").pop()?.replace(/\.\w+$/, "") || "?";
        missing.push(`Plan adds ${conv.consumerType} but may not import ${label} from ${conv.anchorFile} (${conv.adoption}/${conv.total} ${conv.consumerType}s use it)`);
      }
    }

    if (missing.length > 0) {
      console.log("MISSING CONVENTIONS:");
      for (const m of missing) {
        console.log(`  ${m}`);
      }
      console.log();
    }
  }

  // Report: NOT FOUND (new files the plan will create)
  if (notFound.length > 0) {
    console.log(`NEW FILES (${notFound.length} paths not in current codebase):`);
    for (const p of notFound) {
      console.log(`  ${p}`);
    }
    console.log();
  }

  // Summary
  console.log(`SUMMARY: ${stale.length} stale, ${highCascade.length} high-cascade, ${notFound.length} new files`);
}
```

**Step 3: Fix --since argument parsing**

The CLI currently passes `args[1]` as sinceArg, but `--since YYYY-MM-DD` would be `args[1]` = "--since" and `args[2]` = "YYYY-MM-DD". Update the call:

```typescript
  case "validate-plan": {
    // Handle: strand validate-plan plan.md --since 2026-02-25
    const sinceIdx = args.indexOf("--since");
    const since = sinceIdx >= 0 ? args[sinceIdx + 1] : undefined;
    const planFile = args.find((a) => !a.startsWith("--") && a !== since);
    await runValidatePlan(planFile, since);
    break;
  }
```

And update `runValidatePlan` signature:
```typescript
async function runValidatePlan(planArg?: string, sinceDate?: string) {
```

Update the sinceDate parsing inside the function to simply:
```typescript
  const since = sinceDate ? new Date(sinceDate) : undefined;
```

Then use `since` instead of `sinceDate` throughout.

**Step 4: Run all tests**

Run: `npm test`
Expected: All tests pass.

**Step 5: Verify build**

Run: `npx tsc --noEmit`

**Step 6: Integration test**

Run validate-plan against its own design doc:
```bash
npx tsx src/cli/index.ts validate-plan docs/plans/2026-03-01-strand-v3-temporal-intelligence-design.md
```

Expected: Lists file paths found in the design doc, shows RISK data for referenced files, reports summary.

**Step 7: Commit**

```bash
git add src/cli/index.ts
git commit -m "feat(cli): add validate-plan command

Cross-references markdown plan file paths against .strand data.
Reports: stale files (modified since --since date), high-cascade
targets (AMP >= 2.0 with exports and test count), missing
conventions, and new files the plan will create."
```

---

## Task 10: Final verification and integration test

**Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass (blast-radius: 2, risk-render: 2, churn: 3, conventions: 3, plan-parser: 6 = 16 tests).

**Step 2: Build check**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 3: Generate .strand for the strand repo itself**

```bash
npx tsx src/cli/index.ts generate .
cat .strand
```

Expected: Output includes RISK with exports and T{n} annotations, CHURN section (if any files have 3+ commits in 30 days), and CONVENTIONS section (if any patterns detected). LEGEND includes `TN=N test files`.

**Step 4: Test on an external codebase (if available)**

```bash
npx tsx src/cli/index.ts generate C:/dev/senorburritocompany
npx tsx src/cli/index.ts validate-plan C:/dev/senorburritocompany/docs/plans/2026-02-25-tlc-pre-ordering-plan.md --since 2026-02-25
```

Expected: validate-plan produces a stale/cascade/conventions report similar to what the agent manually produced in transcript 2.

**Step 5: Commit (if any fixups needed)**

```bash
git add -A
git commit -m "fix: integration test fixups for v3 encoding"
```
