# Strand v4 — Toolbelt Design

**Date:** 2026-03-02
**Theme:** Speed — reduce agent API round-trips by making each turn maximally productive
**Approach:** Keep the map lean, add CLI tools for follow-up queries, solve the trust/freshness problem

---

## Problem Statement

v3 delivers the right answer but too slowly. In a real-world test (preorder blocker analysis on a 289-file Next.js project), the v3 agent took 211 seconds and 19 tool calls despite having `.strand` data upfront.

**Root cause analysis** (from parallel subagent investigation):

| Cause | Time | % of Total | Fixable? |
|-------|------|-----------|----------|
| LLM inference across ~6 API turns | 130-170s | 62-81% | Partially — fewer turns = less inference |
| Reading 1,390-line implementation plan | 15-25s | 7-12% | Yes — `validate-plan` replaces this |
| Reading 412-line design doc | 15-25s | 7-12% | Partially — doc summary (out of scope for v4) |
| Redundant verification searches | 15-30s | 7-14% | Yes — trust directive + freshness stamps |
| Necessary domain reads (vercel.json, etc.) | 15-25s | 7-12% | No — inherent boundary |

**The bottleneck is not tool call speed — it's the number of API round-trips.** Each turn costs 15-35 seconds of LLM inference. Every eliminated round-trip saves real wall-clock time.

---

## What v3 Does Well (Preserve)

Experimentally validated across 8 experiments, 2 codebases, 5 question types:

- **RISK section** — only encoding to surface hidden cascade risk (amp scores, cascade depth). 3/3 on impact analysis questions.
- **FLOWS section** — fixed payment flow navigation from 2/3+FPs to 3/3+0FPs. Surfaced files invisible to all other encodings.
- **CHURN section** — eliminated `git log` tool calls entirely.
- **MOST IMPORTED** — cheap centrality signal (82 tokens).
- **Token efficiency** — 289 files encoded in ~3,520 tokens. Bounded by section caps, not file count.
- **Self-documenting** — 96% comprehension without a legend (Exp 8).
- **Zero tool calls** for structural questions when `.strand` is in CLAUDE.md (Exp 7).

---

## What v3 Does Poorly (Fix)

### 1. Agent doesn't trust .strand data

The agent still runs verification greps against data already in the encoding (test coverage, import counts). The encoding has no freshness signal, so the agent can't distinguish "computed 5 minutes ago" from "computed 5 days ago."

### 2. No follow-up query tools

After reading `.strand` and seeing `amp3.3 ×7→23 d4`, the agent's natural follow-up is "show me the cascade chain." Today that requires manual grepping across 7+ files. No CLI tool exists for this.

### 3. Low-value sections waste token budget

PAGES (505 tokens, 14.3%), TERRAIN (434 tokens, 12.3%), and DOMAINS (261 tokens, 7.4%) scored low in experiments. PAGES is pure enumeration. DOMAINS scored 3/8 on identification tasks (scanner limitation). Together they consume 34% of the encoding for marginal value.

### 4. Agent reads large plan files manually

The 1,390-line implementation plan consumed ~14,000 tokens and required multiple reads. `validate-plan` exists but the agent doesn't know about it — it's not surfaced in the encoding.

---

## Design

### 1. New CLI Tool: `strand impact <file>`

Query the dependency graph for a specific file's full cascade chain.

**Usage:**
```
strand impact src/lib/teacher-club/ordering-server.ts
```

**Output:**
```
src/lib/teacher-club/ordering-server.ts  (615L, 0.59 complexity, 7 commits/30d)
├── src/app/api/teacher-club/orders/route.ts         ×15imp  0.78 cx  18 churn  T2
│   └── [leaf — no downstream importers]
├── src/app/api/teacher-club/orders/[orderNumber]/cancel/route.ts  ×8imp  0.40 cx  2 churn  T1
│   └── [leaf]
├── src/app/teacher-club/dashboard/page.tsx           ×11imp  0.40 cx  7 churn  T0 ⚠
│   └── [leaf]
├── src/app/teacher-club/menu/page.tsx                ×7imp   0.33 cx  3 churn  T0 ⚠
│   └── [leaf]
├── src/lib/kitchen/queries.ts                        ×4imp   0.15 cx  1 churn  T0 ⚠
│   ├── src/app/admin/kitchen/page.tsx                ×3imp   0.12 cx  0 churn  T0 ⚠
│   └── src/app/api/admin/kitchen/prep-sheet/route.ts ×2imp   0.17 cx  0 churn  T0 ⚠
├── src/lib/teacher-club/ordering.ts                  ×24imp  0.29 cx  11 churn T3
│   └── [24 downstream — see `strand impact src/lib/teacher-club/ordering.ts`]
└── src/app/api/teacher-club/availability/route.ts    ×1imp   0.16 cx  0 churn  T0 ⚠

Summary: 7 direct → 23 total affected | cascade depth 4 | 5 of 7 direct importers have T0 (no tests) ⚠
Freshness: .strand generated 2026-03-02T01:35:52 | 0 files modified since
```

**Design decisions:**
- Tree format showing cascade path, not just leaf counts
- Per-node metrics: import count, complexity, churn (30d commits), test file count
- `T0 ⚠` flag on untested files in the cascade
- Freshness stamp at bottom with staleness detection
- Reads from `.strand` data — no re-scan, instant output
- `--json` flag for programmatic consumption
- Large cascades (>24 downstream) show a pointer to a sub-query rather than expanding inline

**Implementation:** Parse the `.strand` file's RISK and dependency data. Walk the import graph breadth-first. Annotate each node with metrics from HOTSPOTS and CHURN sections. Output as indented tree.

