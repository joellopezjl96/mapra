# Generated/Data File Filters + Lock File Filtering — Design

**Date:** 2026-03-09
**Status:** Revised (post-review)
**Scope:** P2 (generated/data file noise in HOTSPOTS, DEAD CODE) + P3 (lock files in CHURN/CO-CHANGE)

---

## Problem

Three classes of noise files degrade output quality, confirmed in the cal.com audit:

1. **Generated files** (`.generated.ts`, `.d.ts`) appear in DEAD CODE with zero imports — correct structurally but useless signal.
2. **Data files** (word lists like `freeEmailDomains.ts`: 4,769 lines, 0 imports) score as high-complexity in HOTSPOTS due to raw line count.
3. **Lock files** (`yarn.lock`, `pnpm-lock.yaml`) appear in CHURN because `git log` returns all files, not just scanner-tracked source files.

## Decisions

**`.d.ts` handling:** Use a blanket `\.d\.ts$` filter. Hand-written ambient declarations (`env.d.ts`, `global.d.ts`) are few, small, and legitimately have zero imports — they are consumed by the TypeScript compiler, not by import edges. Filtering them from DEAD CODE is arguably correct. They remain in the scanner graph since they are valid import targets.

**No standalone module:** The filter logic is ~15 lines touching 3 call sites. Inline a helper function in `src/analyzer/index.ts` rather than creating a `noise-filter.ts` module.

**Graph-membership as primary filter for CHURN/CO-CHANGE:** `git log` returns paths for deleted files, `.md`, `.json`, lock files, and other non-source content the scanner never indexed. Filtering by `graphNodeIds.has(filePath)` catches the entire class. The pattern-based `isLockFile()` check is still useful as a belt-and-suspenders guard for lock files (which the scanner already excludes via `IGNORE_FILES`, so they are never in the graph — but explicitly filtering them documents intent). Cross-reference: lock file patterns also exist in `IGNORE_FILES` in `src/scanner/index.ts` — this is intentional, as scanner and git-output operate on different data paths.

**P95 normalization for complexity:** Replace `max` normalization with P95 in `calculateComplexity()` to prevent a single outlier (data file with 4,769 lines) from compressing all other scores. Files above P95 clamp to 1.0. Add `lines` as a secondary sort key in sections that sort by complexity (API ROUTES, PAGES, FLOWS) to break ties among clamped files.

**RISK + MOST IMPORTED deferred:** These sections could theoretically show generated files, but the problem is monorepo-specific (workspace alias gap means generated files rarely accumulate enough import edges to rank). Deferred as future work alongside workspace alias resolution (P0).

**CONVENTIONS and FLOWS are known omissions:** Generated files could appear as convention violators or FLOWS dependencies. Low impact — not addressed in this design.

---

## Implementation

### 1. Noise detection helper in `src/analyzer/index.ts`

```ts
/** Files that are noise in structural analysis (dead code, hotspots). */
function isNoiseFile(nodeId: string): boolean {
  // Generated TypeScript output
  if (/\.generated\.(ts|tsx|js|jsx)$/.test(nodeId)) return true;
  // TypeScript declaration files (hand-written or generated — both lack import edges)
  if (/\.d\.ts$/.test(nodeId)) return true;
  return false;
}
```

No exported interface, no classification enum. Just a boolean predicate.

### 2. Dead code filter in `analyzeGraph()`

In `src/analyzer/index.ts`, add `isNoiseFile` to the dead code filter:

```ts
const deadCode = graph.nodes
  .filter(
    (n) =>
      !SKIP_TYPES.has(n.type) &&
      !reverseAdj.has(n.id) &&
      !isNoiseFile(n.id),          // <-- new
  )
  .map((n) => n.id);
```

### 3. CHURN: graph-membership filter in `renderChurn()`

In `src/encoder/strand-format-encode.ts`, build a node ID set and filter churn entries:

```ts
function renderChurn(graph: StrandGraph, analysis: GraphAnalysis): string {
  if (!analysis.churn || analysis.churn.size === 0) return "";

  const graphNodeIds = new Set(graph.nodes.map(n => n.id));

  const highChurn = [...analysis.churn.values()]
    .filter((c) => c.commits30d >= 3 && graphNodeIds.has(c.nodeId))  // <-- new
    .sort((a, b) => b.commits30d - a.commits30d)
    .slice(0, 10);
  // ...
}
```

### 4. CO-CHANGE: graph-membership filter in `renderCoChange()`

Same pattern — filter pairs where both files are in the graph:

```ts
function renderCoChange(analysis: GraphAnalysis): string {
  // ...
  const filteredPairs = analysis.coChanges.filter(
    (pair) => graphNodeIds.has(pair.fileA) && graphNodeIds.has(pair.fileB),
  );
  // ...
}
```

Note: `renderCoChange` currently receives only `analysis`, not `graph`. Either pass `graph` to it (like `renderChurn`) or build the node set once in `encodeToStrandFormat` and pass it through. Prefer the latter to avoid redundant set construction.

### 5. P95 complexity normalization in `calculateComplexity()`

In `src/scanner/index.ts`:

```ts
function calculateComplexity(nodes: StrandNode[]): void {
  if (nodes.length === 0) return;

  const sortedLines = nodes.map(n => n.lines).sort((a, b) => a - b);
  const sortedImports = nodes.map(n => n.imports.length).sort((a, b) => a - b);

  const p95Index = Math.floor(nodes.length * 0.95);
  const p95Lines = sortedLines[p95Index] ?? sortedLines[sortedLines.length - 1]!;
  const p95Imports = sortedImports[p95Index] ?? sortedImports[sortedImports.length - 1]!;

  for (const node of nodes) {
    const lineScore = p95Lines > 0 ? Math.min(node.lines / p95Lines, 1.0) : 0;
    const importScore = p95Imports > 0 ? Math.min(node.imports.length / p95Imports, 1.0) : 0;
    node.complexity = lineScore * 0.6 + importScore * 0.4;
  }
}
```

### 6. Tie-breaking by lines in complexity-sorted sections

In `renderApiRoutes`, `renderPages`, and the FLOWS entry point sort, add `lines` as secondary key:

```ts
.sort((a, b) => b.complexity - a.complexity || b.lines - a.lines)
```

This ensures stable ordering among files capped at complexity 1.0.

---

## Files Changed

| File | Change |
|---|---|
| `src/scanner/index.ts` | P95 normalization in `calculateComplexity()` |
| `src/analyzer/index.ts` | `isNoiseFile()` helper, dead code filter |
| `src/encoder/strand-format-encode.ts` | Graph-membership filter in `renderChurn()`, `renderCoChange()`; tie-breaking sort in `renderApiRoutes()`, `renderPages()` |

Estimated: ~30 lines of production code across 3 files.

---

## Future Work

- **RISK + MOST IMPORTED noise filtering** — deferred until workspace alias resolution (P0) makes these sections accurate for monorepos.
- **Data file heuristic** — detecting files that are mostly data (word lists, lookup tables) by export-to-line ratio or AST analysis. P95 normalization mitigates the worst symptoms; a positive-identification heuristic can come later.
- **NestJS/Remix/SvelteKit entry point detection** — extend framework entry point patterns beyond Next.js.
