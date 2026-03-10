# Strand Backlog

Improvement tasks derived from experiments and validation.
Status: `todo` | `in-progress` | `done`

---

## CO-CHANGE: Filter noise pairs

**Status:** todo
**Priority:** P1
**Effort:** Small (1-2 hours)
**Confidence:** High — straightforward filtering

**Problem:** CO-CHANGE surfaces trivial pairs (`package.json ↔ yarn.lock`, version bump files, e2e test pairs). On cal.com, every surfaced pair is noise. The experiment showed removing CO-CHANGE entirely only drops score 0.99 → 0.98 — because there's nothing useful to show.

**Root cause:** `src/analyzer/co-change.ts` has no noise filter. It surfaces whatever has the highest co-occurrence count, and lockfiles/config files naturally win.

**Fix:**
1. Add a `NOISE_PATTERNS` filter in `findCoChangePairs()` to skip:
   - Lock files (`yarn.lock`, `package-lock.json`, `pnpm-lock.yaml`)
   - Version bump files (`*.version.ts`, `*.version.js`)
   - Generated files (`*.generated.ts`, `*.d.ts`)
   - Config-to-lockfile pairs
2. Consider filtering pairs where both files are in the same directory (less surprising)
3. Boost pairs that span different packages/modules (most valuable signal)

**Validation:** Re-run `calcom-validation` experiment after fix. CO-CHANGE should surface business logic pairs (e.g., BookingRepository ↔ RegularBookingService) instead of lockfiles.

---

## DEAD CODE: Framework entry point detection

**Status:** todo
**Priority:** P1
**Effort:** Medium (2-4 hours)
**Confidence:** High — the fix is well-understood

**Problem:** 55% of cal.com is flagged as dead code (4,123/7,445 files). Major sources:
- 303 Next.js pages (`page.tsx`, `layout.tsx`) → `classifyFile()` returns `component`, not `route`
- 275 NestJS DI-loaded files (`.controller.ts`, `.module.ts`, `.service.ts`) → loaded by DI container, not static imports
- 100+ test support files

**Root cause:** `classifyFile()` in `src/scanner/index.ts:261` only detects Next.js pages when `framework.name === "nextjs"`, but cal.com is a monorepo — most pages are in sub-packages where the framework detection may not fire. Also, NestJS uses dependency injection, not imports.

**Fix:**
1. Make Next.js page detection framework-independent — match `page.tsx`, `layout.tsx`, `route.ts` by path pattern alone, not gated on `framework.name`
2. Add NestJS convention: treat `*.controller.ts`, `*.module.ts`, `*.service.ts` as entry points (skip in dead code)
3. Filter generated files (`*.generated.ts`, `*.d.ts` when `.ts` exists)
4. Filter known non-source files (`.cjs` bundled runtimes like `yarn-4.12.0.cjs`)

**Validation:** Dead code count on cal.com should drop from 4,123 to <500. False positive rate should go from 55% to <10%.

---

## DEAD CODE: Generated & data file filtering

**Status:** todo
**Priority:** P2
**Effort:** Small (1 hour)
**Confidence:** High

**Problem:** Generated files (`*.generated.ts`, `*.d.ts`) and bundled runtimes (`.yarn/releases/yarn-4.12.0.cjs`) appear in dead code list. These are never imported by source code but aren't actually dead.

**Fix:** Add exclusion patterns in the dead code filter:
- `*.generated.ts`
- `*.d.ts` (when a corresponding `.ts` exists)
- `.yarn/**`, `.pnp.*`
- `dist/**`, `build/**`

---

## Workspace alias resolution (scanner)

**Status:** todo
**Priority:** P0
**Effort:** Large (4-8 hours)
**Confidence:** Medium — conceptually clear but implementation touches core scanner

**Problem:** Scanner doesn't resolve `@calcom/*` (or any monorepo workspace aliases) to file paths. Only tracks relative imports. This means:
- INFRASTRUCTURE shows 5 edges vs 4,733+ real cross-package edges
- RISK blast radius is undercounted (can't trace cascades across packages)
- MOST IMPORTED counts are intra-package only
- FLOWS section is nearly empty

**Root cause:** `extractImports()` in `src/scanner/index.ts:311` captures import paths but `resolveImportPath()` only resolves relative paths (`./`, `../`). Workspace aliases like `@calcom/lib` are treated as external packages and dropped.

**Fix:**
1. Read `package.json` workspaces field (or `pnpm-workspace.yaml`) to build alias → directory mapping
2. In import resolution, check if the import matches a workspace alias before discarding it
3. Resolve `@calcom/lib/foo` → `packages/lib/src/foo.ts` (or wherever the package.json `main`/`exports` points)

**Risk:** This is the most impactful fix but also the most complex. Every monorepo has slightly different workspace conventions (yarn, pnpm, npm, turborepo). May need to start with just `package.json` workspaces and iterate.

**Validation:** INFRASTRUCTURE edge count on cal.com should go from 5 to hundreds/thousands. RISK amplification ratios should increase for cross-package files.

---

## Experiment assertions: prune non-discriminating

**Status:** todo
**Priority:** P2
**Effort:** Small (1 hour)
**Confidence:** High

**Problem:** 7 assertions pass 100% across all conditions (including baseline). They cost ~$1.07 per experiment run and produce zero signal. 5 additional redundant pairs (Spearman rho ≥ 0.93) waste ~$0.77.

**Examples of non-discriminating assertions:**
- "Don't rank Playwright as production risk" — every model knows this
- "Suggest incremental migration" — generic advice
- "Recommend broad testing" — common sense

**Fix:** Remove or replace with harder assertions that only pass with strand data:
- "Cite the exact amplification ratio of file X"
- "Name the specific file that creates the cascade from A to B"
- "Identify which module boundary the cascade crosses"

---

## Test on private/unknown codebase

**Status:** todo
**Priority:** P2
**Effort:** Medium (2-3 hours)
**Confidence:** Medium — depends on finding a good test codebase

**Problem:** Sonnet already knows cal.com from training data. Baseline scores 0.93 on review and 0.95 on impact questions — suspiciously high. We can't cleanly attribute improvement to strand vs. prior knowledge.

**Fix:** Run the same experiment on a private repo that Sonnet has never seen. The delta between strand and baseline should be larger.
