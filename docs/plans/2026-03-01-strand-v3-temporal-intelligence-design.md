# Strand v3 — Temporal + Symbol-Level Risk Intelligence

**Date:** 2026-03-01
**Status:** Draft
**Evidence:** Side-by-side transcript analysis of Claude Code sessions on SBC codebase (with/without .strand)

---

## Problem Statement

Strand v2 proved that structural metadata changes the *category* of LLM reasoning — from navigation (finding files) to analysis (evaluating risk). Two transcripts on the same codebase with the same task showed:

| Dimension | Without Strand | With Strand |
|---|---|---|
| Tool calls | 35 (3m 1s) | 17 (1m 5s) |
| Conclusion quality | "Plan is ready to execute" (premature) | "Plan needs revision — 5 new systems it doesn't account for" (correct) |
| Risk awareness | None — produced a file inventory | Cascade-aware — "23 files affected, 4 levels deep" |

But even with strand, the agent still needed:

1. **`git log --stat`** to detect what changed since the plan was written (strand has no temporal data)
2. **File reads** to discover architectural conventions the plan predates (React Email, Sentry, auth redirects, idempotency keys)
3. **Grepping** to identify which exported symbols drive cascade risk (strand shows file-level risk, not symbol-level)

These three gaps represent the remaining tool calls the agent made despite having the encoding. Closing them moves strand from "reduces exploration by 50%" to "eliminates exploration for plan validation entirely."

---

## Phase 1 — Wire Existing Data to RISK (no scanner changes)

The scanner already captures `StrandNode.exports: string[]` and `edge.type === "tests"`. Neither is surfaced in the RISK section. This is pure wiring.

### 1.1 Export Symbols on RISK Entries

**Current RISK output:**
```
[AMP] amp3.3 ×7→23  d4  3mod  src/lib/teacher-club/ordering-server.ts
```

**Proposed:**
```
[AMP] amp3.3 ×7→23  d4  3mod  src/lib/teacher-club/ordering-server.ts
  exports: hasOrderedToday, getPeriodAvailability, getOrderCountsByPeriod, getNowInCT
```

**Why:** In transcript 2, the agent used the RISK data to say "touching ordering-server.ts cascades through 23 files" — but then had to grep separately to find that `hasOrderedToday()` was the specific export being renamed. With export names inline, the agent can reason about *which refactors are dangerous* without any file reads.

**Implementation:**
- In `renderRisk()`, after each RISK line, look up the node's `exports` array from `graph.nodes`
- Only emit for top RISK entries (already capped at 8)
- Truncate to 5 exports max per line (avoid bloat on barrel files)
- Skip if exports array is empty

**Token cost:** ~8-16 lines added to encoding (~30-60 tokens)

### 1.2 Per-File Test Coverage on RISK Entries

**Current:** Global aggregate only:
```
─── TEST COVERAGE ───────────────────────────────────────
12 test files | 8/47 testable files with direct test edges (17.0%)
```

**Proposed:** Inline annotation on RISK rows:
```
[AMP] amp3.3 ×7→23  d4  3mod  T3  src/lib/teacher-club/ordering-server.ts
      amp1.4 ×16→23  d3  2mod  T0  src/lib/teacher-club/ordering.ts
```

Where `T3` = 3 test files cover this node, `T0` = untested.

**Why:** When evaluating "is it safe to rename `hasOrderedToday()`?", knowing the file has 3 test files covering it is the difference between "proceed with confidence" and "write tests first." The agent in transcript 2 had no way to assess this from the encoding.

**Implementation:**
- In `renderRisk()`, count edges where `edge.type === "tests"` and `edge.to === riskNode.nodeId`
- Emit as `T{count}` column, 4 chars wide
- Zero scanner changes — test edges already exist

**Token cost:** ~3-4 tokens per RISK entry (~24-32 tokens total)

---

## Phase 2 — Git Churn Integration (new scanner capability)

This is the biggest gap the transcripts exposed. The agent ran `git log --oneline --since="2026-02-25" --stat` as a dedicated tool call to detect codebase drift. With churn data in the encoding, that step disappears entirely.

### 2.1 Git Churn Scanner

**New file:** `src/analyzer/churn.ts`

**Interface:**
```typescript
export interface ChurnResult {
  nodeId: string;
  commits30d: number;      // commits touching this file in last 30 days
  linesAdded30d: number;   // net lines added
  linesRemoved30d: number; // net lines removed
  lastCommitHash: string;  // short hash of most recent commit
  lastCommitDate: string;  // ISO date of most recent commit
  lastCommitMsg: string;   // first line of most recent commit message
}
```

