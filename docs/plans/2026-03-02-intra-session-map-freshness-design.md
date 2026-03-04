# Intra-Session Map Freshness Design

**Date:** 2026-03-02
**Updated:** 2026-03-03 (post-review)
**Status:** Draft → Revised
**Theme:** Keep .strand valid during active implementation, not just between sessions

---

## Problem Statement

v4 solves **inter-session staleness** — pre-commit and post-checkout hooks regenerate `.strand`
at commit boundaries. The trust directive tells the agent to treat `.strand` as ground truth.

But there is a second, more dangerous staleness window: **intra-session drift** — the gap between
when `.strand` was loaded at session start and the current architectural state after the agent
has made changes.

The agent is not just reading the map. It is building new roads while reading it.

### Why this is worse than inter-session drift

Inter-session drift is passive: time passes, others commit, you come back to a stale map.
The agent knows time has passed.

Intra-session drift is active: the agent itself creates the drift. It knows what it just
changed (conversation context). But `.strand` was loaded at session start and baked into
the top of the context. These two truth sources compete — and v4's trust directive
explicitly tells the agent to favor `.strand`.

### Concrete failure modes

**1. Phantom blast radius**
Agent refactors `auth.ts` in step 3, reducing blast radius from 23 → 8. In step 7,
the agent consults `.strand` RISK data and sees "×23 total affected." Agent adds unnecessary
defensive complexity to protect against a risk it already eliminated. The trust directive
makes this worse — the agent follows the data rather than questioning it.

**2. New files invisible to the manifest**
The hash manifest (v4) tracks mtimes of files that existed at generation time. New files
created during a session are not in the manifest. The freshness stamp shows "0 files
modified since" even as new modules with significant blast radius are created mid-session.

**3. `strand impact` will read stale graph (v4 — not yet implemented)**
The v4 toolbelt design proposes a `strand impact` command that reads from `.strand` data
with no re-scan. Once implemented, running `strand impact` after mid-session architectural
changes would return cascade data from the session-start snapshot. This failure mode does
not exist today but the checkpoint convention positions us correctly for when it ships.

**4. Two competing .strand versions in context**
If the agent does regenerate mid-session and reads the new file, the original `.strand`
content (from the CLAUDE.md `@.strand` directive) is still in context near the top.
The agent must reason "prefer the newer one" without being told to.

---

## Approaches Considered

### A — Automatic regeneration (agent-decided)
The agent decides when changes are significant enough to run `strand update`. No plan
structure changes needed.

- **Pro:** No workflow changes for plan authors
- **Con:** Unpredictable. The agent has no trigger and the trust directive actively
  suppresses the instinct to question `.strand`. In practice the agent will never do this.

### B — Explicit plan checkpoints (recommended)
Implementation plans include explicit `strand update` steps at architectural boundaries.
`strand update` emits a "supersedes prior context" line. The trust directive gets a
mid-session carve-out.

- **Pro:** Predictable, explicit, no new infrastructure, works with current tooling
- **Con:** Requires plan authors to insert checkpoints deliberately. Silent failure when
  omitted (mitigated by `validate-plan --checkpoints` — see Section 7).

### C — Commit-frequency enforcement
Solve by requiring frequent small commits. The pre-commit hook already handles regeneration.

- **Pro:** No new features needed
- **Con:** Changes developer workflow. Does not help sessions that span uncommitted work.
  Does not solve the "two versions in context" problem.

**Decision: B + enforcement tooling.** Explicit checkpoints are the right primitive,
but must be paired with automated validation to prevent silent drift from missing tags.

---

## Design

### 1. `strand update` emits a supersession signal

After regenerating, `strand update` prints a single line to stdout:

```
.strand regenerated (2026-03-02T14:22:10) — supersedes any prior .strand in context.
```

This gives the agent a clear, unambiguous signal that any `.strand` content loaded earlier
in the conversation is now stale. The agent reads this in conversation context and knows
to prefer the freshly read file.

**Implementation:** Add a `SUPERSESSION_MESSAGE` function to the existing
`src/cli/templates.ts` (alongside `CLAUDE_MD_SECTION`). Add one `console.log` call in
`runGenerate()` in `src/cli/index.ts` after the file write (line ~141). No other changes.

**Atomic write:** `runGenerate()` must write to `.strand.tmp` then `fs.renameSync()` to
`.strand`. This prevents concurrent readers (subagents, editors) from seeing a truncated
file mid-write. On Windows, `renameSync` over an existing file can fail if another process
holds a read handle — wrap in a retry with 100ms backoff (max 3 attempts).

### 2. Plan checkpoint convention

Implementation plans that include architectural restructuring steps MUST include an
explicit `strand update` step immediately after, before any subsequent steps that will
use `.strand` data for consequential decisions.

**Format:**

