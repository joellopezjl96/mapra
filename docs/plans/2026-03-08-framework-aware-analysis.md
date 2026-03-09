# Framework-Aware Analysis — Design

## Problem

strand's RISK and DEAD CODE sections produce significant false positives on
framework-heavy codebases. The root cause: strand builds an import graph and
uses inbound-edge reachability to determine dead code and blast radius. This
misses two classes of files that are "alive" through non-import mechanisms:

1. **Framework entry points** — files loaded by convention, not by import
   statements (Next.js pages, SvelteKit routes, middleware, etc.)
2. **Test infrastructure** — files that are high-connectivity within the test
   subgraph but irrelevant to production risk

### Concrete evidence (cal.com smoke test, 906K lines, 7,444 files)

**DEAD CODE false positives:**
- 436 Next.js `page.tsx` / `route.ts` / `layout.tsx` files flagged as
  unreachable — they are framework entry points loaded by file-based routing
- 100 test files also flagged (e.g., `.e2e.ts`, files under `playwright/`)
- Total dead code count: 4,368/7,444 (58%). Real dead code is a fraction of
  that; most are framework-convention files or test infra

**RISK false positives:**
- Top 8 RISK entries are Playwright test helpers with amp 91-94
  (e.g., `playwright/lib/fixtures.ts` imported by 86 test files)
- Production risks like `RegularBookingService.ts` (3,088L, 108 imports)
  are buried below test infrastructure
- MOST IMPORTED top entry is `playwright/lib/fixtures.ts` (x86)

### Why this matters

RISK is strand's moat — the analysis that no other tool provides. If the top 8
entries are test helpers instead of production amplifiers, the section loses
credibility and the LLM gets misleading context about what's actually risky to
change.

## Prior art

The `2026-03-07-entry-points-test-filter-design.md` doc proposed a minimal fix:
classify more Next.js files as entry points and filter `type: "test"` nodes
from RISK/MOST IMPORTED in the encoder. This doc supersedes that with a broader,
multi-framework, configurable approach.

## Goals

1. **Eliminate dead code false positives for framework entry points** across
   Next.js, SvelteKit, Nuxt, Remix, and Astro (file-based routing frameworks)
2. **Separate test infrastructure from production risk** in RISK and MOST
   IMPORTED, so top entries reflect actual production blast radius
3. **Make entry point detection configurable** so users with custom conventions
   (e.g., `scripts/*.ts` as CLI entry points, or `workers/*.ts` as Cloudflare
   Workers) can declare their own patterns
4. **Preserve test infrastructure visibility** — don't hide it, but present it
   in a way that doesn't drown out production signals
5. **Zero new dependencies, minimal token cost increase** in .strand output

### Success criteria

- cal.com dead code drops from ~4,368 to <3,900 (eliminating ~500+ framework
  entry point false positives)
- cal.com RISK top 8 contains zero test files
- strand's own .strand is unaffected (no false negatives introduced)
- User can add `entryPoints: ["scripts/*.ts"]` to config and those files are
  excluded from dead code

## Design

### 1. Framework entry point detection (scanner)

**File:** `src/scanner/index.ts`, function `classifyFile()` (line 261)

The scanner already classifies `page.tsx`, `route.ts`, `layout.tsx`, and
`middleware.ts` for Next.js. Extend this in two ways:

#### a) More Next.js special files

Add `loading.tsx`, `error.tsx`, `not-found.tsx`, `template.tsx`,
`default.tsx`, `global-error.tsx` as type `"route"`. These are all App Router
convention files that the framework loads automatically.

```
Current regex (line 291):
  if (/\/page\.(tsx|jsx|ts|js)$/.test(normalized)) return "route";

Proposed:
  if (/\/(page|loading|error|not-found|template|default|global-error)\.(tsx|jsx|ts|js)$/.test(normalized)) return "route";
```

#### b) Multi-framework entry points

Add pattern sets for other file-based routing frameworks. Detection is keyed
off `framework.name` (already detected from `package.json` dependencies).

| Framework  | Dependency key | Entry point patterns |
|------------|----------------|----------------------|
| Next.js    | `next`         | `page.tsx`, `route.ts`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `template.tsx`, `default.tsx`, `global-error.tsx`, `middleware.ts` |
| SvelteKit  | `@sveltejs/kit` | `+page.svelte`, `+page.ts`, `+page.server.ts`, `+layout.svelte`, `+layout.ts`, `+layout.server.ts`, `+server.ts`, `+error.svelte` |
| Nuxt       | `nuxt`         | Files under `pages/`, `server/api/`, `server/routes/`, `middleware/`, `layouts/` |
| Remix      | `@remix-run/*` | Files under `app/routes/` matching `*.tsx` |
| Astro      | `astro`        | Files under `src/pages/` matching `*.astro`, `*.md`, `*.mdx` |