### 2. Freshness System

Three layers of freshness assurance:

**Layer 1 — Auto-regeneration hooks:**
- Pre-commit hook: `strand update` before each commit
- Post-checkout hook: `strand update` after `git checkout` / `git pull`
- Installed via `strand init --hooks` (opt-in)
- Hooks are lightweight shell scripts that call `strand update` only if source files changed

**Layer 2 — Freshness stamps on tool output:**
Every CLI tool appends:
```
Freshness: .strand generated 2026-03-02T01:35:52 | 3 files modified since: [ordering.ts, menu/page.tsx, cart/types.ts]
```

How it works: `.strand` stores a hash manifest as a trailing comment block (invisible to LLMs reading the main content). Tools check file mtimes against the manifest and report drift.

Manifest format (appended to `.strand`):
```
<!-- MANIFEST
src/lib/teacher-club/ordering-server.ts:1709341552
src/lib/teacher-club/ordering.ts:1709341552
... -->
```

**Layer 3 — Trust directive in CLAUDE.md:**
```
Before exploring files for any task — read .strand first. The USAGE line
tells you which sections matter for your task type. Treat .strand data as
ground truth for structural facts (blast radius, complexity, import counts,
test coverage). Only open individual files when you need implementation
details the encoding doesn't provide.
```

### 3. Encoding Changes

**Header (v4):**
```
STRAND v4 | senorburritocompany | Nextjs | 289 files | 49,979 lines | generated 2026-03-02T01:35:52
LEGEND: ×N=imported by N files | █▓░·=complexity high→low | ═/·=coupling strong/weak | ×A→B=A direct, B total affected | dN=cascade depth | [AMP]=amplification≥2x | TN=N test files | NL=lines of code
USAGE: planning→RISK,CONVENTIONS,INFRASTRUCTURE | debugging→FLOWS,CHURN,HOTSPOTS | refactoring→RISK,DOMAINS,CHURN | review→CONVENTIONS,RISK,CHURN | impact-analysis→run strand impact <file>
TOOLS: strand impact <file> → cascade tree with churn/tests/complexity | strand validate-plan <plan.md> → cross-reference plan paths against RISK+CHURN
```

**Sections cut:**

| Section | v3 tokens | Reason |
|---------|-----------|--------|
| PAGES | ~505 | Pure enumeration. Overlaps with HOTSPOTS. Scored low in experiments. |
| DEAD CODE (count) | ~14 | "51 unreachable files" with no detail. Not actionable. |

**Sections compressed:**

| Section | v3 | v4 | Token savings |
|---------|----|----|---------------|
| DOMAINS | Top-24 (28 lines) | Top-5 | ~200 tokens |
| TERRAIN | All modules (31 lines) | Top-5 modules | ~300 tokens |
| HOTSPOTS | All > 0.3 (12 lines) | Top-5 | ~100 tokens |

**Token budget:**
- v3: ~3,520 tokens (senorburritocompany, 289 files)
- v4: ~2,400 tokens (estimated 32% reduction)
- High-value sections (RISK, FLOWS, CHURN, MOST IMPORTED, INFRASTRUCTURE, API ROUTES) untouched

---

## Section Rendering Order (v4)

1. Header + LEGEND + USAGE + TOOLS
2. RISK (blast radius — highest signal)
3. CHURN (temporal — second highest signal)
4. CONVENTIONS (detected patterns)
5. FLOWS (entry points and cross-module dependencies)
6. HOTSPOTS (top-5 complexity)
7. MOST IMPORTED (centrality)
8. DOMAINS (top-5 feature domains)
9. TERRAIN (top-5 module heatmap)
10. INFRASTRUCTURE (inter-module coupling)
11. API ROUTES (endpoint inventory)
12. TEST COVERAGE (aggregate)

---

## Competitive Context

No other tool does what strand does — a bounded-token, version-controlled, human-readable orientation file:

| Tool | Format | Static/Query | Token Cost | Blast Radius |
|------|--------|-------------|-----------|-------------|
| Repomix | Raw concat | Static | 100k-500k+ | None |
| Aider repo map | Symbols (PageRank) | Dynamic/turn | ~1k | Indirect |
| Claude Code | Ad-hoc grep | Reactive | Unbounded | None |
| Cursor | Vector embeddings | Runtime query | Variable | None |
| Depwire | JSON/MCP | Query-time | Per-call | Yes |
| Axon | Graph DB/MCP | Query-time | Per-call | Yes |
| **Strand v4** | Compact text + CLI | Static + queryable | ~2,400 | Yes |

Strand's defensible niche: session-start orientation with bounded cost. The toolbelt adds query capability without abandoning the static encoding that makes strand unique.

---

## Explicitly Out of Scope for v4

- `strand ask` / natural language query interface — adds LLM-in-LLM complexity
- `strand doc-index` — scope creep into semantic summaries
- `strand diff-since` (standalone) — fold blast-radius annotation into `strand impact --changed-since` if needed later
- Data model sections (Prisma schema awareness)
- Per-file descriptions
- Entry point identification
- Interface/type signatures

These are valid v5 candidates but would expand scope beyond the speed theme.

---

## Success Criteria

For the same preorder blocker question on senorburritocompany:

| Metric | v3 (baseline) | v4 (target) |
|--------|--------------|-------------|
| Tool calls | 19 | ≤8 |
| Total tokens | 48,144 | ≤25,000 |
| Wall-clock time | 211s | ≤120s |
| Answer quality | P0/P1/P2 table | Same or better |
| Freshness verification | Agent runs own greps | Agent trusts .strand stamps |
