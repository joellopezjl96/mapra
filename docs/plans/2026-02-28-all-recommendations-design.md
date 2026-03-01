# Strand — All Recommendations Implementation Design

**Date:** 2026-02-28
**Scope:** Three-phase implementation of improvements from the four-agent design review.
**Success criterion:** Re-run Experiment 5 (Infisical). `roles/types.ts` must rank #1 in RISK (currently #5), FLOWS must be non-empty for the SPA, token cost must stay within 15% of current baseline.

---

## Phase 1 — Format Changes (encoder)

**Files:** `src/encoder/strand-format-encode.ts`, `src/analyzer/index.ts`
**Approach:** Edit v2 in-place. `strand-format-encode-v1.ts` stays frozen as experiment control.

### 1.1 Section reorder

Change render call order in `encodeToStrandFormat()` from:
```
TERRAIN → INFRASTRUCTURE → RISK → FLOWS → API ROUTES → PAGES → HOTSPOTS → MOST IMPORTED → TEST COVERAGE
```
to:
```
RISK → FLOWS → HOTSPOTS → MOST IMPORTED → TERRAIN → INFRASTRUCTURE → API ROUTES → PAGES → TEST COVERAGE
```

Rationale: LLMs weight earlier context more heavily. RISK and FLOWS are the two highest-signal sections (proven in Exp 4/5). HOTSPOTS + MOST IMPORTED are more actionable than TERRAIN at position 4-5.

### 1.2 RISK sort key

In `analyzer/index.ts`, change sort from `b.weightedImpact - a.weightedImpact` to `b.amplificationRatio - a.amplificationRatio`.

Rationale: `weightedImpact` ranked `roles/types.ts` 5th (51 affected, amp 4.6) behind `GenericAppConnectionFields.tsx` (52 affected, amp 1.0). The amplification ratio is the surprise signal — it surfaces hidden cascades from files with few direct importers.

### 1.3 RISK row format

New format (amp-first, path last):
```
[AMP] amp4.6  ×11→51  d5  3mod  src/hooks/api/roles/types.ts
      amp1.4  ×16→23  d3  2mod  src/lib/teacher-club/ordering.ts
      amp1.0  ×13→13  d1  1mod  src/lib/auth.ts
```

- `[AMP]` 4-char prefix (or 4 spaces) for amplification ratio ≥ 2.0
- `amp X.X` — amplification ratio (key insight, comes first)
- `×N→M` — direct importers → total affected (replaces `×N in  M affected`, saves ~11 chars per row)
- `dN` — max depth
- `Nmod` — modules affected
- path last

Section header: `─── RISK (blast radius — modifying these cascades broadly) ───`

### 1.4 FLOWS SPA fallback

Change `renderFlows(graph)` signature to `renderFlows(graph, analysis?)`.

When `entryPoints.length === 0` (no API routes) AND `analysis` is provided:
- Take top 5 files by `amplificationRatio` from `analysis.risk` as implicit hubs
- Show their cross-module dependencies using the same `→` format
- Section header: `─── FLOWS (entry hubs) ─────────────────────────────────`

Thread `analysis` through from `encodeToStrandFormat`.

### 1.5 Remove hardcoded `moduleDescription()`

Replace the 9-case lookup table with a computed version:
- Find all edges whose `to` path is within the module
- Count inbound edges per file, take top 3 file names (basename without extension)
- Return as comma-joined string

Always correct because derived from the graph, not from path name guessing.

---

## Phase 2 — CLI Changes

**Files:** `src/cli/index.ts` (to be created per existing CLI plan), `package.json`

### 2.1 New commands

**`strand setup [path]`** — recommended first-time command. Runs `generate` then `init` in sequence. Listed first in `--help` under "Quick start".

**`strand update [path]`** — regenerates `.strand` in place. Alias for `generate` with no path (defaults to cwd). Intention-revealing for ongoing use.

**`strand status [path]`** — reports current state without modifying anything:
- Is `.strand` present? How old is it (mtime vs newest source file mtime)?
- Is CLAUDE.md wired (`@.strand` reference present)?
- Is `.strand` in `.gitignore`?
- Summary: `✓ wired | ✓ .strand present (3 days old) | ⚠ may be stale`

### 2.2 `init` improvements

- If CLAUDE.md is absent: create it with a minimal header + the `@.strand` section. Print: `Created CLAUDE.md and wired @.strand`
- Fix idempotency check: use `/^@\.strand$/m.test(existing)` instead of `existing.includes("@.strand")` (prevents false-positives on mentions in comments/code blocks)