**Implementation approach:** Add a `FRAMEWORK_ENTRY_PATTERNS` map keyed by
framework name. Each value is an array of regex patterns. `classifyFile()`
checks the relevant patterns for the detected framework.

For Nuxt and Remix, detection is directory-based rather than filename-based,
so the patterns are path prefixes (e.g., `/^pages\//`).

**Where:** `src/scanner/index.ts` — new constant + `classifyFile()` expansion

### 2. Test file detection (scanner)

**File:** `src/scanner/index.ts`, function `classifyFile()` (line 269)

The current test detection catches `*.test.ts`, `*.spec.ts`, and files in
`__tests__/`. It misses:

- `.e2e.ts`, `.e2e-spec.ts` — Playwright/Cypress e2e test files
- Files under `playwright/`, `cypress/`, `test/`, `tests/`, `e2e/` directories
- Test setup/fixtures that don't match `*.test.*` (e.g., `fixtures.ts` inside
  a `playwright/` directory)

**Proposed regex:**

```typescript
// Test files
if (
  /\.(test|spec|e2e-spec|e2e)\.(ts|tsx|js|jsx)$/.test(normalized) ||
  normalized.includes("__tests__/") ||
  /^(playwright|cypress|test|tests|e2e)\//.test(normalized) ||
  /\/(playwright|cypress|test|tests|e2e)\//.test(normalized)
) {
  return "test";
}
```

This catches:
- `playwright/lib/fixtures.ts` (directory-based)
- `apps/web/playwright/fixtures.ts` (nested directory)
- `src/bookings.e2e.ts` (extension-based)
- `src/bookings.e2e-spec.ts` (extension-based)

**Risk:** Overly broad directory matching could catch non-test files in a
directory named `test/`. Mitigation: only TS/JS source files pass the
`isSourceFile()` gate, so stray data files in test dirs are already excluded.

### 3. Dead code handling (analyzer)

**File:** `src/analyzer/index.ts`, line 41-50

The analyzer already skips `"route"`, `"api-route"`, `"config"`, `"test"`,
`"layout"`, and `"middleware"` from dead code. This is the `SKIP_TYPES` set.

With the scanner changes in (1) and (2), more files will be correctly
classified into these types, so **no analyzer changes are needed** for the
basic case. The existing `SKIP_TYPES` filter already does the right thing —
the problem was misclassification upstream.

However, for user-defined entry points (section 5 below), the analyzer needs
to accept an additional set of "known entry point" file patterns and exclude
matching files from dead code.

**Proposed change:**

```typescript
export function analyzeGraph(
  graph: StrandGraph,
  rootDir?: string,
  options?: { entryPointPatterns?: string[] },
): GraphAnalysis {
  // ... existing code ...

  // Dead code: files with no inbound edges (not routes, configs, or tests)
  const SKIP_TYPES = new Set<StrandNode["type"]>([
    "route", "api-route", "config", "test", "layout", "middleware",
  ]);

  // Build user entry point matchers
  const entryMatchers = (options?.entryPointPatterns ?? []).map(
    pattern => globToRegex(pattern),
  );

  const deadCode = graph.nodes
    .filter(
      (n) =>
        !SKIP_TYPES.has(n.type) &&
        !reverseAdj.has(n.id) &&
        !entryMatchers.some(re => re.test(n.id)),
    )
    .map((n) => n.id);
```

A minimal `globToRegex()` utility converts patterns like `scripts/*.ts` to
`/^scripts\/[^/]*\.ts$/`. This is a small helper function, not a full glob
library.

### 4. RISK and MOST IMPORTED handling (encoder)

**File:** `src/encoder/strand-format-encode.ts`

#### a) Filter test nodes from RISK (line 120, `renderRisk()`)

Before slicing the top 8, filter out nodes where `graph.nodes` has
`type === "test"`:

```typescript
function renderRisk(graph: StrandGraph, analysis: GraphAnalysis): string {
  const testNodeIds = new Set(
    graph.nodes.filter(n => n.type === "test").map(n => n.id),
  );
  const filtered = analysis.risk.filter(r => !testNodeIds.has(r.nodeId));
  const top = filtered.slice(0, 8);
  // ... rest unchanged
```

