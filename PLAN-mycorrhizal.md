# Mycorrhizal Network Analysis — Implementation Plan (v2)

## Context

Strand encodes codebases into compact maps for LLMs. The current `.strand` format shows terrain (complexity), infrastructure (dependencies), routes, hotspots, and test coverage at ~1.2K tokens. We're adding 4 analysis features inspired by mycorrhizal fungal networks — extending the graph that `scanCodebase()` already builds with derived ecological metrics.

This plan incorporates feedback from three critics: a mycologist, a software architect, and a DX/output specialist.

## Architecture

New **`src/analyzer/`** module sits between scanner and encoder:

```
scanCodebase(rootDir) → graph
analyzeGraph(graph) → analysis    ← NEW
encodeToStrandFormat(graph, analysis) → string
```

Key design decisions:
- **Keep existing encoder signatures unchanged.** Add new rendering by appending analysis sections inside the existing encoder functions when `analysis` is provided (optional param, backward compatible).
- **Build shared data structures once** in `analyzeGraph()` — reverse adjacency, inbound counts, blast radii — and pass to all 4 sub-analyzers. No redundant computation.
- **Merge RISK section** — blast radius + keystones become a single section to avoid showing the same files twice.

## New Files

### `src/analyzer/graph-utils.ts` — Shared graph traversal

