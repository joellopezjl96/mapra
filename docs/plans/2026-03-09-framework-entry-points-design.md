# Framework Entry Point Detection — Design

**Date:** 2026-03-09
**Priority:** P1
**Depends on:** `998592e feat: framework-aware analysis` (already merged)
**Prior art:** `2026-03-08-framework-aware-analysis.md` (broader design covering test filtering + entry points; test filtering is done, entry points remain)

## Problem Statement

The DEAD CODE section in .strand output has an **84% false positive rate** on large monorepos. Files that are reachable through framework conventions — not static imports — are flagged as unreachable.

### Quantified impact (cal.com: 7,444 files, 906K lines, 34 packages)

| Category | False Positives | Root Cause |
|----------|----------------|------------|
| Next.js pages (`page.tsx`, `layout.tsx`, etc.) | 303/307 | `classifyFile()` returns `component`/`utility` instead of `route` |
| NestJS DI entries (`*.controller.ts`, `*.module.ts`, `*.service.ts`) | 275 | No NestJS detection at all |
| **Total framework FPs** | **~578** | |
| Total dead code reported | ~4,368 | |
| Estimated true dead code | ~700 | After framework FP removal |

### Why 303/307 Next.js pages are misclassified

The scanner's `classifyFile()` only applies Next.js patterns when `framework.name === "nextjs"`. Framework detection reads the **root** `package.json`:

```typescript
function detectFramework(rootDir: string): FrameworkInfo {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf-8"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (deps["next"]) return { name: "nextjs", type: "Next.js", srcDir };
  // ...
}
```

This works for single-package projects. In a monorepo like cal.com:
- The **root** `package.json` is a workspace root — it may or may not list `next` as a dependency
- `next` lives in `apps/web/package.json`, not the root
- If root detection fails, `framework.name === "typescript"` and all Next.js entry point patterns are skipped
- `page.tsx` files fall through to the generic React component check (returns `component`) or the default (returns `utility`)
- `component` and `utility` are not in `SKIP_TYPES`, so they appear in DEAD CODE

