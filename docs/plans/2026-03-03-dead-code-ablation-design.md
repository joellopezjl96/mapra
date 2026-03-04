# Dead Code Section Ablation Design

**Date:** 2026-03-03
**Status:** Approved
**Theme:** Determine whether the DEAD CODE section in .strand v3 carries LLM signal before investing in fixes

---

## Problem Statement

The DEAD CODE section in .strand v3 outputs a single count line (`N unreachable files`)
computed by finding nodes with zero inbound edges after excluding `route`, `api-route`,
`config`, `test`, `layout`, and `middleware` types.

The scanner's `classifyFile()` doesn't recognize several Next.js conventions
(`instrumentation`, `robots`, `sitemap`, `not-found`, `loading`, `global-error`),
standalone scripts, or barrel exports — so these fall through as `"utility"` and inflate
the dead code count.

In the SenorBurritoCompany codebase, 51 files were flagged but only 3-4 were genuinely
dead (~100 lines total). A session stress test showed the misleading count wasted 526
seconds and 73k tokens when an LLM tried to act on it.

Before investing in scanner fixes or format changes, we need to know: does this section
help the LLM at all?

## Experiment Design

Add one ablation condition to the existing `experiments/configs/section-ablation.json`
(exp 9):

```json
{
  "id": "no-dead-code",
  "name": "No DEAD CODE",
  "model": "claude-sonnet-4-6",
  "encoding": "strand-v3",
  "includeUsageLine": true,
  "excludeSections": ["DEAD CODE"],
  "trials": 3
}
```

`buildEncoding()` in `src/batch/runner.ts` already supports `excludeSections` — it strips
matching `─── SECTION_NAME` blocks via regex. The DEAD CODE header
(`─── DEAD CODE: N unreachable files`) matches the pattern `─── DEAD CODE`.

This condition runs against the same 15 questions (3 planning, 2 debugging, 2 impact,
2 refactoring, 2 review, 2 inventory, 2 architecture) and same SBC codebase as all other
conditions. 3 trials per question = 45 API calls + 45 judge calls.

## Success Criteria & Decision Framework

Two possible outcomes:

**Outcome A — No signal:** `no-dead-code` scores within 5% of `full-v3` baseline across
all task types. Decision: deprioritize the section. Options range from removing it entirely
to renaming it to something honest like "ZERO-IMPORTER FILES" as a low-priority cosmetic
fix.

**Outcome B — Signal detected:** `no-dead-code` scores measurably lower on one or more
task types (likely planning or refactoring, where knowing "what's safe to ignore" narrows
the working set). Decision: the section earns its place, proceed to Phase 2:

1. Fix scanner `classifyFile()` to recognize more Next.js conventions (`not-found`,
   `loading`, `global-error`, `instrumentation`, `robots`, `sitemap`) and standalone
   scripts
2. Re-run the ablation with the improved scanner to confirm the signal holds with
   accurate data
3. Optionally test output format variants (count-only vs file listing) as a follow-up
   experiment

**Edge case — Mixed signal:** Helps on some task types, hurts on others. Decision:
consider making DEAD CODE conditional on the USAGE line task type, or keep it but with
reduced weight in the encoding.

## Scope & Non-Goals

**In scope:**
- One new condition in `section-ablation.json`
- Running the ablation experiment and analyzing results

**Out of scope (deferred pending results):**
- Scanner `classifyFile()` changes (adding `"script"`, `"entry-point"`, or new Next.js
  convention types)
- Expanding `SKIP_TYPES` in `src/analyzer/index.ts`
- Changing `renderDeadCode()` output format in `src/encoder/strand-format-encode.ts`
- Renaming the section header
- Adding dead-code-specific questions to the experiment (we test with existing questions
  to measure ambient contribution, not direct queries about dead code)

**Rationale for non-goals:** All of these are engineering effort that's wasted if the
section carries no signal. The experiment costs ~$1-2 in API calls and answers the
threshold question first.
