# .strand v2 Format Design

**Date:** 2026-02-27
**Status:** Approved
**Approach:** B — Alias + FLOWS

## Problem Statement

.strand v1 won Experiment 3 as the most token-efficient encoding (-32% vs plain text, ~8.8K input tokens). Two weaknesses remain:

1. **Q3 weakness**: Misidentified payment flow entry points. The INFRASTRUCTURE section only records module-level aggregated edges (`scripts ───────╢ lib × 7`), not file-to-file typed relationships. The model guessed `catering/page.tsx` and `spirit-night/page.tsx` as payment entry points because they were high-complexity pages.

2. **Q1 truncation**: Hard-capped at 12 of 36 API routes (`showCount = Math.min(apiRoutes.length, 12)`). The model reported the correct total count but couldn't enumerate all routes.

## Design Decisions

- **Token budget**: Accept growth (~10-12% over v1). Accuracy gains from fixing Q3/Q1 outweigh context-rot risk at this scale.
- **FLOWS scope**: Critical paths only, auto-detected from edge classification. Not all file-to-file edges.
- **Detection**: Extend existing `classifyEdge()` to walk from API route entry points through classified edges.
- **Route listing**: Show all routes with compact formatting. Drop hardcoded annotations (redundant with FLOWS).

## Format Specification

### Header

```
STRAND v2 | {projectName} | {framework} | {files} files | {lines} lines
```

Changed from `v1` to `v2`.

### ALIASES section (NEW)

```
─── ALIASES ─────────────────────────────────────────────
$tlc-orders     src/app/api/teacher-club/orders/route.ts
$tlc-register   src/app/api/teacher-club/auth/register/route.ts
$pos-client     src/lib/cluster-pos/client.ts
...
```

**Rules:**
- Scan all sections for file paths appearing 2+ times
- Assign `$` + abbreviated name derived from most distinctive path segment
- Aliases should be 6-15 characters
- Emit after header, before TERRAIN
- Replace all subsequent occurrences with the alias

**Purpose:** Offsets token growth from FLOWS/uncapped routes. Each alias saves ~8-12 tokens per reference.

### TERRAIN section (unchanged)

```
─── TERRAIN ─────────────────────────────────────────────
Module complexity heatmap (█=high ▓=mid ░=low ·=minimal)

{bar}  {name}  {complexity} {files} {lines}  {description}
```

### INFRASTRUCTURE section (unchanged)

```
─── INFRASTRUCTURE ──────────────────────────────────────
Inter-module dependency roads

{from} {line}╢ {to}  ×{count}  {categories}
```

### FLOWS section (NEW)

```
─── FLOWS ──────────────────────────────────────────────
Critical paths (entry → logic → infrastructure)

payment:    $tlc-orders -> $tlc-ordering -> $pos-client -> prisma
            $tlc-cancel -> $tlc-ordering -> $pos-client
auth:       $tlc-register -> lib/teacher-club/auth -> $tlc-email-const
            api/magic-link/route -> lib/teacher-club/auth
rendering:  app/catering/page -> components/catering/* -> $tlc-ordering
            app/spirit-night/page -> components/spirit-night/*
```

**Auto-detection algorithm:**
1. Use `classifyEdge()` categories: auth, payment, test, rendering, data
2. Collect all cross-module edges per category
3. Walk from API route entry points following classified edges to build chains
4. Group chains by category, deduplicate
5. Emit 4-6 named flow domains

**Syntax:**
- `->` for directed edges (~1 token each)
- Aliases where available, short paths otherwise
- Wildcard (`emails/*`) when multiple directory files participate
- One chain per line, indented continuation for multiple chains in same domain
- No per-arrow type labels — the flow name provides the type

### API ROUTES section (modified)

```
─── API ROUTES ({count}) ────────────────────────────────
POST   /api/teacher-club/orders                       596L 0.74
POST   /api/teacher-club/auth/register                366L 0.50
...all routes, no truncation...
```

**Changes from v1:**
- Removed `showCount = 12` cap — list ALL routes
- Reduced method column padding (18 → 6 chars)
- Removed hardcoded annotations (`← payment+POS hub`, `← void flow`) — redundant with FLOWS

### PAGES section (modified)

```
─── PAGES ({count}) ─────────────────────────────────────
{path} {lines}L {complexity}
...all pages, no truncation...
```

**Changes from v1:**
- Removed `showCount = 10` cap — list ALL pages

### HOTSPOTS section (modified)

```
─── HOTSPOTS (complexity > 0.3) ─────────────────────────
{complexity}  {$alias|path}  {lines}L {imports}imp {suffix}
```

**Change from v1:** Uses aliases for files present in alias table.

### MOST IMPORTED section (modified)

```
─── MOST IMPORTED ───────────────────────────────────────
×{count}  {$alias|path}
```

**Change from v1:** Uses aliases for files present in alias table.

### TEST COVERAGE section (unchanged)

```
─── TEST COVERAGE ───────────────────────────────────────
{test files} | {covered}/{total} testable files ({percent}%)
```

## Token Budget Estimate

| Component | v1 tokens | v2 tokens | Delta |
|-----------|-----------|-----------|-------|
| Header | ~20 | ~20 | 0 |
| ALIASES | 0 | ~100-150 | +150 |
| TERRAIN | ~400 | ~400 | 0 |
| INFRASTRUCTURE | ~100 | ~100 | 0 |
| FLOWS | 0 | ~150-250 | +250 |
| API ROUTES | ~250 (12 routes) | ~500 (36 routes) | +250 |
| PAGES | ~200 (10 pages) | ~450 (35 pages) | +250 |
| HOTSPOTS | ~200 | ~170 | -30 |
| MOST IMPORTED | ~100 | ~80 | -20 |
| TEST COVERAGE | ~30 | ~30 | 0 |
| **Total** | **~1,300** | **~2,000-2,150** | **+700-850** |

Input tokens estimate: ~9.5-10.5K (vs v1's 8.8K, vs plain text's 13.7K). Still ~25-30% cheaper than plain text.

## Validation Plan (Experiment 4)

Re-run all 5 standard questions against .strand v2:
- **Q1**: Does the model now list all 36 routes with HTTP methods?
- **Q2**: Does complexity analysis remain accurate? (regression check)
- **Q3**: Does the FLOWS section correctly guide the model to payment files instead of catering/spirit-night?
- **Q4**: Does architectural reasoning remain intact? (regression check)
- **Q5**: Does dependency analysis benefit from aliases making paths shorter? (regression check)

Compare directly against v1 and plain text baseline using same model (claude-sonnet-4-20250514, 1024 max tokens).

## Implementation Scope

### Files to modify
- `src/encoder/strand-format-encode.ts` — main encoder, all changes here

### New functions to add
- `buildAliases(graph, sections)` — scan for repeated paths, generate alias table
- `renderAliases(aliases)` — emit ALIASES section
- `renderFlows(graph, aliases)` — auto-detect and emit FLOWS section
- `applyAliases(text, aliases)` — replace full paths with aliases in a rendered section

### Functions to modify
- `encodeToStrandFormat()` — add ALIASES + FLOWS sections, wire alias application
- `renderApiRoutes()` — remove showCount cap, tighter formatting, drop annotations
- `renderPages()` — remove showCount cap
- `renderHotspots()` — apply aliases
- `renderMostImported()` — apply aliases

### New experiment file
- `experiments/experiment-4-strand-v2.ts` — run v1 vs v2 vs text comparison