**Method:** Shell out to `git log --numstat --format="%h|%aI|%s" --since="30 days ago" -- <file>` for each file in the graph. Parse output to build per-file churn metrics.

**Performance concern:** Running git log per file is O(n). For large codebases (500+ files), this could be slow. Mitigation: run a single `git log --numstat --format=...` for the entire repo and parse the output once, then distribute results to nodes by path.

**Fallback:** If not in a git repo or git is unavailable, skip gracefully. Churn data is additive — the encoding works without it.

### 2.2 CHURN Section in Encoder

**New section** (positioned after RISK, before FLOWS):

```
─── CHURN (last 30 days, top movers) ─────────────────────
14 commits  +137 -594  src/app/api/teacher-club/orders/route.ts     "feat(tlc): add Sentry"
 8 commits  +265 -265  src/app/teacher-club/register/page.tsx        "feat(tlc): remove personalEmail"
 6 commits  +187 -282  src/lib/teacher-club/payment-emails.ts        "feat(tlc): React Email templates"
 0 commits            src/lib/teacher-club/ordering-server.ts       (unchanged 30d)
```

**Rules:**
- Show files with >= 3 commits in last 30 days (high churn)
- Also show files in RISK that have 0 commits (stable foundations — safe anchors)
- Cap at 10 entries
- Include last commit message (first line, truncated to 50 chars) — this tells the agent *what* changed without reading the file

**Token cost:** ~10-15 lines (~40-60 tokens)

### 2.3 Staleness Annotation on RISK Entries (optional)

If churn data is available, annotate RISK entries:

```
[AMP][14c] amp3.3 ×7→23  d4  3mod  T3  src/lib/teacher-club/ordering-server.ts
```

Where `[14c]` = 14 commits in last 30 days. This combines blast radius + velocity — a file that is both high-amplification AND frequently changing is the most dangerous to build plans around.

**Alternative:** Skip this. CHURN section + RISK section side-by-side may be sufficient without merging the data. Evaluate after implementation.

---

## Phase 3 — Convention Detection (new analyzer)

This is the highest-effort improvement but addresses the highest reasoning cost in the transcripts. The agent in transcript 2 discovered 5 conventions by reading git history and individual files:

1. 8/12 API routes use `Sentry.captureException()`
2. 5/5 email templates use `TlcEmailLayout.tsx`
3. 9/11 pages use `auth-redirect.ts`
4. 4/7 email sends use idempotency keys
5. `personalEmail` removed, `schoolEmail` is the replacement

The first 3 are detectable from import graph patterns. A convention is: **"a file imported by >60% of files of the same type."**

### 3.1 Convention Analyzer

**New file:** `src/analyzer/conventions.ts`

**Interface:**
```typescript
export interface Convention {
  anchorFile: string;       // the file that's conventionally imported
  anchorExports: string[];  // what symbols are imported from it
  consumerType: string;     // "api-route" | "route" | "component" etc.
  adoption: number;         // count of consumers that import it
  total: number;            // total files of that type
  coverage: number;         // adoption / total (0-1)
}
```

**Detection algorithm:**
1. Group all nodes by `type` (api-route, route, component, etc.)
2. For each type group, count how many nodes import each dependency
3. If a dependency is imported by >= 60% of nodes in a type group, it's a convention
4. Extract the anchor file's exported symbols that are actually used

**Edge case:** Barrel files (index.ts re-exports) should be resolved to the underlying file if possible, to avoid "convention: everyone imports index.ts."

### 3.2 CONVENTIONS Section in Encoder

```
─── CONVENTIONS ─────────────────────────────────────────
Pattern                           Coverage    Anchor
Sentry.captureException           8/12 api    src/instrumentation.ts
TlcEmailLayout                    5/5 emails  src/lib/teacher-club/emails/components/TlcEmailLayout.tsx
authRedirect                      9/11 pages  src/lib/teacher-club/auth-redirect.ts
```

**Position:** After FLOWS, before HOTSPOTS. Conventions tell the agent "new code of type X should import Y" — directly actionable for plan validation.

**Token cost:** ~5-10 lines (~20-40 tokens)

---

## Phase 4 — `strand validate-plan` Command (depends on Phase 2)

This automates the entire workflow from transcript 2. Instead of the LLM spending 17 tool calls and 70k tokens to cross-reference a plan against the codebase, a deterministic command produces the same output.

### 4.1 CLI Command