```markdown
### Step 3: Refactor auth module
Split `src/auth.ts` into `src/auth-core.ts` and `src/auth-utils.ts`.
Move token handling to `auth-utils.ts`.

### Step 4: Refresh map [CHECKPOINT]
Run `strand update` in the project root.
Then use the Read tool (or `cat .strand`) to load the full contents into context.
The fresh map supersedes the session-start version.
Verify blast radius for `auth-core.ts` before continuing.

### Step 5: Update importers
...
```

The `[CHECKPOINT]` tag is a visual marker for both the agent and the plan author.

**Concrete read instruction:** The checkpoint step must use the **Read tool** or
`cat .strand` to load file contents into conversation context. The `@.strand` directive
in CLAUDE.md is resolved only at session start and cannot be re-triggered mid-session.

**Disambiguation:** When multiple `.strand` versions exist in context, the agent should
compare the `generated` timestamp in the STRAND header line (e.g.,
`generated 2026-03-02T14:22:10`) and always prefer the one with the latest timestamp.

**When a checkpoint is required:**
- Any step that creates a new file that will be imported by multiple modules
- Any step that deletes or merges existing files
- Any step that restructures domain boundaries (moves files between modules)
- Any step that changes a high-RISK file (blast radius > 10)

**When a checkpoint is NOT needed:**
- Steps that only modify internals of an existing file without changing its exports
- Steps that add new files with no importers yet
- Brainstorming or analysis sessions (no writes occurring)
- Additive changes to leaf files (no downstream consumers)

### 3. Trust directive update

The current CLAUDE.md section (in `src/cli/templates.ts` `CLAUDE_MD_SECTION`) says:

> Before exploring files for any task — read .strand first. The USAGE line
> tells you which sections matter for your task type. Only open individual
> files when you need implementation details the encoding doesn't provide.

Updated `CLAUDE_MD_SECTION` adds a freshness carve-out:

> Before exploring files for any task — read .strand first. The USAGE line
> tells you which sections matter for your task type. Only open individual
> files when you need implementation details the encoding doesn't provide.
>
> If .strand has been regenerated during this session, always prefer the
> most recently read version. Compare the `generated` timestamp in the
> header line to identify which is newest.

This is a simpler formulation than "if you have run `strand update`" — it does not
require the agent to track self-referential state. It just says: prefer the latest.

**Implementation:** Edit the existing `CLAUDE_MD_SECTION` constant in
`src/cli/templates.ts`. Since `runInit()` already delegates to `applyStrandSection()`
which uses this constant, the change propagates automatically. The section-marker
infrastructure (`STRAND_MARKER_START`, `STRAND_MARKER_END`, `applyStrandSection()`)
is preserved untouched. Existing users running `strand init` will get an "upgraded"
action when the content between markers differs.

### 4. Project-local checkpoint convention

The `writing-plans` skill is a third-party plugin (`superpowers`) that will be
overwritten on updates. Instead, add the checkpoint convention to **CLAUDE.md** itself
so it persists with the project:

Add to `CLAUDE_MD_SECTION` (or as a separate project convention in CLAUDE.md):

> For implementation plans that restructure architecture (file creation, deletion,
> module boundary changes), add a `[CHECKPOINT]` step after: run `strand update`,
> read the new `.strand`, then continue.

This makes the checkpoint convention part of the project's own instructions, not
dependent on any external skill.

### 5. Subagent checkpoint protocol

When using subagent-driven development (dispatching parallel agents), checkpoints
have different semantics:

**Orchestrator responsibility:** The orchestrator agent runs `strand update` between
sequential dispatches when a prior subagent made architectural changes. The orchestrator
cannot update its own baked-in `.strand` context, but it can ensure the on-disk `.strand`
is fresh before the next subagent reads it.

**Subagent isolation:** Each subagent in a worktree operates on its own copy. If a
subagent makes architectural changes, it should run `strand update` before completing
so the orchestrator (or next subagent) gets fresh data.

**Parallel subagents:** When multiple subagents run concurrently on independent tasks,
no mid-flight checkpoint is needed. The orchestrator runs `strand update` once after
all parallel subagents complete, before dispatching the next batch.

**Plan format for subagent checkpoints:**

```markdown
### Task Group 1 (parallel)
- Task 1a: Implement auth-core module [Subagent A]
- Task 1b: Implement auth-utils module [Subagent B]

### Checkpoint: Refresh map after Task Group 1 [CHECKPOINT]
Orchestrator runs `strand update` and reads the new `.strand`.
Verify new modules appear in DOMAINS and RISK before dispatching Task Group 2.

### Task Group 2 (parallel)
- Task 2a: Wire importers to auth-core [Subagent C]
- Task 2b: Update tests [Subagent D]
```

### 6. `strand update` failure recovery

When `strand update` fails mid-session (e.g., scanner crashes on dangling imports
during a half-completed refactor):

1. The agent should **not block** on the failed checkpoint. Note the failure and continue
   with the awareness that `.strand` data is stale.
2. If the failure is due to broken imports from a partial refactor, complete the refactor
   step first, then retry `strand update`.
