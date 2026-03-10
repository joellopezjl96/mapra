# Generated/Data File Filters Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Filter noise files from CHURN, CO-CHANGE, DEAD CODE and fix complexity normalization outliers

**Architecture:** Inline helpers in analyzer + graph-membership filters in encoder + P95 normalization in scanner

**Tech Stack:** TypeScript, Vitest

---

## Task 1: `isNoiseFile()` helper + tests

**Files:**
- Modify: `src/analyzer/index.ts` (add helper, line ~8 area for placement)
- Create: `src/analyzer/__tests__/noise-filter.test.ts`

**Context:** This helper identifies files that should be excluded from DEAD CODE and potentially other sections. It matches `.generated.ts` suffixes and `.d.ts` declaration files. It's a pure function with no dependencies.

### Steps

- [ ] **Step 1.1:** Create test file `src/analyzer/__tests__/noise-filter.test.ts` with failing tests:

```typescript
import { describe, it, expect } from "vitest";
import { isNoiseFile } from "../index.js";

describe("isNoiseFile", () => {
  it("matches .generated.ts files", () => {
    expect(isNoiseFile("packages/app-store/apps.metadata.generated.ts")).toBe(true);
  });

  it("matches .generated.tsx files", () => {
    expect(isNoiseFile("src/components/Icons.generated.tsx")).toBe(true);
  });

  it("matches .d.ts declaration files", () => {
    expect(isNoiseFile("src/types/global.d.ts")).toBe(true);
  });

  it("matches .d.ts in nested paths", () => {
    expect(isNoiseFile("experiments/experiment-4-strand-v2.d.ts")).toBe(true);
  });

  it("does NOT match regular .ts files", () => {
    expect(isNoiseFile("src/scanner/index.ts")).toBe(false);
  });

  it("does NOT match .tsx files", () => {
    expect(isNoiseFile("src/components/Button.tsx")).toBe(false);
  });

  it("does NOT match files with 'generated' in directory name", () => {
    expect(isNoiseFile("src/generated/utils.ts")).toBe(false);
  });

  it("does NOT match files with 'declarations' in name", () => {
    expect(isNoiseFile("src/lib/declarations.ts")).toBe(false);
  });
});
```