#### b) Filter test nodes from MOST IMPORTED (line 310, `renderMostImported()`)

Skip test targets when counting imports:

```typescript
function renderMostImported(graph: StrandGraph): string {
  const testNodeIds = new Set(
    graph.nodes.filter(n => n.type === "test").map(n => n.id),
  );
  const edgeCounts = new Map<string, number>();
  for (const edge of graph.edges) {
    if (testNodeIds.has(edge.to)) continue;  // skip test targets
    edgeCounts.set(edge.to, (edgeCounts.get(edge.to) || 0) + 1);
  }
  // ... rest unchanged
```

#### c) Exclude test-only edges from blast radius computation

Currently `buildReverseAdjacency` excludes edges with `type === "tests"` (the
edge type set in `resolveEdges()` when the importing file is a test).
This already prevents test files from inflating the blast radius of production
files they test.

However, edges *between* test files use `type: "imports"` (e.g.,
`booking.e2e.ts` imports `playwright/fixtures.ts`). These edges inflate the
blast radius of test utilities like `fixtures.ts`.

**Fix:** In `buildReverseAdjacency`, also exclude edges where the *source*
node is a test file. This requires passing the node type map:

```typescript
export function buildReverseAdjacency(
  edges: StrandEdge[],
  excludeTestEdges = false,
  testNodeIds?: Set<string>,
): Map<string, Set<string>> {
  const rev = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (excludeTestEdges && edge.type === "tests") continue;
    if (testNodeIds && testNodeIds.has(edge.from)) continue;  // test→anything
    if (!rev.has(edge.to)) rev.set(edge.to, new Set());
    rev.get(edge.to)!.add(edge.from);
  }
  return rev;
}
```

Update `analyzeGraph()` to pass the test node IDs:

```typescript
const testNodeIds = new Set(
  graph.nodes.filter(n => n.type === "test").map(n => n.id),
);
const reverseAdj = buildReverseAdjacency(graph.edges, true, testNodeIds);
```

This ensures `playwright/fixtures.ts` has a blast radius computed only from
production importers, not from the 86 e2e test files that import it.

### 5. User-configurable entry point patterns

**File:** `src/cli/index.ts`, `src/analyzer/index.ts`

Users can declare custom entry point patterns in their `package.json` under a
`strnd` key:

```json
{
  "strnd": {
    "entryPoints": [
      "scripts/*.ts",
      "workers/**/*.ts",
      "src/lambdas/*/handler.ts"
    ]
  }
}
```

**Flow:**
1. `scanCodebase()` reads `package.json` and extracts `strnd.entryPoints`
2. Passes them through to `analyzeGraph()` via the new `options` parameter
3. `analyzeGraph()` compiles them to regexes and uses them in the dead code
   filter (see section 3)

**Why `package.json`:** It already exists in every project, is already read by
the scanner for framework detection, and doesn't require a new config file.

**Alternative considered:** A `.strandrc.json` or `strand.config.ts` file.
Rejected because it adds a new file to the project and increases adoption
friction. `package.json` is the standard location for tool config in the
JS/TS ecosystem.

## Implementation plan

### Task 1: Extend test file detection in scanner
- **Modify:** `src/scanner/index.ts` — `classifyFile()` (lines 269-273)
- **New test:** `src/scanner/__tests__/classify.test.ts`
- Add `.e2e.ts`, `.e2e-spec.ts` extensions
- Add `playwright/`, `cypress/`, `test/`, `tests/`, `e2e/` directory patterns
- Scope: small (1-2 hours)

### Task 2: Extend Next.js entry point patterns in scanner
- **Modify:** `src/scanner/index.ts` — `classifyFile()` (lines 288-293)
- **Extend test:** `src/scanner/__tests__/classify.test.ts`
- Add `loading`, `error`, `not-found`, `template`, `default`, `global-error`
- Scope: small (30 min)

### Task 3: Filter test nodes from RISK and MOST IMPORTED
- **Modify:** `src/encoder/strand-format-encode.ts` — `renderRisk()` (line 120),
  `renderMostImported()` (line 310)
- **New test:** `src/encoder/__tests__/test-filter.test.ts`
- Scope: small (1 hour)