3. If retries fail, the agent should annotate its reasoning with "`.strand` is stale —
   structural decisions in this step are based on conversation context, not the map."

**Implementation:** `runGenerate()` currently calls `process.exit(1)` on error. When
invoked as `strand update` (not `strand generate`), it should print the error but
return rather than exit, so the calling agent session is not killed.

### 7. `validate-plan --checkpoints` enforcement

Extend the existing `validate-plan` command to detect missing checkpoints:

**Heuristic:** Parse plan steps for file-creation patterns (`Create:`, `create`, `new file`,
`split into`, `move to`, `delete`, `remove`, `merge`) and warn if no `[CHECKPOINT]` step
follows within the next 2 steps.

**Output:**

```
⚠ Step 3 creates new files (src/auth-core.ts, src/auth-utils.ts) but no [CHECKPOINT]
  follows before Step 5. Consider adding a checkpoint after Step 3.
```

This converts a forgettable convention into a checkable one. The existing plan-parser
infrastructure in `validate-plan` already cross-references plan steps against `.strand`
data, so this is a natural extension.

---

## What This Does Not Solve

**CHURN data lags commits.** `strand update` regenerates structural data immediately
but CHURN comes from `git log`. Uncommitted changes don't appear in CHURN until the
next commit. This is an acceptable limitation — CHURN is a historical signal, not a
current-state signal. Deleted files may still appear in CHURN until the deletion is
committed — agents should be aware of this.

**Context bloat from multiple reads.** If the agent runs `strand update` and reads
`.strand` four times in a long session, that adds ~14,000 tokens (~$0.20-0.40 at
Opus pricing). This is the correct trade-off for sessions with architectural changes.
For sessions where no checkpoints are triggered, cost is zero. If checkpoint frequency
exceeds 4 in a session, the agent should consider consolidating remaining steps to
reduce further reads.

**Deduplication of old `.strand` from context.** Not controllable from outside the LLM.
Mitigated by the timestamp-comparison directive and the supersession signal.

**Automatic checkpoint detection.** This design requires plan authors or validation
tooling to insert/flag checkpoints. A future enhancement could use filesystem watching
or post-action hooks to detect checkpoint-worthy changes automatically — this is a
natural candidate for a paid tier feature.

---

## Revenue and Moat Implications

**`strand impact --live` as a paid-tier upsell.** Free users experience the stale-data
pain with checkpoint-only freshness. Pro users get `strand impact --live` which re-scans
before answering. This is the most natural upsell because users will hit the failure mode,
understand why it matters, and want the fix.

**Mid-session checkpoints feed `.strand-history/`.** Each `strand update` during a session
is a sub-weekly temporal snapshot. Writing lightweight snapshots to `.strand-history/` on
each checkpoint turns table-stakes freshness into moat-building data that competitors
cannot retroactively replicate.

**Stale-data warnings in future `strand impact`.** When `strand impact <file>` is called
and `<file>` mtime is newer than `.strand` generation time, print a warning:
`"WARNING: <file> modified after .strand was generated. Run strand update for fresh data."`
One conditional check — catches the most dangerous failure mode automatically.

---

## Success Criteria

| Scenario | Before | After |
|---|---|---|
| Agent consults RISK after mid-session refactor | Reads stale blast radius, agent trusts it | Agent has run checkpoint, reads fresh data, correct cascade |
| New file created mid-session | Invisible to manifest, no blast radius | Plan checkpoint triggers regeneration, file appears in next scan |
| Long session with two .strand versions in context | Agent may prefer either | Supersession signal + timestamp directive → agent prefers newer |
| Plan author forgets checkpoint | Silently accumulates drift | `validate-plan --checkpoints` warns about missing checkpoint |
| Subagent-driven session | Each subagent reads stale session-start .strand | Orchestrator runs checkpoint between task groups |
| `strand update` fails mid-refactor | Agent session killed by process.exit(1) | Error printed, agent continues with stale-data annotation |

---

## Scope

**In scope:**
- `strand update` supersession output line (add to existing `templates.ts`)
- Atomic write for `.strand` (write-to-tmp-then-rename)
- Trust directive update in existing `CLAUDE_MD_SECTION` constant
- Plan checkpoint convention (`[CHECKPOINT]` tag + criteria)
- Concrete read instructions (Read tool / `cat .strand`, not `@.strand`)
- Timestamp-based disambiguation for multiple `.strand` versions in context
- Project-local checkpoint convention in CLAUDE.md (not third-party skill)
- Subagent checkpoint protocol
- `strand update` failure recovery (return instead of exit)
- `validate-plan --checkpoints` enforcement mode

**Out of scope:**
- Automatic checkpoint detection via filesystem watching (paid tier candidate)
- Mid-session CHURN refresh (requires commits)
- Deduplication of old `.strand` from context (not controllable from outside the LLM)
- `strand impact --live` (re-scan on each call) — paid tier candidate
- Session-aware `.strand` with DELTA annotations (paid tier candidate)