- [ ] **Step 1.2:** Run the test to verify it fails (function doesn't exist yet):

```bash
cd /c/dev/strand/.claude/worktrees/agent-a9f44df3 && npx vitest run src/analyzer/__tests__/noise-filter.test.ts
```

Expected: FAIL — `isNoiseFile` is not exported from `../index.js`

- [ ] **Step 1.3:** Add the `isNoiseFile()` function to `src/analyzer/index.ts`. Insert after the existing imports (after line 6), before the `GraphAnalysis` interface:

```typescript
/**
 * Returns true for files that are noise in analytical sections:
 * - `.generated.ts/.tsx` — auto-generated code
 * - `.d.ts` — TypeScript declaration files (ambient types, not business logic)
 */
export function isNoiseFile(filePath: string): boolean {
  return /\.generated\.tsx?$|\.d\.ts$/.test(filePath);
}
```

- [ ] **Step 1.4:** Run the test to verify it passes:

```bash
cd /c/dev/strand/.claude/worktrees/agent-a9f44df3 && npx vitest run src/analyzer/__tests__/noise-filter.test.ts
```

Expected: All 8 tests PASS

- [ ] **Step 1.5:** Run full test suite to check for regressions:

```bash
cd /c/dev/strand/.claude/worktrees/agent-a9f44df3 && npx vitest run
```

Expected: All existing tests still pass

- [ ] **Step 1.6:** Commit:

```bash
cd /c/dev/strand/.claude/worktrees/agent-a9f44df3 && git add src/analyzer/index.ts src/analyzer/__tests__/noise-filter.test.ts && git commit -m "feat(analyzer): add isNoiseFile() helper for .generated.ts and .d.ts filtering"
```

---

## Task 2: Dead code filter using `isNoiseFile()` + test

**Files:**
- Modify: `src/analyzer/index.ts` (line 51-57, the dead code filter in `analyzeGraph()`)
- Modify: `src/analyzer/__tests__/noise-filter.test.ts` (add integration test)

**Context:** The dead code list in `analyzeGraph()` currently filters by `SKIP_TYPES` and `reverseAdj` membership. Generated and `.d.ts` files pollute this list. We add `!isNoiseFile(n.id)` to the filter chain.

### Steps

- [ ] **Step 2.1:** Add a dead-code-specific test to `src/analyzer/__tests__/noise-filter.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { isNoiseFile } from "../index.js";
import { analyzeGraph } from "../index.js";
import type { StrandGraph } from "../../scanner/index.js";

// ... keep existing isNoiseFile tests above ...

describe("dead code filtering of noise files", () => {
  it("excludes .generated.ts and .d.ts from dead code list", () => {
    const graph: StrandGraph = {
      projectName: "test",
      projectType: "app",
      framework: "typescript",
      totalFiles: 4,
      totalLines: 400,
      modules: [],
      nodes: [
        {
          id: "src/lib/utils.ts",
          path: "src/lib/utils.ts",
          type: "utility",
          name: "utils.ts",
          lines: 100,
          imports: [],
          exports: ["helper"],
          complexity: 0.5,
        },
        {
          id: "src/types/global.d.ts",
          path: "src/types/global.d.ts",
          type: "utility",
          name: "global.d.ts",
          lines: 50,
          imports: [],
          exports: [],
          complexity: 0.1,
        },
        {
          id: "src/components/Icons.generated.tsx",
          path: "src/components/Icons.generated.tsx",
          type: "component",
          name: "Icons.generated.tsx",
          lines: 200,
          imports: [],
          exports: ["IconSet"],
          complexity: 0.3,
        },
        {
          id: "src/app/page.tsx",
          path: "src/app/page.tsx",
          type: "route",
          name: "page.tsx",
          lines: 50,
          imports: ["src/lib/utils.ts"],
          exports: ["default"],
          complexity: 0.2,
        },
      ],
      edges: [
        { from: "src/app/page.tsx", to: "src/lib/utils.ts", type: "imports", weight: 1 },
      ],
    };

    // analyzeGraph without rootDir (no git data)
    const analysis = analyzeGraph(graph);

    // utils.ts is imported by page.tsx — NOT dead code
    expect(analysis.deadCode).not.toContain("src/lib/utils.ts");

    // page.tsx is a route — excluded by SKIP_TYPES
    expect(analysis.deadCode).not.toContain("src/app/page.tsx");

    // .d.ts should be filtered by isNoiseFile
    expect(analysis.deadCode).not.toContain("src/types/global.d.ts");

    // .generated.tsx should be filtered by isNoiseFile
    expect(analysis.deadCode).not.toContain("src/components/Icons.generated.tsx");
  });
});
```

- [ ] **Step 2.2:** Run the test to verify it fails:

```bash
cd /c/dev/strand/.claude/worktrees/agent-a9f44df3 && npx vitest run src/analyzer/__tests__/noise-filter.test.ts
```

Expected: FAIL — `.d.ts` and `.generated.tsx` files still appear in `deadCode`

- [ ] **Step 2.3:** Modify the dead code filter in `src/analyzer/index.ts`. Change lines 51-57 from:

```typescript
  const deadCode = graph.nodes
    .filter(
      (n) =>
        !SKIP_TYPES.has(n.type) &&
        !reverseAdj.has(n.id),
    )
    .map((n) => n.id);
```

to:

```typescript
  const deadCode = graph.nodes
    .filter(
      (n) =>
        !SKIP_TYPES.has(n.type) &&
        !isNoiseFile(n.id) &&
        !reverseAdj.has(n.id),
    )
    .map((n) => n.id);
```

- [ ] **Step 2.4:** Run the test to verify it passes:

```bash
cd /c/dev/strand/.claude/worktrees/agent-a9f44df3 && npx vitest run src/analyzer/__tests__/noise-filter.test.ts
```

Expected: All tests PASS

- [ ] **Step 2.5:** Run full test suite:

```bash
cd /c/dev/strand/.claude/worktrees/agent-a9f44df3 && npx vitest run
```

Expected: All tests pass

- [ ] **Step 2.6:** Commit:

```bash
cd /c/dev/strand/.claude/worktrees/agent-a9f44df3 && git add src/analyzer/index.ts src/analyzer/__tests__/noise-filter.test.ts && git commit -m "feat(analyzer): filter .generated.ts and .d.ts from dead code list"
```

---

## Task 3: CHURN graph-membership filter + test

**Files:**
- Modify: `src/encoder/strand-format-encode.ts` (lines 193-217, `renderChurn()` function)
- Create: `src/encoder/__tests__/churn-filter.test.ts`

**Context:** CHURN comes from `git log --numstat`, which returns ALL changed files including `.md`, `.json`, lock files, etc. The current `renderChurn()` does not filter against graph membership. Files like `yarn.lock`, `FINDINGS.md`, `.strand` appear in CHURN even though they are not source files in the scanner graph. The fix: build a `Set` of graph node IDs and skip CHURN entries that are not in the graph.

### Steps

- [ ] **Step 3.1:** Create test file `src/encoder/__tests__/churn-filter.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { encodeToStrandFormat } from "../strand-format-encode.js";
import type { StrandGraph } from "../../scanner/index.js";
import type { GraphAnalysis } from "../../analyzer/index.js";

function makeGraph(): StrandGraph {
  return {
    projectName: "test",
    projectType: "app",
    framework: "typescript",
    totalFiles: 2,
    totalLines: 200,
    modules: [],
    nodes: [
      {
        id: "src/lib/utils.ts",
        path: "src/lib/utils.ts",
        type: "utility",
        name: "utils.ts",
        lines: 100,
        imports: [],
        exports: ["helper"],
        complexity: 0.5,
      },
      {
        id: "src/app/page.tsx",
        path: "src/app/page.tsx",
        type: "route",
        name: "page.tsx",
        lines: 100,
        imports: [],
        exports: ["default"],
        complexity: 0.3,
      },
    ],
    edges: [],
  };
}

function makeAnalysisWithChurn(): GraphAnalysis {
  const churn = new Map<string, {
    nodeId: string;
    commits30d: number;
    linesAdded30d: number;
    linesRemoved30d: number;
    lastCommitHash: string;
    lastCommitDate: string;
    lastCommitMsg: string;
  }>();

  // Source file — in graph, should appear in CHURN
  churn.set("src/lib/utils.ts", {
    nodeId: "src/lib/utils.ts",
    commits30d: 10,
    linesAdded30d: 200,
    linesRemoved30d: 50,
    lastCommitHash: "abc1234",
    lastCommitDate: "2026-03-01",
    lastCommitMsg: "fix: update utils",
  });

  // Lock file — NOT in graph, should be filtered out
  churn.set("yarn.lock", {
    nodeId: "yarn.lock",
    commits30d: 8,
    linesAdded30d: 5000,
    linesRemoved30d: 3000,
    lastCommitHash: "def5678",
    lastCommitDate: "2026-03-02",
    lastCommitMsg: "chore: update deps",
  });

  // Markdown file — NOT in graph, should be filtered out
  churn.set("FINDINGS.md", {
    nodeId: "FINDINGS.md",
    commits30d: 6,
    linesAdded30d: 300,
    linesRemoved30d: 10,
    lastCommitHash: "ghi9012",
    lastCommitDate: "2026-03-03",
    lastCommitMsg: "docs: update findings",
  });

  // .strand file — NOT in graph, should be filtered out
  churn.set(".strand", {
    nodeId: ".strand",
    commits30d: 5,
    linesAdded30d: 100,
    linesRemoved30d: 80,
    lastCommitHash: "jkl3456",
    lastCommitDate: "2026-03-04",
    lastCommitMsg: "chore: regenerate strand",
  });

  return {
    risk: [],
    deadCode: [],
    churn,
    conventions: [],
    coChanges: [],
  };
}

describe("CHURN graph-membership filter", () => {
  it("includes source files that are in the graph", () => {
    const output = encodeToStrandFormat(makeGraph(), makeAnalysisWithChurn());
    const churnSection = extractSection(output, "CHURN");
    expect(churnSection).toContain("src/lib/utils.ts");
  });

  it("excludes yarn.lock (not in graph)", () => {
    const output = encodeToStrandFormat(makeGraph(), makeAnalysisWithChurn());
    const churnSection = extractSection(output, "CHURN");
    expect(churnSection).not.toContain("yarn.lock");
  });

  it("excludes FINDINGS.md (not in graph)", () => {
    const output = encodeToStrandFormat(makeGraph(), makeAnalysisWithChurn());
    const churnSection = extractSection(output, "CHURN");
    expect(churnSection).not.toContain("FINDINGS.md");
  });

  it("excludes .strand (not in graph)", () => {
    const output = encodeToStrandFormat(makeGraph(), makeAnalysisWithChurn());
    const churnSection = extractSection(output, "CHURN");
    expect(churnSection).not.toContain(".strand");
  });
});

/** Extract a section from the encoded output by section header name. */
function extractSection(output: string, sectionName: string): string {
  const lines = output.split("\n");
  const startIdx = lines.findIndex(l => l.includes(sectionName));
  if (startIdx === -1) return "";
  const sectionLines: string[] = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i]!.startsWith("───")) break;
    sectionLines.push(lines[i]!);
  }
  return sectionLines.join("\n");
}
```

- [ ] **Step 3.2:** Run the test to verify it fails:

```bash
cd /c/dev/strand/.claude/worktrees/agent-a9f44df3 && npx vitest run src/encoder/__tests__/churn-filter.test.ts
```

Expected: FAIL — `yarn.lock`, `FINDINGS.md`, `.strand` appear in CHURN output

- [ ] **Step 3.3:** Modify `renderChurn()` in `src/encoder/strand-format-encode.ts`. The function signature needs to accept `graph` so it can build the node ID set. Change the function from:

```typescript
function renderChurn(graph: StrandGraph, analysis: GraphAnalysis): string {
  if (!analysis.churn || analysis.churn.size === 0) return "";

  // Get files with >= 3 commits (high churn)
  const highChurn = [...analysis.churn.values()]
    .filter((c) => c.commits30d >= 3)
    .sort((a, b) => b.commits30d - a.commits30d)
    .slice(0, 10);
```

to:

```typescript
function renderChurn(graph: StrandGraph, analysis: GraphAnalysis): string {
  if (!analysis.churn || analysis.churn.size === 0) return "";

  // Only show churn for files that exist in the scanner graph.
  // This filters out lock files, markdown, .strand, and other non-source content.
  const graphNodeIds = new Set(graph.nodes.map(n => n.id));

  // Get files with >= 3 commits (high churn)
  const highChurn = [...analysis.churn.values()]
    .filter((c) => c.commits30d >= 3 && graphNodeIds.has(c.nodeId))
    .sort((a, b) => b.commits30d - a.commits30d)
    .slice(0, 10);
```

- [ ] **Step 3.4:** Run the test to verify it passes:

```bash
cd /c/dev/strand/.claude/worktrees/agent-a9f44df3 && npx vitest run src/encoder/__tests__/churn-filter.test.ts
```

Expected: All 4 tests PASS

- [ ] **Step 3.5:** Run full test suite:

```bash
cd /c/dev/strand/.claude/worktrees/agent-a9f44df3 && npx vitest run
```

Expected: All tests pass

- [ ] **Step 3.6:** Commit:

```bash
cd /c/dev/strand/.claude/worktrees/agent-a9f44df3 && git add src/encoder/strand-format-encode.ts src/encoder/__tests__/churn-filter.test.ts && git commit -m "feat(encoder): filter CHURN to graph-member files only (removes lock files, .md, .strand)"
```

---

## Task 4: CO-CHANGE graph-membership filter + test

**Files:**
- Modify: `src/encoder/strand-format-encode.ts` (lines 247-264, `renderCoChange()` function)
- Modify: `src/encoder/__tests__/churn-filter.test.ts` (add CO-CHANGE tests to same file)

**Context:** CO-CHANGE pairs also come from git history and can include non-source files (e.g., `package.json ↔ yarn.lock`). Apply the same graph-membership filter. The `renderCoChange` function currently receives only `analysis` — it needs to also receive `graph`.

### Steps

- [ ] **Step 4.1:** Add CO-CHANGE tests to `src/encoder/__tests__/churn-filter.test.ts`. Rename the file first for clarity — actually, keep the same file and add a new `describe` block:

```typescript
// Add to src/encoder/__tests__/churn-filter.test.ts, after the CHURN tests

function makeAnalysisWithCoChange(): GraphAnalysis {
  return {
    risk: [],
    deadCode: [],
    churn: new Map(),
    conventions: [],
    coChanges: [
      {
        fileA: "src/lib/utils.ts",
        fileB: "src/app/page.tsx",
        coChangeCount: 5,
        totalCommitsA: 10,
        totalCommitsB: 8,
        confidence: 0.625,
        importConnected: true,
      },
      {
        fileA: "package.json",
        fileB: "yarn.lock",
        coChangeCount: 8,
        totalCommitsA: 12,
        totalCommitsB: 10,
        confidence: 0.8,
        importConnected: false,
      },
      {
        fileA: "src/lib/utils.ts",
        fileB: "README.md",
        coChangeCount: 4,
        totalCommitsA: 10,
        totalCommitsB: 6,
        confidence: 0.667,
        importConnected: false,
      },
    ],
  };
}

describe("CO-CHANGE graph-membership filter", () => {
  it("includes pairs where BOTH files are in the graph", () => {
    const output = encodeToStrandFormat(makeGraph(), makeAnalysisWithCoChange());
    const coChangeSection = extractSection(output, "CO-CHANGE");
    expect(coChangeSection).toContain("utils");
    expect(coChangeSection).toContain("page");
  });

  it("excludes pairs where EITHER file is not in the graph", () => {
    const output = encodeToStrandFormat(makeGraph(), makeAnalysisWithCoChange());
    const coChangeSection = extractSection(output, "CO-CHANGE");
    expect(coChangeSection).not.toContain("yarn.lock");
    expect(coChangeSection).not.toContain("package.json");
    expect(coChangeSection).not.toContain("README.md");
  });
});
```

- [ ] **Step 4.2:** Run the test to verify it fails:

```bash
cd /c/dev/strand/.claude/worktrees/agent-a9f44df3 && npx vitest run src/encoder/__tests__/churn-filter.test.ts
```

Expected: FAIL — `package.json ↔ yarn.lock` pair appears in CO-CHANGE output

- [ ] **Step 4.3:** Modify `renderCoChange()` in `src/encoder/strand-format-encode.ts`. Change the function signature and add filter. First, update the call site (line 52) from:

```typescript
    out += renderCoChange(analysis);
```

to:

```typescript
    out += renderCoChange(graph, analysis);
```

Then change the function from:

```typescript
function renderCoChange(analysis: GraphAnalysis): string {
  if (!analysis.coChanges || analysis.coChanges.length === 0) return "";

  let out = `─── CO-CHANGE (files that change together) ───────────────\n`;

  for (const pair of analysis.coChanges) {
```

to:

```typescript
function renderCoChange(graph: StrandGraph, analysis: GraphAnalysis): string {
  if (!analysis.coChanges || analysis.coChanges.length === 0) return "";

  // Only show pairs where both files exist in the scanner graph.
  const graphNodeIds = new Set(graph.nodes.map(n => n.id));
  const filteredPairs = analysis.coChanges.filter(
    p => graphNodeIds.has(p.fileA) && graphNodeIds.has(p.fileB),
  );
  if (filteredPairs.length === 0) return "";

  let out = `─── CO-CHANGE (files that change together) ───────────────\n`;

  for (const pair of filteredPairs) {
```

- [ ] **Step 4.4:** Run the test to verify it passes:

```bash
cd /c/dev/strand/.claude/worktrees/agent-a9f44df3 && npx vitest run src/encoder/__tests__/churn-filter.test.ts
```

Expected: All CHURN and CO-CHANGE tests PASS

- [ ] **Step 4.5:** Run full test suite:

```bash
cd /c/dev/strand/.claude/worktrees/agent-a9f44df3 && npx vitest run
```

Expected: All tests pass

- [ ] **Step 4.6:** Commit:

```bash
cd /c/dev/strand/.claude/worktrees/agent-a9f44df3 && git add src/encoder/strand-format-encode.ts src/encoder/__tests__/churn-filter.test.ts && git commit -m "feat(encoder): filter CO-CHANGE to graph-member files only"
```

---

## Task 5: P95 complexity normalization + test

**Files:**
- Modify: `src/scanner/index.ts` (lines 601-616, `calculateComplexity()` function)
- Create: `src/scanner/__tests__/complexity.test.ts`

**Context:** The current `calculateComplexity()` uses max-based normalization. A single outlier file (e.g., a 4,769-line data file) compresses all other files toward 0, reducing the discriminating power of the complexity score. P95 normalization uses the 95th percentile as the reference max, clamping files above P95 to 1.0. This spreads the 0-1 range across the bulk of the distribution.

### Steps

- [ ] **Step 5.1:** Create test file `src/scanner/__tests__/complexity.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { scanCodebase } from "../index.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

function scaffoldAndScan(files: Record<string, string>) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "strand-complexity-"));
  fs.writeFileSync(
    path.join(tmp, "package.json"),
    '{"name":"test","dependencies":{"react":"18.0.0"}}',
  );

  for (const [filePath, content] of Object.entries(files)) {
    const full = path.join(tmp, filePath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }

  const graph = scanCodebase(tmp);
  fs.rmSync(tmp, { recursive: true, force: true });
  return graph;
}

describe("calculateComplexity — P95 normalization", () => {
  it("outlier file clamps to 1.0, does not compress others", () => {
    // Create 20 normal files (~50 lines each) and 1 huge outlier (5000 lines)
    const files: Record<string, string> = {};

    // 20 normal files with ~50 lines
    for (let i = 0; i < 20; i++) {
      const lines = Array.from({ length: 50 }, (_, j) =>
        `export const val${j} = ${j};`
      ).join("\n");
      files[`src/file-${i}.ts`] = lines;
    }

    // 1 outlier with 5000 lines (simulating a data file)
    const outlierLines = Array.from({ length: 5000 }, (_, j) =>
      `export const data${j} = "${j}";`
    ).join("\n");
    files["src/outlier.ts"] = outlierLines;

    const graph = scaffoldAndScan(files);

    const outlier = graph.nodes.find(n => n.name === "outlier.ts");
    const normal = graph.nodes.filter(n => n.name.startsWith("file-"));

    // Outlier should clamp to 1.0
    expect(outlier?.complexity).toBe(1);

    // Normal files should NOT be compressed near 0 (old behavior: 50/5000 = 0.01)
    // With P95: they should be much higher since P95 is around ~50 lines
    const avgComplexity = normal.reduce((sum, n) => sum + n.complexity, 0) / normal.length;
    expect(avgComplexity).toBeGreaterThan(0.3);
  });

  it("returns 0 complexity for empty node array", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "strand-empty-"));
    fs.writeFileSync(
      path.join(tmp, "package.json"),
      '{"name":"test"}',
    );
    const graph = scanCodebase(tmp);
    fs.rmSync(tmp, { recursive: true, force: true });
    // No source files — should not crash
    expect(graph.nodes.length).toBe(0);
  });

  it("files above P95 all clamp to 1.0", () => {
    const files: Record<string, string> = {};

    // 19 small files (10 lines)
    for (let i = 0; i < 19; i++) {
      const lines = Array.from({ length: 10 }, (_, j) =>
        `export const v${j} = ${j};`
      ).join("\n");
      files[`src/small-${i}.ts`] = lines;
    }

    // 2 large files (both above what would be P95)
    for (let i = 0; i < 2; i++) {
      const lines = Array.from({ length: 2000 }, (_, j) =>
        `export const big${j} = ${j};`
      ).join("\n");
      files[`src/big-${i}.ts`] = lines;
    }

    const graph = scaffoldAndScan(files);
    const bigFiles = graph.nodes.filter(n => n.name.startsWith("big-"));

    // Both should be clamped to 1.0 (they're above P95)
    for (const f of bigFiles) {
      expect(f.complexity).toBe(1);
    }
  });
});
```

- [ ] **Step 5.2:** Run the test to verify it fails:

```bash
cd /c/dev/strand/.claude/worktrees/agent-a9f44df3 && npx vitest run src/scanner/__tests__/complexity.test.ts
```

Expected: FAIL — outlier compresses normal files to near-zero with max-based normalization

- [ ] **Step 5.3:** Replace `calculateComplexity()` in `src/scanner/index.ts` (lines 601-616). Change from:

```typescript
function calculateComplexity(nodes: StrandNode[]): void {
  if (nodes.length === 0) return;

  const maxLines = nodes.reduce((max, n) => (n.lines > max ? n.lines : max), 0);
  const maxImports = nodes.reduce(
    (max, n) => (n.imports.length > max ? n.imports.length : max),
    0,
  );

  for (const node of nodes) {
    // Simple complexity: weighted combination of lines and import count
    const lineScore = maxLines > 0 ? node.lines / maxLines : 0;
    const importScore = maxImports > 0 ? node.imports.length / maxImports : 0;
    node.complexity = lineScore * 0.6 + importScore * 0.4;
  }
}
```

to:

```typescript
/**
 * Compute the value at a given percentile from a sorted array.
 * Uses linear interpolation between adjacent ranks.
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

function calculateComplexity(nodes: StrandNode[]): void {
  if (nodes.length === 0) return;

  // P95 normalization: use 95th percentile as the effective max.
  // Files above P95 clamp to 1.0 instead of compressing the entire range.
  const sortedLines = nodes.map(n => n.lines).sort((a, b) => a - b);
  const sortedImports = nodes.map(n => n.imports.length).sort((a, b) => a - b);

  const p95Lines = percentile(sortedLines, 95);
  const p95Imports = percentile(sortedImports, 95);

  for (const node of nodes) {
    const lineScore = p95Lines > 0 ? Math.min(node.lines / p95Lines, 1.0) : 0;
    const importScore = p95Imports > 0 ? Math.min(node.imports.length / p95Imports, 1.0) : 0;
    node.complexity = Math.round((lineScore * 0.6 + importScore * 0.4) * 100) / 100;
  }
}
```

- [ ] **Step 5.4:** Run the test to verify it passes:

```bash
cd /c/dev/strand/.claude/worktrees/agent-a9f44df3 && npx vitest run src/scanner/__tests__/complexity.test.ts
```

Expected: All 3 tests PASS

- [ ] **Step 5.5:** Run full test suite:

```bash
cd /c/dev/strand/.claude/worktrees/agent-a9f44df3 && npx vitest run
```

Expected: All tests pass. Note: some tests that hard-code complexity values (like `risk-render.test.ts` with `complexity: 0.5`) should still pass because those mock the complexity directly rather than going through `calculateComplexity()`.

- [ ] **Step 5.6:** Commit:

```bash
cd /c/dev/strand/.claude/worktrees/agent-a9f44df3 && git add src/scanner/index.ts src/scanner/__tests__/complexity.test.ts && git commit -m "feat(scanner): P95 complexity normalization — outliers no longer compress the range"
```

---

## Task 6: Tie-breaking sort by lines + test

**Files:**
- Modify: `src/encoder/strand-format-encode.ts` (3 sort locations: lines 269, 296, 467)
- Create: `src/encoder/__tests__/sort-tiebreak.test.ts`

**Context:** When files have the same complexity score (more common after P95 normalization since multiple files can clamp to 1.0), the current sort is unstable. Adding `lines` as a secondary sort key produces a deterministic, meaningful order: bigger files appear first within the same complexity tier.

### Steps

- [ ] **Step 6.1:** Create test file `src/encoder/__tests__/sort-tiebreak.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { encodeToStrandFormat } from "../strand-format-encode.js";
import type { StrandGraph } from "../../scanner/index.js";
import type { GraphAnalysis } from "../../analyzer/index.js";

function makeGraphWithTiedComplexity(): StrandGraph {
  return {
    projectName: "test",
    projectType: "Next.js",
    framework: "nextjs",
    totalFiles: 3,
    totalLines: 600,
    modules: [],
    nodes: [
      {
        id: "src/app/api/small/route.ts",
        path: "src/app/api/small/route.ts",
        type: "api-route",
        name: "route.ts",
        lines: 50,
        imports: [],
        exports: ["GET"],
        complexity: 1.0,  // Same complexity (clamped)
        framework: { type: "nextjs-api", metadata: { methods: ["GET"], routePath: "/api/small" } },
      },
      {
        id: "src/app/api/large/route.ts",
        path: "src/app/api/large/route.ts",
        type: "api-route",
        name: "route.ts",
        lines: 500,
        imports: [],
        exports: ["GET", "POST"],
        complexity: 1.0,  // Same complexity (clamped)
        framework: { type: "nextjs-api", metadata: { methods: ["GET", "POST"], routePath: "/api/large" } },
      },
      {
        id: "src/app/api/medium/route.ts",
        path: "src/app/api/medium/route.ts",
        type: "api-route",
        name: "route.ts",
        lines: 200,
        imports: [],
        exports: ["GET"],
        complexity: 1.0,  // Same complexity (clamped)
        framework: { type: "nextjs-api", metadata: { methods: ["GET"], routePath: "/api/medium" } },
      },
    ],
    edges: [],
  };
}

function makeGraphWithTiedPages(): StrandGraph {
  return {
    projectName: "test",
    projectType: "Next.js",
    framework: "nextjs",
    totalFiles: 3,
    totalLines: 750,
    modules: [],
    nodes: [
      {
        id: "src/app/small/page.tsx",
        path: "src/app/small/page.tsx",
        type: "route",
        name: "page.tsx",
        lines: 50,
        imports: [],
        exports: ["default"],
        complexity: 0.8,
        framework: { type: "nextjs-page", metadata: { routePath: "/small", isClientComponent: false } },
      },
      {
        id: "src/app/large/page.tsx",
        path: "src/app/large/page.tsx",
        type: "route",
        name: "page.tsx",
        lines: 400,
        imports: [],
        exports: ["default"],
        complexity: 0.8,
        framework: { type: "nextjs-page", metadata: { routePath: "/large", isClientComponent: false } },
      },
      {
        id: "src/app/medium/page.tsx",
        path: "src/app/medium/page.tsx",
        type: "route",
        name: "page.tsx",
        lines: 200,
        imports: [],
        exports: ["default"],
        complexity: 0.8,
        framework: { type: "nextjs-page", metadata: { routePath: "/medium", isClientComponent: false } },
      },
    ],
    edges: [],
  };
}

describe("API ROUTES tie-breaking by lines", () => {
  it("sorts by lines descending when complexity is tied", () => {
    const output = encodeToStrandFormat(makeGraphWithTiedComplexity());
    const apiSection = extractSection(output, "API ROUTES");

    // All have complexity 1.0, so should sort by lines: large (500) > medium (200) > small (50)
    const largeIdx = apiSection.indexOf("/api/large");
    const mediumIdx = apiSection.indexOf("/api/medium");
    const smallIdx = apiSection.indexOf("/api/small");

    expect(largeIdx).toBeLessThan(mediumIdx);
    expect(mediumIdx).toBeLessThan(smallIdx);
  });
});

describe("PAGES tie-breaking by lines", () => {
  it("sorts by lines descending when complexity is tied", () => {
    const output = encodeToStrandFormat(makeGraphWithTiedPages());
    const pagesSection = extractSection(output, "PAGES");

    // All have complexity 0.8, so should sort by lines: large (400) > medium (200) > small (50)
    const largeIdx = pagesSection.indexOf("/large");
    const mediumIdx = pagesSection.indexOf("/medium");
    const smallIdx = pagesSection.indexOf("/small");

    expect(largeIdx).toBeLessThan(mediumIdx);
    expect(mediumIdx).toBeLessThan(smallIdx);
  });
});

function extractSection(output: string, sectionName: string): string {
  const lines = output.split("\n");
  const startIdx = lines.findIndex(l => l.includes(sectionName));
  if (startIdx === -1) return "";
  const sectionLines: string[] = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i]!.startsWith("───")) break;
    sectionLines.push(lines[i]!);
  }
  return sectionLines.join("\n");
}
```

- [ ] **Step 6.2:** Run the test to verify it fails (or is non-deterministic):

```bash
cd /c/dev/strand/.claude/worktrees/agent-a9f44df3 && npx vitest run src/encoder/__tests__/sort-tiebreak.test.ts
```

Expected: FAIL or flaky — current sort is `b.complexity - a.complexity` which returns 0 for ties, giving unstable order

- [ ] **Step 6.3:** Update the three sort locations in `src/encoder/strand-format-encode.ts`.

**Location 1 — `renderApiRoutes()` (line 269):** Change from:

```typescript
    .sort((a, b) => b.complexity - a.complexity);
```

to:

```typescript
    .sort((a, b) => b.complexity - a.complexity || b.lines - a.lines);
```

**Location 2 — `renderPages()` (line 296):** Change from:

```typescript
    .sort((a, b) => b.complexity - a.complexity);
```

to:

```typescript
    .sort((a, b) => b.complexity - a.complexity || b.lines - a.lines);
```

**Location 3 — `renderFlows()` entry points sort (line 467):** Change from:

```typescript
    .sort((a, b) => b.complexity - a.complexity);
```

to:

```typescript
    .sort((a, b) => b.complexity - a.complexity || b.lines - a.lines);
```

- [ ] **Step 6.4:** Run the test to verify it passes:

```bash
cd /c/dev/strand/.claude/worktrees/agent-a9f44df3 && npx vitest run src/encoder/__tests__/sort-tiebreak.test.ts
```

Expected: All tests PASS

- [ ] **Step 6.5:** Run full test suite:

```bash
cd /c/dev/strand/.claude/worktrees/agent-a9f44df3 && npx vitest run
```

Expected: All tests pass

- [ ] **Step 6.6:** Commit:

```bash
cd /c/dev/strand/.claude/worktrees/agent-a9f44df3 && git add src/encoder/strand-format-encode.ts src/encoder/__tests__/sort-tiebreak.test.ts && git commit -m "feat(encoder): tie-break complexity sorts by line count descending"
```

---

## Task 7: End-to-end verification

**Files:**
- Read: `.strand` (before and after)

**Context:** Regenerate `.strand` for the strand project itself and verify the output improves. This catches integration issues that unit tests miss.

### Steps

- [ ] **Step 7.1:** Save the current `.strand` for comparison:

```bash
cd /c/dev/strand/.claude/worktrees/agent-a9f44df3 && cp .strand .strand.before 2>/dev/null || true
```

- [ ] **Step 7.2:** Build the project to ensure all changes compile:

```bash
cd /c/dev/strand/.claude/worktrees/agent-a9f44df3 && npx tsc --noEmit
```

Expected: No type errors

- [ ] **Step 7.3:** Regenerate `.strand` for the strand codebase:

```bash
cd /c/dev/strand/.claude/worktrees/agent-a9f44df3 && npx tsx src/cli/index.ts generate .
```

- [ ] **Step 7.4:** Verify improvements in the new `.strand`:

Check DEAD CODE:
```bash
cd /c/dev/strand/.claude/worktrees/agent-a9f44df3 && grep -c "\.d\.ts" .strand.before; echo "---"; grep -c "\.d\.ts" .strand
```

Expected: `.d.ts` files no longer appear in DEAD CODE section of new `.strand`.

Check CHURN:
```bash
cd /c/dev/strand/.claude/worktrees/agent-a9f44df3 && grep "FINDINGS.md\|\.strand\|yarn.lock\|package-lock" .strand || echo "No non-source files in CHURN"
```

Expected: No lock files, markdown files, or `.strand` in CHURN section.

Check complexity distribution — API ROUTES and PAGES should have more spread-out scores (not all compressed near 0).

- [ ] **Step 7.5:** Run the full test suite one final time:

```bash
cd /c/dev/strand/.claude/worktrees/agent-a9f44df3 && npx vitest run
```

Expected: All tests pass

- [ ] **Step 7.6:** Clean up the backup file:

```bash
cd /c/dev/strand/.claude/worktrees/agent-a9f44df3 && rm -f .strand.before
```

---

## Summary

| Task | What | Files Changed | Tests Added |
|------|------|---------------|-------------|
| 1 | `isNoiseFile()` helper | `src/analyzer/index.ts` | 8 unit tests |
| 2 | Dead code filter | `src/analyzer/index.ts` | 1 integration test |
| 3 | CHURN graph-membership filter | `src/encoder/strand-format-encode.ts` | 4 tests |
| 4 | CO-CHANGE graph-membership filter | `src/encoder/strand-format-encode.ts` | 2 tests |
| 5 | P95 complexity normalization | `src/scanner/index.ts` | 3 tests |
| 6 | Tie-breaking sort by lines | `src/encoder/strand-format-encode.ts` | 2 tests |
| 7 | End-to-end verification | (read-only) | - |

**Total: 7 tasks, 6 commits, 20 new tests, 3 files modified, 3 test files created**