### Task 4: Exclude test-sourced edges from blast radius
- **Modify:** `src/analyzer/graph-utils.ts` — `buildReverseAdjacency()` (line 12)
- **Modify:** `src/analyzer/index.ts` — `analyzeGraph()` (line 28)
- **Extend test:** `src/analyzer/__tests__/blast-radius.test.ts`
- Scope: small (1 hour)

### Task 5: Add multi-framework entry point patterns
- **Modify:** `src/scanner/index.ts` — new `FRAMEWORK_ENTRY_PATTERNS` constant,
  `classifyFile()`, `detectFramework()`
- **Extend test:** `src/scanner/__tests__/classify.test.ts`
- Add SvelteKit, Nuxt, Remix, Astro patterns
- Scope: medium (2-3 hours, needs research on each framework's conventions)

### Task 6: Add user-configurable entry points
- **Modify:** `src/scanner/index.ts` — read `strnd.entryPoints` from
  `package.json`
- **Modify:** `src/analyzer/index.ts` — accept `entryPointPatterns` option
- **New utility:** `src/analyzer/glob-utils.ts` — `globToRegex()` helper
- **New test:** `src/analyzer/__tests__/entry-points.test.ts`
- Scope: medium (2 hours)

### Task 7: Verify on cal.com
- Regenerate cal.com .strand with all fixes applied
- Verify RISK top 8 are production files
- Verify dead code count is significantly reduced
- Scope: small (30 min)

### Task dependency graph

```
Task 1 (test detection) ──┐
                           ├──→ Task 3 (encoder filter) ──→ Task 4 (blast radius) ──→ Task 7 (verify)
Task 2 (Next.js entries) ─┘
                                                             Task 5 (multi-framework) ─→ Task 7
                                                             Task 6 (user config) ──────→ Task 7
```

Tasks 1+2 are independent and can be done in parallel. Task 3 depends on 1+2
(encoder filters by `type === "test"`, which requires correct classification).
Task 4 depends on 3 (same test node set). Tasks 5 and 6 are independent
extensions. Task 7 verifies everything together.

**Recommended ship order:** Tasks 1+2 → 3 → 4 (one PR). Then 5 and 6 as
separate follow-up PRs.

## Trade-offs

### What this solves
- Framework entry point false positives in DEAD CODE (Next.js, SvelteKit, etc.)
- Test infrastructure dominating RISK and MOST IMPORTED
- User ability to declare custom entry points for non-framework patterns

### What this does NOT solve
- **Non-JS/TS frameworks.** Python (Django/Flask), Ruby (Rails), Go, Java
  (Spring) entry points are not covered. strand only scans TS/JS today.
- **Dynamic imports.** `import()` expressions and `require()` with variable
  paths are not resolved by the scanner. Files loaded only via dynamic import
  will still appear as dead code.
- **Re-exports through barrel files.** A file re-exported from `index.ts`
  but never consumed downstream is still "dead" from the import graph
  perspective, even though it's a public API surface.
- **Monorepo cross-package imports.** In workspaces, package A importing from
  package B via its npm name (not relative path) creates unresolved edges. This
  is a pre-existing scanner limitation, not introduced by this change.
- **Test helpers that are also used in production.** If `test-utils.ts` is
  imported by both test files and production files, it will still appear in
  RISK (correctly — it has production blast radius).

### Edge cases
- **`test` as a legitimate directory name.** A project with `src/test/` meaning
  "test management feature" (not test infrastructure) would have those files
  misclassified. Mitigation: the directory patterns only trigger for top-level
  or well-known testing directories (`playwright/`, `cypress/`, `e2e/`).
  Generic `test/` matching could be gated behind framework detection (only
  when test runner deps like `vitest`, `jest`, `playwright` are present).
- **SvelteKit `+page.svelte` not being a TS/JS file.** Currently `isSourceFile()`
  only matches `.ts/.tsx/.js/.jsx/.mjs/.cjs/.prisma`. `.svelte` files are not
  scanned. SvelteKit support requires adding `.svelte` to `isSourceFile()`.
  This is a prerequisite for Task 5's SvelteKit patterns.

## Cost

**Overall scope: medium** (roughly 8-12 hours of implementation + testing)

- Tasks 1-4 (core fix): small — ~4 hours, one PR
- Task 5 (multi-framework): medium — ~3 hours, needs framework research
- Task 6 (user config): medium — ~2 hours, new API surface

Token cost impact on .strand output: **zero increase.** These changes filter
and reclassify existing data — they don't add new sections.