Even when the root **does** have `next` (cal.com's root has it as a devDependency), there is a second problem: the scanner walks the **entire** monorepo with a single `FrameworkInfo`. Files in `apps/api/v2/` (a NestJS app) get the "nextjs" framework, and files in `apps/web/` (Next.js) also get "nextjs". This means:
1. NestJS patterns are never checked because the framework is detected as Next.js
2. A monorepo can contain **multiple frameworks simultaneously**

### Why 275 NestJS entries are misclassified

The scanner has **zero awareness of NestJS**. There is no NestJS entry in `detectFramework()` and no NestJS pattern in `classifyFile()`. NestJS files like `*.controller.ts`, `*.module.ts`, and `*.service.ts` are loaded through the dependency injection container at runtime, never through static `import` statements from outside the module. They have zero inbound import edges and are flagged as dead code.

### Why this matters

DEAD CODE is a diagnostic section — false positives reduce trust. But the deeper problem is that **the same misclassification affects RISK and FLOWS**. If `page.tsx` is typed as `component` instead of `route`, it will not appear in the PAGES section. If NestJS controllers are typed as `utility`, they miss any framework-aware rendering. Fixing classification fixes multiple downstream sections.

## Design

### Core insight: per-directory framework detection

The fundamental fix is shifting from **one framework per project** to **one framework per directory subtree**. In a monorepo, `apps/web/` is a Next.js app while `apps/api/v2/` is a NestJS app while `packages/lib/` is plain TypeScript. Each subtree should have its own `FrameworkInfo`.

### Approach: filename-pattern-based entry point detection

Instead of keying entry point detection off a single `FrameworkInfo`, we use **filename and path patterns that are framework-agnostic** where possible, and framework-specific where necessary.

The key observation: Next.js entry points have filenames (`page.tsx`, `layout.tsx`, `route.ts`) that are **globally unambiguous**. No one names a utility file `page.tsx` outside of a file-based routing framework. Similarly, NestJS files follow a naming convention (`*.controller.ts`, `*.module.ts`) that is distinctive.

This means we can detect most framework entry points **without knowing the framework**, by matching filename patterns alone. Framework detection then becomes a refinement rather than a prerequisite.

### 1. Entry point pattern registry

A new constant `ENTRY_POINT_PATTERNS` that maps filename/path patterns to node types. These patterns fire regardless of the detected framework:

```typescript
interface EntryPointPattern {
  /** Regex tested against the normalized relative file path */
  match: RegExp;
  /** Node type to assign */
  type: StrandNode["type"];
  /** Human-readable description for debugging */
  description: string;
  /** Optional: only fire if this framework is detected OR if framework is unknown */
  frameworks?: string[];
}

const ENTRY_POINT_PATTERNS: EntryPointPattern[] = [
  // ── Next.js App Router ──
  {
    match: /\/page\.(tsx|jsx|ts|js)$/,
    type: "route",
    description: "Next.js page",
  },
  {
    match: /\/layout\.(tsx|jsx|ts|js)$/,
    type: "layout",
    description: "Next.js layout",
  },
  {
    match: /\/(loading|error|not-found|template|default|global-error)\.(tsx|jsx|ts|js)$/,
    type: "route",
    description: "Next.js special page",
  },
  {
    match: /\/api\/.*route\.(ts|js)$/,
    type: "api-route",
    description: "Next.js API route",
  },
  {
    match: /middleware\.(ts|js)$/,
    type: "middleware",
    description: "Next.js middleware",
  },

  // ── Next.js Pages Router (legacy) ──
  {
    match: /\/pages\/(?!api\/).*\.(tsx|jsx|ts|js)$/,
    type: "route",
    description: "Next.js Pages Router page",
    frameworks: ["nextjs"],
  },
  {
    match: /\/pages\/api\/.*\.(ts|js)$/,
    type: "api-route",
    description: "Next.js Pages Router API route",
    frameworks: ["nextjs"],
  },

  // ── NestJS ──
  {
    match: /\.controller\.(ts|js)$/,
    type: "route",
    description: "NestJS controller",
  },
  {
    match: /\.module\.(ts|js)$/,
    type: "config",
    description: "NestJS module",
  },
  {
    match: /\.service\.(ts|js)$/,
    type: "utility",  // services ARE imported — see discussion below
    description: "NestJS service",
  },
  {
    match: /\.guard\.(ts|js)$/,
    type: "middleware",
    description: "NestJS guard",
  },
  {
    match: /\.interceptor\.(ts|js)$/,
    type: "middleware",
    description: "NestJS interceptor",
  },
  {
    match: /\.pipe\.(ts|js)$/,
    type: "middleware",
    description: "NestJS pipe",
  },
  {
    match: /\.filter\.(ts|js)$/,
    type: "middleware",
    description: "NestJS exception filter",
  },
  {
    match: /\.decorator\.(ts|js)$/,
    type: "utility",
    description: "NestJS custom decorator",
  },
  {
    match: /main\.(ts|js)$/,
    type: "route",
    description: "NestJS/Node.js entry point",
    frameworks: ["nestjs", "express", "unknown"],
  },

  // ── Remix ──
  {
    match: /\/routes\/.*\.(tsx|jsx|ts|js)$/,
    type: "route",
    description: "Remix route",
    frameworks: ["remix"],
  },

  // ── SvelteKit ──
  // Note: .svelte files are not currently scanned (isSourceFile gate).
  // These patterns cover the TS/JS companion files.
  {
    match: /\+page\.server\.(ts|js)$/,
    type: "route",
    description: "SvelteKit page server",
    frameworks: ["svelte"],
  },
  {
    match: /\+page\.(ts|js)$/,
    type: "route",
    description: "SvelteKit page load",
    frameworks: ["svelte"],
  },
  {
    match: /\+layout\.server\.(ts|js)$/,
    type: "layout",
    description: "SvelteKit layout server",
    frameworks: ["svelte"],
  },
  {
    match: /\+layout\.(ts|js)$/,
    type: "layout",
    description: "SvelteKit layout load",
    frameworks: ["svelte"],
  },
  {
    match: /\+server\.(ts|js)$/,
    type: "api-route",
    description: "SvelteKit server route",
    frameworks: ["svelte"],
  },

  // ── Nuxt ──
  {
    match: /\/server\/(api|routes)\/.*\.(ts|js)$/,
    type: "api-route",
    description: "Nuxt server route",
    frameworks: ["nuxt", "vue"],
  },

  // ── Astro ──
  // .astro and .md/.mdx files not scanned. Only covers TS/JS API routes.
  {
    match: /\/src\/pages\/.*\.(ts|js)$/,
    type: "api-route",
    description: "Astro API endpoint",
    frameworks: ["astro"],
  },

  // ── Generic patterns ──
  {
    match: /\/scripts\/[^/]+\.(ts|js)$/,
    type: "config",
    description: "Build/CLI script",
  },
];
```

### 2. NestJS classification — nuance on services

NestJS `*.service.ts` files require special handling. Unlike controllers (which are HTTP entry points) and modules (which are DI container configuration), services ARE typically imported by their module files and by other services. The DI container resolves them, but the `*.module.ts` file explicitly references them in the `providers` array.

However, because the scanner cannot resolve workspace aliases (the P0 bug), these cross-package imports from `*.module.ts` to `*.service.ts` are invisible. The service appears to have zero inbound edges even though the module file imports it.

**Decision:** Classify `*.service.ts` as `utility` (default, accurate) but add them to a new `DI_ENTRY_PATTERNS` set that the dead code filter treats as entry points. This way:
- Services are correctly typed as `utility` (they provide utility logic)
- But they are excluded from DEAD CODE because they are DI-managed entry points
- Controllers get type `route` (they handle HTTP requests)
- Modules get type `config` (they configure the DI container)

### 3. New node types vs. reusing existing types

The existing type union is:

```typescript
type: "module" | "file" | "route" | "api-route" | "component" | "layout"
    | "middleware" | "schema" | "test" | "config" | "utility"
```

Rather than adding new types like `"controller"` or `"nest-module"`, we map NestJS concepts onto existing types:

| NestJS concept | Mapped type | Rationale |
|----------------|-------------|-----------|
| Controller | `route` | Handles HTTP requests, analogous to Next.js pages |
| Module | `config` | Configuration file, analogous to `tsconfig.json` |
| Guard | `middleware` | Request-level middleware |
| Interceptor | `middleware` | Request-level middleware |
| Pipe | `middleware` | Request-level transformation |
| Filter | `middleware` | Exception handling middleware |
| Service | `utility` | Business logic (but excluded from dead code via DI pattern) |
| Decorator | `utility` | Utility function |

This avoids expanding the type union and keeps the `.strand` output format stable.

### 4. Where to implement: scanner `classifyFile()`

The primary change is in `classifyFile()`. Currently it has a cascade of if-statements:

```
1. Test files       → "test"
2. Config files     → "config"
3. Prisma schema    → "schema"
4. Next.js specific → "route" / "api-route" / "layout" / "middleware"  (only if framework === "nextjs")
5. React components → "component"
6. Default          → "utility"
```

The proposed change replaces step 4 with pattern matching against `ENTRY_POINT_PATTERNS`:

```
1. Test files                → "test"
2. Config files              → "config"
3. Prisma schema             → "schema"
4. ENTRY_POINT_PATTERNS scan → type from matched pattern (framework-gated or universal)
5. React components          → "component"
6. Default                   → "utility"
```

The ENTRY_POINT_PATTERNS scan iterates through patterns. Patterns without a `frameworks` constraint fire unconditionally. Patterns with a `frameworks` constraint only fire if the detected framework matches.

### 5. Monorepo-aware framework detection

To properly support monorepos, `detectFramework()` needs to detect frameworks in nested `package.json` files. The proposed approach:

**Option A: Walk up from each file to find nearest `package.json`**

For each file being classified, walk up the directory tree to find the nearest `package.json`. Use its dependencies to detect the framework. This is accurate but expensive (filesystem reads per file).

**Option B: Pre-scan workspace packages at startup**

At scan time, find all `package.json` files in the project (excluding `node_modules`). For each one, detect its framework. Build a map from directory path to `FrameworkInfo`. When classifying a file, find the most specific (deepest) matching directory.

**Option C: Rely on filename patterns, skip per-directory framework detection**

Since we're moving to `ENTRY_POINT_PATTERNS` that mostly fire unconditionally (Next.js patterns like `page.tsx` are globally unambiguous), we can keep the single-framework detection for the `frameworks` gate and rely on pattern names for everything else.

**Recommendation: Option C, with Option B as a follow-up.**

Option C is simple, requires minimal change, and solves the 303/307 FP problem immediately. The Next.js patterns (`page.tsx`, `layout.tsx`, `route.ts`, etc.) are unambiguous enough to fire without a framework gate. NestJS patterns (`*.controller.ts`, `*.module.ts`) are similarly distinctive.

Option B is the correct long-term solution for frameworks where filename patterns overlap with non-framework files (e.g., Remix `routes/*.tsx` could conflict with a custom `routes/` directory in a non-Remix project). But this is a refinement, not a blocker.

### 6. Dead code filter expansion

The analyzer's `SKIP_TYPES` set already excludes framework types:

```typescript
const SKIP_TYPES = new Set<StrandNode["type"]>([
  "route", "api-route", "config", "test", "layout", "middleware",
]);
```

With the scanner changes, NestJS controllers (`route`), modules (`config`), guards/interceptors/pipes/filters (`middleware`) will be automatically excluded.

For NestJS services (typed as `utility`), we add a **secondary exclusion** based on filename pattern:

```typescript
// Files that are DI-managed entry points — typed as utility but not dead code
const DI_ENTRY_PATTERNS = [
  /\.service\.(ts|js)$/,
  /\.repository\.(ts|js)$/,
  /\.resolver\.(ts|js)$/,     // GraphQL resolvers
  /\.gateway\.(ts|js)$/,      // WebSocket gateways
  /\.subscriber\.(ts|js)$/,   // Event subscribers
];

const deadCode = graph.nodes
  .filter(
    (n) =>
      !SKIP_TYPES.has(n.type) &&
      !reverseAdj.has(n.id) &&
      !DI_ENTRY_PATTERNS.some(re => re.test(n.id)),
  )
  .map((n) => n.id);
```

This approach keeps services correctly typed as `utility` (they ARE utility code) while preventing them from appearing in dead code.

### 7. Framework metadata enrichment

The existing `extractFrameworkMetadata()` function only handles Next.js. Extend it to produce metadata for NestJS files:

```typescript
// NestJS controller metadata
if (/\.controller\.(ts|js)$/.test(relativePath)) {
  const methods: string[] = [];
  if (/@Get\(/.test(content)) methods.push("GET");
  if (/@Post\(/.test(content)) methods.push("POST");
  if (/@Put\(/.test(content)) methods.push("PUT");
  if (/@Patch\(/.test(content)) methods.push("PATCH");
  if (/@Delete\(/.test(content)) methods.push("DELETE");

  const routeMatch = content.match(/@Controller\s*\(\s*['"]([^'"]*)['"]\s*\)/);
  const routePath = routeMatch?.[1] ?? "";

  return {
    type: "nestjs-controller",
    metadata: { methods, routePath },
  };
}

// NestJS module metadata
if (/\.module\.(ts|js)$/.test(relativePath)) {
  const imports: string[] = [];
  // Extract imported modules from @Module({ imports: [...] })
  const moduleMatch = content.match(/@Module\s*\(\s*\{[\s\S]*?imports\s*:\s*\[([\s\S]*?)\]/);
  if (moduleMatch?.[1]) {
    const importNames = moduleMatch[1].match(/\b[A-Z]\w+Module\b/g) ?? [];
    imports.push(...importNames);
  }
  return {
    type: "nestjs-module",
    metadata: { imports },
  };
}
```

This enables future rendering of NestJS-specific sections (e.g., an API ROUTES section that includes NestJS controllers alongside Next.js API routes).

## Edge Cases

### Files that look like entry points but aren't

| Pattern | False positive scenario | Mitigation |
|---------|------------------------|------------|
| `page.tsx` | A file named `page.tsx` in a utility package | Extremely unlikely in practice. No one names utils `page.tsx`. |
| `*.controller.ts` | A file in a non-NestJS project named `auth.controller.ts` | Could happen. The file would be typed as `route` — slightly wrong but harmless since it would be excluded from dead code either way (it likely has inbound edges). |
| `*.module.ts` | Angular's `*.module.ts` files | Angular uses the same naming convention. The `config` type is reasonable for Angular modules too. |
| `*.service.ts` | A file named `data.service.ts` in a non-DI project | Would stay as `utility` type (correct). The DI_ENTRY_PATTERNS exclusion from dead code is a minor false negative — the file might genuinely be dead. Acceptable trade-off given the 275 FP reduction. |
| `routes/*.tsx` (Remix) | A non-Remix project with a `routes/` directory | Gated behind `frameworks: ["remix"]` — only fires when Remix is detected. |
| `main.ts` | A test helper or utility named `main.ts` | Gated behind `frameworks: ["nestjs", "express", "unknown"]`. In most cases, `main.ts` at project root IS an entry point. |

### Files that are entry points but don't match patterns

| Entry point type | Why it's missed | Impact |
|------------------|-----------------|--------|
| Dynamic `import()` targets | No static import edge, no filename convention | Appears in dead code. Low volume — most dynamic imports are for code splitting, not dead code. |
| Webpack/Vite entry points | Configured in build tool config, not filename-based | Could add `entry` in `webpack.config.ts` parsing, but scope creep. User-configurable entry points (from prior design doc) cover this. |
| CLI scripts (`bin/` field in package.json) | Loaded by npm, not imported | `scripts/*.ts` pattern catches most cases. `bin/` field parsing is a future enhancement. |
| Storybook stories (`*.stories.tsx`) | Loaded by Storybook, not imported | Already covered by test patterns or could add a pattern. Low priority — stories are not production code. |
| Next.js `instrumentation.ts` | New convention in Next.js 15 | Add to Next.js patterns. |
| Next.js `opengraph-image.tsx`, `icon.tsx` | File-based metadata convention | Add to Next.js patterns. |

### Monorepo-specific edge cases

| Scenario | Behavior | Acceptable? |
|----------|----------|-------------|
| Monorepo with both Next.js and NestJS | Both pattern sets fire unconditionally | Yes — patterns are non-overlapping |
| Monorepo where only some packages are Next.js | `page.tsx` in non-Next.js packages gets typed as `route` | Acceptable — no one names non-route files `page.tsx` |
| Monorepo with workspace alias imports (`@calcom/lib`) | Aliases still unresolved (separate P0 bug) | This design doesn't fix workspace aliases — that's a different problem |
| Nested monorepo (workspace inside workspace) | Framework detection reads root `package.json` only | With Option C, this is fine — patterns don't depend on framework detection |

## Impact Analysis

### Sections affected

| Section | Impact | Details |
|---------|--------|---------|
| **DEAD CODE** | Major improvement | ~578 fewer false positives (303 Next.js + 275 NestJS) |
| **PAGES** | Improvement | Pages that were `component` type now correctly `route` — appear in PAGES section |
| **API ROUTES** | Improvement | NestJS controllers appear alongside Next.js API routes |
| **RISK** | Minor | Better classification means more accurate blast radius computation |
| **FLOWS** | Minor | Controllers typed as `route` participate in flow detection |
| **MOST IMPORTED** | None | Already filters by edge count, not node type |
| **HOTSPOTS** | None | Uses complexity scores, not node type |
| **CHURN** | None | Uses git history, not node type |
| **CONVENTIONS** | None | Uses import patterns, not node type |

### Token cost impact

**Zero increase.** These changes reclassify existing nodes and filter out false positives. No new sections or data are added. The DEAD CODE section may actually shrink (fewer entries to list).

## Testing Strategy

### Unit tests (scanner)

Add to `src/scanner/__tests__/classify.test.ts`:

```typescript
describe("classifyFile — NestJS entry points", () => {
  it("classifies *.controller.ts as route", () => {
    // scaffoldAndScan with NestJS deps in package.json
    // Verify type === "route"
  });

  it("classifies *.module.ts as config", () => { /* ... */ });
  it("classifies *.guard.ts as middleware", () => { /* ... */ });
  it("classifies *.interceptor.ts as middleware", () => { /* ... */ });
  it("classifies *.pipe.ts as middleware", () => { /* ... */ });
  it("classifies *.filter.ts as middleware", () => { /* ... */ });
  it("classifies *.service.ts as utility", () => { /* ... */ });
});

describe("classifyFile — framework-agnostic patterns", () => {
  it("classifies page.tsx as route even without Next.js detected", () => {
    // scaffoldAndScan WITHOUT next in package.json
    // Verify page.tsx is still typed as "route"
  });

  it("classifies controller.ts as route in a monorepo", () => {
    // scaffoldAndScan with mixed monorepo structure
    // apps/web/app/page.tsx → route
    // apps/api/src/bookings.controller.ts → route
  });
});
```

### Unit tests (analyzer)

Add to `src/analyzer/__tests__/dead-code.test.ts` (new file):

```typescript
describe("dead code — DI entry point exclusion", () => {
  it("excludes *.service.ts from dead code", () => {
    // Build graph with service.ts that has no inbound edges
    // Verify it does NOT appear in deadCode
  });

  it("excludes *.repository.ts from dead code", () => { /* ... */ });

  it("still flags genuinely dead utility files", () => {
    // Build graph with unused-helper.ts that has no inbound edges
    // Verify it DOES appear in deadCode
  });
});
```

### Integration test

Run strand on a scaffold with mixed Next.js + NestJS structure:

```
apps/
  web/
    package.json  (has "next")
    app/
      page.tsx
      layout.tsx
      dashboard/page.tsx
      api/users/route.ts
  api/
    package.json  (has "@nestjs/core")
    src/
      bookings/
        bookings.controller.ts
        bookings.service.ts
        bookings.module.ts
      app.module.ts
      main.ts
packages/
  lib/
    unused-helper.ts  (genuinely dead)
```

Verify:
- All `page.tsx` files typed as `route`
- `layout.tsx` typed as `layout`
- `route.ts` typed as `api-route`
- `bookings.controller.ts` typed as `route`
- `bookings.module.ts` typed as `config`
- `bookings.service.ts` typed as `utility` but NOT in dead code
- `unused-helper.ts` IS in dead code
- Dead code count reduced significantly

### Regression test on cal.com

Regenerate cal.com `.strand` and verify:
- Dead code drops from ~4,368 to <3,800 (at least 578 fewer FPs)
- PAGES section shows more pages
- RISK is unaffected (test filter already working)
- No new false negatives introduced on strand's own codebase

## Alternatives Considered

### A. Add `"controller"`, `"service"`, `"nest-module"` to the type union

**Rejected.** Expanding the type union ripples through the entire codebase — every switch/map on `StrandNode["type"]` needs updating. The SKIP_TYPES set, encoder rendering functions, and batch runner all branch on type. The benefit (more precise types) does not justify the implementation cost. Reusing existing types with semantic overlap is simpler.

### B. Per-file framework detection (read nearest `package.json` for each file)

**Rejected for now.** Would be the most accurate approach but requires significant refactoring of the scanner (currently does one `walkDir` pass with a single `FrameworkInfo`). The cost is high and the benefit is marginal — filename-based patterns solve 95%+ of cases without per-file detection.

**Revisit when:** Remix or Nuxt monorepos are tested and their patterns create false positives in non-framework subtrees.

### C. User-configurable entry points only (no built-in patterns)

**Rejected.** Requires every NestJS/Remix/Nuxt user to configure their own patterns. The whole point of framework detection is zero-config accuracy. Built-in patterns should handle the common case; user config handles the long tail.

### D. Move dead code detection to the encoder instead of the analyzer

**Rejected.** The analyzer is the correct layer for dead code detection — it has access to the full graph and reverse adjacency. The encoder should only render what the analyzer computes. Putting heuristics in the encoder creates a maintenance burden (two places to understand dead code logic).

## Summary of Changes

| File | Change |
|------|--------|
| `src/scanner/index.ts` | Refactor `classifyFile()` to use `ENTRY_POINT_PATTERNS` registry; add NestJS patterns; make Next.js patterns framework-agnostic; add NestJS metadata to `extractFrameworkMetadata()` |
| `src/analyzer/index.ts` | Add `DI_ENTRY_PATTERNS` exclusion to dead code filter |
| `src/scanner/__tests__/classify.test.ts` | Add NestJS classification tests; add framework-agnostic pattern tests |
| New: `src/analyzer/__tests__/dead-code.test.ts` | Tests for DI entry point exclusion from dead code |

Estimated scope: ~6 hours implementation + testing. No new dependencies. No token cost increase.
