# Proving Strand's Incremental Value

**Date:** 2026-03-08
**Status:** Design
**Problem:** The incremental value of strand over simpler alternatives doesn't clearly justify adoption friction.

---

## The Value Gap

### What the Numbers Actually Say

Experiment 10 (strand-analysis-value) decomposed strand's contribution into three layers, tested on SenorBurritoCompany with Sonnet 4.6 across 10 questions and 3 trials per condition:

| Layer | Score | Delta | What It Provides |
|-------|-------|-------|------------------|
| No encoding | 0.13 | baseline | Model guesses from question alone |
| File listing only (text-bare) | 0.50 | **+0.37** | File names, sizes, organization |
| File listing + analysis (text-full) | 0.75 | **+0.25** | Risk rankings, import counts, complexity scores |
| Strand v3 (compact notation) | 0.82 | **+0.07** | Amplification ratios, cascade depth, coupling |

The critic's read: a well-structured file tree + README gets you 60% of the way there (+0.37 out of +0.69 total). Strand's analysis adds +0.25 on top. The compact format adds +0.07. Is the full stack worth adopting over `tree > context.txt`?

### Where Strand Clearly Wins

**1. Change-safety tasks (the moat)**

Experiment 12 is the strongest evidence. When asked to rank ordering.ts (x16 imports), ordering-server.ts (x7 imports), and session.ts (x16 imports) by modification risk:

- Without RISK data: models ranked ordering-server.ts as LEAST risky every trial (score: 0.03)
- With RISK data: models read `x7->25, amp 3.6, d4` and correctly identified the hidden cascade (score: 1.00)

That is a +0.97 gap on a single question. RISK literally inverts naive intuition. No file tree, README, or import-count list can surface this. You need to run a BFS cascade analysis to know that ordering-server.ts (7 direct importers) is more dangerous than session.ts (16 direct importers).

The full Exp 12 gap: strand-full 0.86 vs strand-no-risk 0.62 (+0.24 across 6 change-safety questions).

**2. Hidden amplifier identification**

Files where amplification ratio >= 2.0 are invisible without cascade analysis:
- ordering-server.ts: x7 direct -> 25 affected (amp 3.6)
- TlcEmailLayout.tsx: x5 direct -> 15 affected (amp 3.0)
- PermissionConditionHelpers.tsx: x1 direct -> 20 affected (amp 20.0)
- roles/types.ts: x11 direct -> 51 affected (amp 4.6)

Experiment 5 confirmed: strand+RISK was the only condition to identify roles/types.ts as high-impact (3/3 correct on Q5 vs 2/3 for text and 1.7/3 for strand without RISK).

**3. Eliminating exploratory tool calls**

Experiment 7 (real-session test): a cold Claude Code session in SenorBurritoCompany with `.strand` in CLAUDE.md answered a structural refactoring question with 0 tool calls. A prior session without `.strand` used 45 tool calls and ~70,800 tokens to reach a comparable answer. The model cited exact line counts, complexity scores, and blast radius numbers directly from context.

**4. Architecture and debugging tasks**

Experiment 10 by task type shows strand's strongest wins:

| Task Type | Text bare | Strand v3 | Gap |
|-----------|-----------|-----------|-----|
| architecture | 0.42 | 0.58 | +0.16 |
| debugging | 0.33 | 0.67 | +0.34 |
| planning | 0.00 | 0.50 | +0.50 |
| impact | 0.58 | 1.00 | +0.42 |

Planning scores 0.00 with file listing alone -- you cannot plan a pre-order feature without knowing ordering cutoffs, payment timing, and cascade risk. Only structural analysis enables this.

### Where Strand Doesn't Add Much

**1. Simple file inventory (+0.22 over bare, but bare already at 0.78)**

Both text-bare and strand score high on "list all X" questions. The marginal value of strand's analysis is small when the task is enumeration.

**2. Refactoring (strand 0.75 vs text-full 0.79)**

Strand's only weak spot. The compact format strips semantic details (what utility files do, what patterns they share) that help with pattern-matching tasks. Text-full's verbose file descriptions include names like `thermal-print-styles.ts` and `dates.ts` that aid refactoring identification.

**3. When import counts already signal danger**

Exp 12 found RISK adds zero value for files with obviously high import counts. change-2 (TlcEmailLayout required prop) and change-5 (emails/constants restructure) scored 1.00 across all conditions, including those without RISK. When a file has 15+ direct importers, models already know it is risky.

### The Trust Problem

