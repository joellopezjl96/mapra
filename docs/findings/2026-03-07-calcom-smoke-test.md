# Smoke Test: cal.com (2026-03-07)

## Codebase

- **Repo:** cal.com/cal.com (open-source scheduling platform)
- **Size:** 7,444 files, 906,058 lines, 34 modules
- **Framework:** Next.js monorepo (Turborepo)
- **Location:** `C:\dev\cal.com`

## Performance

- **Generation time:** 2.6 seconds
- **Output size:** 4,076 chars (~1,019 tokens)
- **Full setup** (generate + wire + hooks + shim): completed without errors

## What worked

- **Scale:** No crashes or slowdowns on a 906K-line monorepo
- **Module detection:** Found 34 modules across packages/, apps/
- **Hotspots:** Correctly identified `RegularBookingService.ts` (3,088L, 108 imports, complexity 0.78), Prisma schema (3,342L, complexity 0.54), and `apps.metadata.generated.ts` (227L but 110 importers)
- **Most imported:** `trpc/server/types.ts` at x177 — accurate
- **Infrastructure:** Caught cross-module roads (emails->sms, web->platform)
- **Test coverage:** 10.4% (700/6,742 testable files)
- **Shallow clone warning:** Fired correctly, told user how to fix
- **Setup flow:** All steps passed (generate, wire CLAUDE.md, hooks, shim, package.json update)
- **Status check:** All 4 indicators green

## Issue 1: Dead code false positives (436 framework entry points)

### Problem

4,369 files flagged as dead code (58% of codebase). Breakdown:

| Category | Count | Accurate? |
|----------|-------|-----------|
| v1 API island | 169 | Yes — entire subtree is isolated, nothing imports into it |
| Next.js pages/app routes | 436 | **No** — framework entry points loaded by router |
| Test files | 100 | **No** — loaded by test runner, not imports |
| Generated/tooling | 5 | Yes |
| Other | ~3,659 | Mixed — needs investigation |

### Root cause

Strnd uses import-graph reachability to detect dead code. Files that are "alive" because a framework loads them (Next.js file-based routing, test runners) have no inbound import edges, so they appear unreachable.

### False positive examples

```
apps/web/app/(booking-page-wrapper)/booking/[uid]/page.tsx
apps/web/app/(booking-page-wrapper)/org/[orgSlug]/team/[slug]/[type]/page.tsx
apps/web/app/(booking-page-wrapper)/team/[slug]/page.tsx
```

These are core booking pages — the heart of the product.

### Proposed fix

Detect framework entry points by filename convention and mark them as graph roots:
- `page.tsx`, `page.ts`, `page.jsx`, `page.js` (Next.js App Router pages)
- `route.tsx`, `route.ts` (Next.js App Router API routes)
- `layout.tsx`, `layout.ts` (Next.js layouts)
- `loading.tsx`, `error.tsx`, `not-found.tsx` (Next.js special files)
- Files matching `*.test.*`, `*.spec.*`, `*.e2e.*` (test files)
- `middleware.ts` (Next.js middleware)

These files should be treated as entry points in the dependency graph, not flagged as dead code.

## Issue 2: RISK dominated by test infrastructure

### Problem

The top 8 RISK entries are all Playwright test helpers:

```
[AMP] amp94.0 x1->94     d5   1mod  T0   apps/web/playwright/lib/loadJSON.ts
[AMP] amp92.0 x1->92     d4   1mod  T0   apps/web/playwright/lib/next-server.ts
[AMP] amp91.0 x1->91     d3   1mod  T0   playwright.config.ts
```

These have extreme amplification because ~92 Playwright test files all import from a shared fixture chain. But this is test infrastructure — users care about production blast radius.

### Root cause

Strnd doesn't distinguish between production code and test code when computing blast radius. A test helper that cascades to 94 test files ranks higher than a production utility that cascades to 25 production files.

### Proposed fix

Either:
1. **Filter test files from RISK entirely** — don't include files in test directories or with test patterns in the RISK section
2. **Separate sections** — show production RISK and test RISK separately
3. **Deprioritize** — sort test-infrastructure entries below production entries

Option 1 is simplest and probably what users want. Test cascade risk is real but it's a different concern than production blast radius.

## Verdict

Strnd handles large monorepos well — fast, compact output, useful structural signals. The two accuracy issues (framework entry points in dead code, test infra in RISK) should be fixed before publishing to npm. Both are solvable with filename-convention detection.
