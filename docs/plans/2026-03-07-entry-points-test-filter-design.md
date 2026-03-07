# Framework Entry Points + Test File Filtering — Design

## Problem

The cal.com smoke test (906K lines, 7,444 files) revealed two accuracy issues:

1. **Dead code false positives:** 436 Next.js page/app routes flagged as dead code because the framework loads them via file-based routing, not via import statements. 100 test files also flagged.
2. **RISK dominated by test infrastructure:** Top 8 RISK entries are Playwright test helpers (amp 91-94), burying production risks like `RegularBookingService.ts` and `constants.ts`.

## Design

### 1. Framework entry point detection

Mark files as entry points based on Next.js conventions. Entry points get treated as graph roots — they have implicit inbound edges from the framework, so they're not dead code.

**Next.js entry point patterns:**
- `page.tsx/ts/jsx/js` — App Router pages
- `route.tsx/ts` — App Router API routes
- `layout.tsx/ts` — layouts
- `loading.tsx/ts`, `error.tsx/ts`, `not-found.tsx/ts` — special files
- `middleware.ts/js` — at project root or `src/`

**Where:** `src/scanner/index.ts` (detection), `src/analyzer/graph-utils.ts` or `src/analyzer/index.ts` (treat as roots in dead code reachability)

### 2. Test file filtering from production sections

Filter test files out of RISK, HOTSPOTS, and MOST IMPORTED. A file is a test file if:
- Path contains `__tests__/`, `.test.`, `.spec.`, `.e2e.`
- Under a `playwright/`, `test/`, or `tests/` directory
- Already classified as `type: "test"` in the scanner

Test files still appear in DEAD CODE and TEST COVERAGE — just not in production-focused sections.

**Where:** `src/encoder/strand-format-encode.ts` (filter before rendering RISK, HOTSPOTS, MOST IMPORTED)

## Expected impact (cal.com)

- Dead code: ~536 fewer false positives (436 pages + 100 test files)
- RISK: top entries become production code instead of Playwright helpers
- HOTSPOTS: e2e-spec files (0.52, 0.51) replaced by production files
- MOST IMPORTED: `playwright/lib/fixtures.ts` (x86) drops out

## Scope

- Next.js only for entry points (no Remix/SvelteKit/Nuxt)
- Can add more frameworks when language support expands