Even where strand provides genuine signal, two categories of false positives erode trust before users see the payoff:

**RISK false positives:** cal.com smoke test showed top RISK entries dominated by Playwright test helpers (amp 91-94). These are test infrastructure, not production risk. A user seeing test utilities ranked as the most dangerous files in their codebase will dismiss the entire section.

**DEAD CODE false positives:** cal.com flagged 4,368/7,444 files (58%) as dead code. Of those, 436 were Next.js page/app routes (framework entry points not imported via import graph) and 100 were test files. Telling a developer that their page.tsx files are "unreachable" is worse than showing nothing.

---

## Design: Closing the Gap

### 1. Higher-Signal Sections

These are analyses that would be genuinely hard to get elsewhere and would move the +0.25 structural analysis delta upward.

#### Co-change patterns from git history

When file A changes, file B changes in the same commit 80% of the time. This is a signal that no static analysis tool provides, and it directly answers the question "if I change X, what else do I need to change?"

**Data source:** Git log with `--name-only` across recent commits (30-90 days). Build a co-occurrence matrix. Surface pairs with high co-change frequency and low import-graph proximity (they change together but don't import each other -- the most surprising and valuable signal).

**Token cost:** ~100-200 tokens for top 5-8 co-change pairs.

**Expected value:** High. This complements RISK (which answers "what breaks") with "what else you'll need to touch." Together they cover both involuntary cascade and voluntary coordination.

#### Convention violations / anomaly detection

Current CONVENTIONS section shows import pattern adoption rates (e.g., "session.ts used by 18/24 API routes"). The next step: flag the 6 that don't follow the pattern. These are either intentional exceptions or bugs.

**Mechanism:** For each convention with >= 70% adoption, list the non-adopters. For example: "6 API routes skip session.ts: [list]. 3 API routes skip rate-limit.ts: [list]."

**Token cost:** ~50-100 tokens (just the violation list, not the full convention).

**Expected value:** Medium-high. This directly answers review questions ("does this new route follow conventions?") by showing what the conventions are AND what breaks them. Exp 10 showed review scores of 0.67 (bare) vs 1.00 (strand) -- convention data is already valuable, and violations would sharpen it further.

#### Cross-module dependency flows

Current INFRASTRUCTURE shows inter-module edge counts. It does not show the *direction* of these dependencies or whether they form cycles. A module dependency DAG with cycle detection would surface architectural problems that are invisible at the file level.

**Mechanism:** Already have the data in `renderInfrastructure()`. Add cycle detection (DFS with back-edge tracking). Flag bidirectional module dependencies (A -> B and B -> A) as potential architectural issues.

**Token cost:** ~50-100 tokens (cycle/bidirectional annotations on existing INFRASTRUCTURE rows).

**Expected value:** Medium. Useful for architecture and planning tasks, but unlikely to move scores dramatically. The current module coupling lines already provide directional signal.

#### API surface summaries

List exported function signatures for high-RISK files. When ordering-server.ts has amp 3.6 and cascades to 25 files, knowing *which exports* are the risky ones helps developers scope changes.

**Current state:** The encoder already shows `exports: checkOrderAvailability, getOrderStatus, +3 more` for RISK entries. This could be expanded to include parameter counts or return types, but the token cost grows quickly.

**Token cost:** Already included (~5-10 tokens per RISK entry). Expanding to full signatures would add ~200 tokens.

**Expected value:** Low incremental. The export names are already shown. Full signatures would help refactoring but are expensive.

### 2. Reduce Noise (Make Existing Sections More Trustworthy)

#### Filter test files from RISK

The cal.com problem: Playwright test helpers dominate RISK with amp 91-94. These should be excluded or deprioritized.

**Implementation:** In `blast-radius.ts`, skip nodes where `type === "test"` or path matches `/__tests__/`, `*.spec.*`, `*.test.*`, or common test helper patterns. Alternatively, render them in a separate "Test Infrastructure Risk" sub-section.

**Effort:** Low. The node type is already classified by the scanner. One filter line in `renderRisk()` or `analyzeBlastRadius()`.

**Impact:** High. This is the single most impactful trust fix. When a user runs strand on cal.com and sees `RegularBookingService.ts (amp 4.2, 108 imports)` at the top of RISK instead of `globalSetup.ts (amp 94.0)`, they immediately see production-relevant signal.

#### Framework-aware dead code detection

Next.js `page.tsx`, `route.ts`, `layout.tsx`, and `middleware.ts` files are entry points that are never imported via the import graph. They should be excluded from DEAD CODE.

**Implementation:** In the analyzer, detect framework entry point patterns and exclude them. Already partially designed in `docs/plans/2026-03-07-entry-points-test-filter-design.md`.

**Effort:** Medium. Need pattern matching for multiple frameworks (Next.js, Remix, SvelteKit, etc.) and test file conventions.

**Impact:** High for large monorepos. cal.com went from 4,368 dead files to a more honest ~3,832 (excluding 436 routes + 100 tests). Still a lot, but no longer obviously wrong.

#### Adaptive detail in RISK

Not all RISK entries need cascade targets and export lists. Show full detail for the top 3 (highest amplification) and compact single-line format for entries 4-8. This reduces noise while preserving signal for the most dangerous files.

**Token cost:** Saves ~100-150 tokens by compacting the bottom half of RISK.

**Effort:** Low. Conditional rendering in `renderRisk()`.

#### Prioritize actionable over exhaustive

DEAD CODE currently lists up to 15 files then says "+N more." For large codebases, even the 15 shown are mostly noise (generated `.d.ts` files, compiled `.js` files). Filter to only show source files (`.ts`, `.tsx`) and cap at 10.

HOTSPOTS overlaps heavily with API ROUTES (same files, same complexity scores). Consider merging: show complexity in the API ROUTES section and drop HOTSPOTS as a standalone section. Exp 11 found HOTSPOTS removal had zero impact (0.71 vs 0.71 baseline).

### 3. Zero-Friction Adoption (Reduce the "Squeeze")

#### `npx strnd` -- zero install

The package is already published to npm as `strnd`. Running `npx strnd generate` should work today. The adoption path is:

1. `npx strnd generate` -- see your .strand file
2. `npx strnd init` -- wire it into CLAUDE.md
3. Install globally only if you want `strand` on PATH

No configuration needed for step 1. The scanner auto-detects project type.

**Gap:** Verify `npx strnd generate` works without global install. Ensure the CLI handles the common case (run from project root, detect framework, generate .strand) without any flags.

#### Auto-detect and configure

The scanner already detects Next.js, React, Vue, and other frameworks. It auto-classifies nodes as api-route, route, component, etc. No configuration file is needed.

**Gap:** The framework detection could be more explicit in the output. Instead of silently adapting, show: "Detected: Next.js 14 (App Router). Scanning src/, app/, pages/." This builds trust by showing the tool understood the project.

#### Output comparison mode

`strand generate --compare` could show a side-by-side: here is what a file tree gives you, here is what strand adds. Render the file tree equivalent, then highlight the sections that have no file-tree analog (RISK, CHURN, CONVENTIONS, FLOWS).

**Effort:** Medium. Need a `renderFileTree()` function and a diff-style comparison output.

**Impact:** Medium. This is a sales tool, not a product feature. But it directly addresses the "juice vs squeeze" concern by making the incremental value visible.

### 4. Prove It (Better Experiment Methodology)

#### Task-specific benchmarks, not aggregate scores

The +0.25 aggregate obscures the real story. Strand's value is task-dependent:

| Task Category | Bare -> Strand Delta | Verdict |
|---------------|---------------------|---------|
| Change-safety / impact | +0.42 to +0.97 | **Strand is essential** |
| Architecture / debugging | +0.16 to +0.34 | **Strand adds clear value** |
| Planning | +0.50 | **Strand enables (bare = 0.00)** |
| Inventory | +0.22 | Strand helps moderately |
| Refactoring | +0.33 | Strand helps, text-full comparable |
| Review | +0.33 | Strand helps moderately |

Marketing strand on "average +0.25" undersells the areas where it is essential and oversells the areas where it barely matters. Report value by task category.

#### Head-to-head vs. specific alternatives

Current experiments compare against our own text encodings (text-bare, text-full). The critic's implicit comparison is against tools users already have:

- **vs. Repomix / `tree` output:** Run the same question set with `tree --dirsfirst -I node_modules` output as context. Does strand's RISK/CHURN/FLOWS data beat a clean directory tree?
- **vs. README + file tree:** Many projects have a good README with architecture descriptions. Test: README.md + tree output vs. strand. Where does strand still win?
- **vs. GitHub Copilot context:** Copilot already has file-level context from the open editor. What does strand add beyond what the IDE provides?

**Design:** Add new conditions to the batch runner: `tree-output` (generate tree, inject as context), `readme-tree` (README.md + tree), `strand-v3`. Use the same 15-question set from Exp 9.

#### Cost-per-query savings measurement

Exp 7 showed 45 tool calls -> 0 tool calls for structural questions. At ~$0.003/tool call (Sonnet input/output for a file read), that is ~$0.135 saved per structural query. A `.strand` context injection costs ~1,000 tokens/query * $3/M = $0.003.

**ROI per structural query:** ~$0.132 saved, or ~45x return on the token investment.

This number should be validated across more question types and codebases, but the directional math is compelling.

#### User studies

No amount of LLM-as-judge scoring replaces watching a developer use the tool. Even small-scale studies (5-10 developers, 3 tasks each) would provide signal that automated benchmarks cannot:

- Do developers notice when strand is in their context?
- Do they trust the RISK rankings?
- Does the format make sense without explanation?
- What questions do they ask that strand should answer but doesn't?

---

## Implementation Priorities

### P0: Trust fixes (highest impact, lowest effort)

1. **Filter test files from RISK** -- 1 line of code, fixes the single biggest trust problem (cal.com test helpers at amp 91-94)
2. **Framework-aware dead code exclusion** -- already designed, blocks the most visible false positive category (page.tsx as "dead code")
3. **Filter generated files from DEAD CODE** -- exclude `.d.ts`, `.js` (when `.ts` exists), `.map` files

These three changes require minimal code, have no token cost, and directly address the trust erosion that makes users dismiss strand before they see the value.

### P1: Higher signal (medium effort, high impact)

4. **Co-change patterns from git history** -- new analysis pass, ~100-200 tokens, fills the "what else to change" gap
5. **Convention violations** -- extend existing CONVENTIONS rendering, ~50-100 tokens, sharpens review task performance
6. **Merge HOTSPOTS into API ROUTES** -- remove redundant section, save ~285 tokens with zero measured regression

### P2: Better proof (medium effort, medium impact)

7. **Head-to-head benchmarks vs. tree/README** -- new experiment configs, uses existing batch runner
8. **Task-specific value reporting** -- change how we communicate results (marketing, not code)
9. **Output comparison mode** (`strand generate --compare`) -- sales tool for adoption

### Deferred

- **Cross-module cycle detection** -- useful but niche, low priority until architecture questions show up as a user need
- **Full API surface summaries** -- expensive in tokens, low incremental value over current export names
- **User studies** -- valuable but requires external coordination, not something to block on

---

## Trade-offs

### Token budget constraints

The current .strand output is ~1,000 tokens for a ~50K line codebase and ~1,019 tokens for a ~900K line codebase. This is within system prompt budgets. Every new section must justify its tokens:

| Proposed addition | Est. tokens | Justification |
|-------------------|-------------|---------------|
| Co-change pairs | 100-200 | Fills a gap no other section covers |
| Convention violations | 50-100 | Sharpens existing section, minimal overhead |
| HOTSPOTS removal | -285 | Zero measured regression (Exp 11) |
| Adaptive RISK detail | -100-150 | Less noise in bottom-half entries |
| **Net change** | **-235 to -135** | **Richer signal, fewer tokens** |

The goal is not to add more sections but to make existing tokens work harder.

### Diminishing returns on analysis depth

The value gradient from Exp 10 shows diminishing returns:
- +0.37 for file listing (huge, easy)
- +0.25 for structural analysis (large, requires static analysis)
- +0.07 for compact format (small, requires encoding design)

Each additional layer of analysis will likely yield diminishing returns. Co-change patterns might add +0.05-0.10. Convention violations might add +0.02-0.05. At some point, the next +0.01 costs more in complexity and token budget than it is worth.

The right strategy is not "add everything that might help" but "make the +0.25 we already have more trustworthy and visible."

### Risk of over-engineering the format

Strand v3 is already the product of 14 experiments and iterative refinement. The format is 96% self-documenting (Exp 8). Adding more notation systems or section types increases cognitive load for both the LLM consumer and human reviewers.

The compact format (+0.07) is real but small. Spending engineering effort on format tweaks has lower ROI than spending it on analysis quality (which drives the +0.25) or trust fixes (which determine whether users see the value at all).

### The honest summary

Strand's value is real but concentrated. It is essential for change-safety tasks (no alternative provides cascade analysis), valuable for architecture/debugging/planning, and marginal for simple inventory/refactoring. The path forward is not "prove strand is better at everything" but "make strand undeniably superior at the things only it can do, and trustworthy enough that users discover those things before bouncing."

The priorities reflect this: fix trust first (P0), deepen the moat (P1), then prove it to skeptics (P2).