- `buildReverseAdjacency(edges, excludeTestEdges?)` → `Map<nodeId, string[]>` — who imports this node? Filter edges before building (not after) to handle test edge exclusion cleanly.
- `buildForwardAdjacency(edges)` → `Map<nodeId, string[]>`
- `countInboundEdges(edges)` → `Map<nodeId, number>`
- `bfs(startId, adjacency)` → `Map<nodeId, depth>` — **MUST use visited Set** to handle circular dependencies. Returns reachable nodes with depth, excluding start node.
- `getModuleId(nodePath)` → canonical module ID. Single source of truth — replaces duplicates in `strand-format-encode.ts:322` and `scanner/index.ts:484`.
- `countDistinctModules(nodeIds)` → number of unique modules
- `isBarrelFile(node, graph)` → boolean. Detects index.ts/js files where re-export lines > 50% of content. Used to discount inflated scores.
- `percentileRank(value, allValues)` → 0-1. Robust normalization that handles outliers (one file with 200 imports doesn't squash everyone else to 0).

### `src/analyzer/blast-radius.ts` — Warning Signals

When a file changes, what's the transitive impact?

- Build reverse adjacency **excluding test edges** (tests breaking doesn't cascade)
- BFS from target node, tracking depth
- **Signal attenuation**: weight each affected file by `0.7^depth` — biologically accurate (mycorrhizal defense signals decay exponentially with hyphal distance), practically useful (depth-1 dependents are truly at risk, depth-5 are theoretical)
- Return per-file: `{ affectedCount, weightedImpact, modulesAffected, maxDepth, directImporters, amplificationRatio }`
- `amplificationRatio = blastRadius / directImporters` — captures how much damage cascades beyond direct dependents (more useful than raw blast radius, which correlates heavily with inbound count)
- **Barrel file handling**: when a barrel file (index.ts) is encountered during BFS, flag it as an amplification point but propagate through to actual source files
- `computeAllBlastRadii(graph, reverseAdj)` runs BFS for every non-test/config node with inbound > 0. Returns `Map<nodeId, BlastResult>`. Shared by both risk and keystone analysis.
- **Performance**: For codebases > 5K files, skip nodes with inbound ≤ 1 (their blast radius is trivially derivable from their parent). O(N*(N+E)) is fine at 2K files, borderline at 10K.

### `src/analyzer/dead-wood.ts` — Unreachable Files

Files with zero inbound edges that nothing imports.

- Count inbound edges per node from pre-built map
- Exclude natural entry points by type: `route`, `api-route`, `layout`, `middleware`, `test`, `config`, `schema`
- **Extended exclusions** (false positive prevention):
  - Barrel files (`index.ts`/`index.js` at module roots)
  - Next.js convention files: `not-found.tsx`, `error.tsx`, `loading.tsx`, `template.tsx`, `default.tsx`, `opengraph-image.tsx`, `sitemap.ts`, `robots.ts`, `instrumentation.ts`
  - Storybook files: `*.stories.tsx`
  - CLI/script files: paths containing `cli/`, `bin/`, `scripts/`
  - Files re-exported from a barrel that itself has inbound edges (reachable via barrel)
- **Confidence levels**: `high` (utility deep in tree, 0 inbound), `medium` (component, 0 inbound), `low` (near root or in convention-based directory)
- Return dead files sorted by line count, with total dead lines and reason strings
- **If 0 dead files, emit nothing** (don't waste tokens on "no dead wood found")

### `src/analyzer/keystones.ts` — Single Points of Failure

Files whose removal would fragment the dependency graph.

Fragility score (0-1) = weighted composite using **percentile rank normalization**:
- 0.25 × percentile(inbound count) — raw popularity
- 0.30 × moduleSpreadRatio (dependent modules / total modules) — cross-cutting risk
- 0.25 × complexity (already 0-1 on node) — harder to fix when it breaks
- 0.20 × percentile(amplificationRatio) — cascade multiplier, not raw blast radius (avoids correlation with inbound)

**Betweenness centrality** (from mycologist): For top-N keystone candidates, compute approximate betweenness — how many shortest paths between other node pairs run through this file. A file with moderate inbound but high betweenness is a *bridge node* (chokepoint between subsystems). More dangerous than a popular utility. Use sampled BFS (Brandes' algorithm with sampling for large graphs).

**Redundancy scoring** (`hasAlternatives`): For each keystone, check if other files in the same module export overlapping symbol names (Jaccard similarity > 0.3 on export names). A hub with alternatives is load-bearing but not fragile. A hub with no alternatives is a true single point of failure.

**Barrel file discount**: Halve the inbound weight for detected barrel files — their centrality is structural (re-exports) not functional.

### `src/analyzer/symbiosis.ts` — Coupling Health

Score module-pair relationships. **Reclassified by exchange type, not just balance ratio** (per mycologist: mutualism is complementary exchange, not symmetric exchange).

- Aggregate cross-module edges into canonical pairs (alphabetically sorted)
- **Exclude test modules** (modules where >50% of nodes are type `test`) — test→lib is naturally one-way and healthy
- **Exclude test edges** (`edge.type === "tests"`) entirely
- **Relative thresholds** instead of absolute: `edgeDensity = totalEdges / min(moduleA.nodeCount, moduleB.nodeCount)` — scales with project size

Classification (5 categories, not 3):
- **Mutualistic**: edges flow both ways AND use different edge types (e.g., A imports types from B, B renders components from A). Complementary exchange.
- **Reciprocal**: edges flow both ways with similar edge types. Could be healthy collaboration or circular dependency risk. Flag for review.
- **Commensal**: one-way dependency, low density (< 0.3). Benign — one module uses the other lightly.
- **Parasitic**: one-way dependency, high density (≥ 0.3). One module is heavily dependent with no reciprocity.
- **Bridge**: two modules not directly connected but linked through a shared third module. (Detected by checking if A and B share common dependency modules with no direct A↔B edges.)

`healthScore = (mutualistic + commensal) / totalPairs`

Thresholds are named constants at top of file for tuning.

### `src/analyzer/index.ts` — Entry point

```typescript
export function analyzeGraph(graph: StrandGraph): GraphAnalysis {
  if (graph.nodes.length === 0) return emptyAnalysis();

  const reverseAdj = buildReverseAdjacency(graph.edges, true); // exclude test edges
  const inboundCounts = countInboundEdges(graph.edges);
  const blastRadii = computeAllBlastRadii(graph, reverseAdj);

  return {
    risk: computeRisk(graph, reverseAdj, inboundCounts, blastRadii),
    deadWood: computeDeadWood(graph, inboundCounts),
    symbiosis: computeSymbiosis(graph),
  };
}
```

Risk combines blast radius + keystone scoring into a single analysis (merged section).
Re-exports all types.

## Encoder Changes

### `src/encoder/strand-format-encode.ts`

**3 sections** (not 4 — WARNING SIGNALS and KEYSTONES merged into RISK). Inserted **after INFRASTRUCTURE, before API ROUTES** (risk info is more actionable than route listings).

```
encodeToStrandFormat(graph, analysis?)
```

If `analysis` provided, new sections render. If omitted, backward compatible.

**Section order becomes:**
```
TERRAIN → INFRASTRUCTURE → RISK → COUPLING → DEAD FILES → API ROUTES → PAGES → HOTSPOTS → TEST COVERAGE
```

MOST IMPORTED section removed (subsumed by RISK).

**Output format:**

```
── RISK (change with care) ──────────────────────────────
src/lib/auth.ts       47 affected  depth 4  ×15 in  8 mod  cx 0.72  fragility 0.91
src/lib/db.ts         38 affected  depth 3  ×12 in  7 mod  cx 0.65  fragility 0.84
src/lib/utils.ts      31 affected  depth 3  × 8 in  6 mod  cx 0.31  fragility 0.68
src/lib/pay/client.ts 22 affected  depth 2  × 6 in  4 mod  cx 0.88  fragility 0.62  [bridge]
src/ui/Button.tsx      9 affected  depth 1  × 9 in  3 mod  cx 0.15  fragility 0.41  [alt]
  +12 more with blast radius > 5

── COUPLING ─────────────────────────────────────────────
lib        -> components  12:3  parasitic    lib dominates
lib        -> app         15:2  parasitic    lib dominates
components <> app          5:4  mutualistic  balanced
app        -> scripts      2:0  commensal    one-way, light
health: 60% (2 mutualistic + 1 commensal / 5 pairs)

── DEAD FILES (5) ───────────────────────────────────────
127L  src/components/OldBanner.tsx     unused component
 84L  src/lib/legacy-format.ts        unreachable utility
 62L  src/lib/deprecated-helper.ts    unreachable utility
349L total
```

Key format decisions:
- **No Unicode bars** in RISK — numbers are sufficient (our own research: text > visual for LLMs)
- **`[bridge]`** tag for files with high betweenness centrality (chokepoint between subsystems)
- **`[alt]`** tag for files where alternatives exist (less fragile)
- **`->` for one-way, `<>` for bidirectional** in COUPLING — no box-drawing chars (avoids semantic collision with INFRASTRUCTURE section's `═══╢`)
- **Omit empty sections entirely** (return `""`)
- **Drop subtitle lines** — header is self-explanatory
- **Shorter headers** — save ~45 tokens vs original plan

**Token budget: ~300 tokens added** (down from ~540 in v1). Total `.strand` goes from ~1.2K to ~1.5K tokens. Net neutral after removing MOST IMPORTED (~80 tokens).

### `src/encoder/text-encode.ts`

Same 3 sections in `## Section` / `- bullet` markdown format. Remove `## Most Depended-On Files` (subsumed by Risk).

## Refactor

- Extract `getModuleId` from `strand-format-encode.ts:322` into `graph-utils.ts`, import everywhere
- Extract `classifyEdge` from `strand-format-encode.ts:329` into `graph-utils.ts` (also duplicated in `spatial-text-encode.ts:245`)

## Implementation Order

1. `src/analyzer/graph-utils.ts` — foundation (adjacency, BFS with visited set, barrel detection, percentile rank, getModuleId extraction)
2. `src/analyzer/blast-radius.ts` — BFS + attenuation + amplification ratio
3. `src/analyzer/dead-wood.ts` — simplest analysis, validates pipeline
4. `src/analyzer/keystones.ts` — uses blast radii from step 2 + betweenness centrality
5. `src/analyzer/symbiosis.ts` — independent, edge aggregation + 5-category classification
6. `src/analyzer/index.ts` — glue, `analyzeGraph()` with shared data structures
7. `src/encoder/strand-format-encode.ts` — add 3 render functions (RISK, COUPLING, DEAD FILES), remove MOST IMPORTED, reorder sections, update signature
8. `src/encoder/text-encode.ts` — add 3 text sections, remove Most Depended-On
9. Refactor `getModuleId` and `classifyEdge` across files

## Verification

1. `npm run build` — TypeScript compiles with no errors
2. `npm run scan` — run against a real codebase (SenorBurritoCompany if available, or Strand itself)
3. Inspect `.strand` output:
   - RISK section shows files ranked by fragility, blast radius numbers are plausible
   - `[bridge]` tags appear on files with high betweenness, not just high inbound
   - `[alt]` tags appear where module siblings share exports
   - COUPLING shows no test modules, uses `->` and `<>` notation
   - DEAD FILES omitted if 0 dead files found
   - MOST IMPORTED section is gone (subsumed)
   - Section order: TERRAIN → INFRASTRUCTURE → RISK → COUPLING → DEAD FILES → API ROUTES → ...
4. Sanity checks:
   - Dead wood list excludes routes, pages, Next.js convention files, barrel files
   - Blast radius of a leaf file (0 importers) is 0
   - Circular dependencies don't cause infinite loops (BFS visited set)
   - Barrel files have discounted fragility scores
   - Symbiosis of a module with itself doesn't appear
5. Edge cases: empty codebase returns empty analysis, flat codebase (all files in root) doesn't crash module analysis