### 2.3 Error handling

- Path is a file not a directory → `Error: expected a directory, got a file: <path>`
- No `package.json` at target path → `Warning: no package.json found — are you in the right directory?` (non-fatal, continues)
- EACCES on read/write → surface as `Error: permission denied: <path>`
- Wrap `runGenerate` and `runInit` bodies in try/catch → clean error message with "please report this at <github url>"

### 2.4 `package.json` fixes

```json
{
  "files": ["dist/", "README.md"],
  "engines": { "node": ">=18" },
  "keywords": ["ai", "codebase", "llm", "claude", "claude-code", "context-window", "developer-tools"]
}
```

Move `tsx` from `dependencies` to `devDependencies`.

---

## Phase 3 — Scanner Changes

**Files:** `src/scanner/index.ts`, `src/analyzer/index.ts`, `src/analyzer/graph-utils.ts`, `src/encoder/strand-format-encode.ts`

### 3.1 `domain` field on `StrandNode`

Add `domain?: string` to `StrandNode` interface.

Populate in `walkDir` via a new `detectDomain(filePath, content, frameworkMeta)` function, called after `extractFrameworkMetadata`. Detection strategy (first match wins):

1. **TanStack Router**: content matches `/createFileRoute\(['"]([^'"]+)['"]\)/` → extract first path segment (e.g. `/secrets/detail` → `secrets`)
2. **Next.js route**: `frameworkMeta.routePath` present → extract first segment of the route path
3. **Barrel file**: file is `index.ts/tsx`, and `>50%` of exports are re-exports (`export { X } from './...'`) → domain = parent directory name
4. **Fallback**: `path.split('/')[1]` (second path segment, e.g. `src/components` → `components`)

### 3.2 Dead code detection

Add `deadCode: string[]` to `GraphAnalysis` interface.

In `analyzeGraph()`:
- After building `reverseAdj`, collect nodes where: `!reverseAdj.has(node.id)` AND `type` not in `['route', 'api-route', 'config', 'test']`
- Return as `deadCode: string[]`

In `encodeToStrandFormat()`, add at the end:
```
─── DEAD CODE (N unreachable files) ─────────────────────
src/utils/old-helper.ts
src/lib/unused-service.ts
...
```
Only render if `deadCode.length > 0`. Cap at 10 entries, show `+N more` if longer.

### 3.3 O(N²) fix in `detectModules`

The current entry-point detection:
```typescript
// O(N²): for each module node, scan all other nodes' raw import strings
const entryPoints = groupNodes.filter((n) =>
  nodes.some((other) =>
    !other.path.startsWith(dirPath) &&
    other.imports.some((imp) => imp.includes(n.path.replace(...)))
  )
);
```

Replace with edge-set lookup (O(N)):
```typescript
// Build set of all node IDs that are targets of cross-module edges
const crossModuleTargets = new Set(
  graph.edges
    .filter((e) => !e.from.startsWith(dirPath) && e.to.startsWith(dirPath))
    .map((e) => e.to)
);
const entryPoints = groupNodes.filter((n) => crossModuleTargets.has(n.id));
```

This requires `graph.edges` to be available in `detectModules` — pass it as a parameter.

### 3.4 `StrandEdge.weight` + `Math.max` stack safety

In `resolveEdges`, compute importer counts after all edges are built, then normalize:
```typescript
// After building all edges, update weights
const importerCounts = new Map<string, number>();
for (const e of edges) importerCounts.set(e.to, (importerCounts.get(e.to) || 0) + 1);
for (const e of edges) e.weight = 1 / Math.log(1 + (importerCounts.get(e.to) || 1));
```

In `calculateComplexity`, replace `Math.max(...nodes.map(n => n.lines))`:
```typescript
const maxLines = nodes.reduce((max, n) => Math.max(max, n.lines), 0);
```

---

## Verification

After all phases, re-run `experiments/experiment-5-generalization.ts`.

Expected improvements:
- `roles/types.ts` ranks #1 in RISK (was #5)
- FLOWS section is non-empty for Infisical (was empty)
- Token cost stays within 15% of Exp 5 baseline (~910 tokens)
- No regressions on Q2/Q4 (architecture/complexity questions)

---

## Out of scope (follow-up sessions)

- Experiment 6 (agentic tool-call reduction measurement)
- Coupling metrics (efferent/afferent, instability score)
- Circular dependency detection (DFS with recursion stack)
- `strand watch` command
- `strand doctor` command
- Domain classifier user-configurability
- `DOMAINS` section for SPA route vocabulary