```bash
strand validate-plan <plan.md> [--since YYYY-MM-DD]
```

**Input:** A markdown file containing file path references (detected via backtick code spans or code blocks containing paths matching `src/...` or known project paths).

**Output:**
```
Plan references 12 files. Validation against current .strand:

STALE (modified since 2026-02-25):
  src/app/api/teacher-club/orders/route.ts
    14 commits, +137 -594 lines
    RISK: [AMP] amp3.3 ×7→23 d4
    Last: "feat(tlc): add Sentry error monitoring" (2026-02-28)

  src/lib/teacher-club/payment-emails.ts
    6 commits, +187 -282 lines
    RISK: low
    Last: "feat(tlc): React Email templates" (2026-02-27)

HIGH CASCADE (unchanged but dangerous):
  src/lib/teacher-club/ordering-server.ts
    0 commits (stable)
    RISK: [AMP] amp3.3 ×7→23 d4
    exports: hasOrderedToday, getPeriodAvailability
    Tests: 3 files

MISSING CONVENTIONS:
  Plan adds API route but doesn't import from src/instrumentation.ts (Sentry — 8/12 routes)
  Plan adds email template but doesn't reference TlcEmailLayout (5/5 emails)

SUMMARY: 4 stale files, 2 high-cascade targets, 2 missing conventions
```

### 4.2 Implementation Notes

**Markdown parser:** Extract file paths from:
- Inline code: `` `src/lib/teacher-club/ordering.ts` ``
- Code blocks containing file paths
- Task headers mentioning file modifications ("Modify: `src/...`")

**Cross-reference:** For each extracted path:
1. Look up in `.strand` RISK data (blast radius, amplification)
2. Look up in `.strand` CHURN data (commits since `--since` date)
3. Check against CONVENTIONS (does the plan's new code follow them?)
4. Report test coverage status

**Dependency:** Requires Phase 2 (churn data) for the STALE detection. Phases 1 and 3 enhance the output but aren't strictly required.

---

## Token Budget Impact

Current v2 encoding for SBC: ~3KB (~750 tokens).

| Phase | Added lines | Added tokens (est.) | Cumulative |
|---|---|---|---|
| Phase 1 (exports + test on RISK) | 8-16 | 30-60 | ~810 |
| Phase 2 (CHURN section) | 10-15 | 40-60 | ~870 |
| Phase 3 (CONVENTIONS section) | 5-10 | 20-40 | ~910 |
| Total | 23-41 | 90-160 | ~910 |

Well within the <3KB target. Phase 4 is a CLI tool (not encoding output), so zero token cost.

---

## Success Criteria

### Quantitative
- **Tool call reduction:** On the SBC pre-order plan validation task, strand v3 should require <= 5 tool calls (down from 17 with v2, 35 without strand)
- **Token efficiency:** Total encoding stays under 3KB
- **Accuracy:** validate-plan command output should match or exceed the agent's transcript 2 findings (4 stale files, 5 new systems, 3 open questions — the open questions come from reading the design doc, which is outside strand's scope)

### Qualitative
- Agent should be able to assess "is this plan still safe to execute?" from the encoding alone, without any `git log` or file reads
- Agent should flag missing conventions when reviewing plans that add new files of a typed category (API routes, pages, email templates)

---

## Implementation Order

```
Phase 1.1 (exports on RISK)     ← trivial, do first
Phase 1.2 (test cov on RISK)    ← trivial, do with 1.1
Phase 2.1 (git churn scanner)   ← core new capability
Phase 2.2 (CHURN section)       ← wire 2.1 to encoder
Phase 3.1 (convention analyzer) ← new analyzer
Phase 3.2 (CONVENTIONS section) ← wire 3.1 to encoder
Phase 4.1 (validate-plan CLI)   ← depends on 2.1, enhanced by 3.1
```

Phases 1 and 2 can ship independently. Phase 3 is independently valuable. Phase 4 ties them together.

---

## Decisions (resolved 2026-03-01)

1. **Churn window:** Fixed 30 days. No CLI flag. `validate-plan --since` handles plan-specific queries separately.

2. **Convention threshold:** 60% adoption. Best signal-to-noise tradeoff. Tune empirically after running on real codebases.

3. **Git performance:** Cap at `--since "30 days ago"`. Aligns with churn window. Fast regardless of repo size.

4. **validate-plan scope:** File paths only. Reliable, deterministic. Extract paths from backticks and code blocks, cross-reference against .strand data. No fuzzy symbol parsing.
