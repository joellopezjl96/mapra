# Intra-Session Map Freshness Design

**Date:** 2026-03-02
**Status:** Draft
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
agent runs `strand impact auth.ts`. Output: "23 total affected." Agent adds unnecessary
defensive complexity to protect against a risk it already eliminated. v4's trust directive
makes this worse — the agent follows the output rather than questioning it.

**2. New files invisible to the manifest**
The hash manifest (v4) tracks mtimes of files that existed at generation time. New files
created during a session are not in the manifest. The freshness stamp shows "0 files
modified since" even as new modules with significant blast radius are created mid-session.

**3. `strand impact` reads stale graph**
The v4 design explicitly states: "Reads from `.strand` data — no re-scan, instant output."
Running `strand impact` after mid-session architectural changes returns cascade data from
the session-start snapshot.

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
- **Con:** Requires plan authors to insert checkpoints deliberately

### C — Commit-frequency enforcement
Solve by requiring frequent small commits. The pre-commit hook already handles regeneration.

- **Pro:** No new features needed
- **Con:** Changes developer workflow. Does not help sessions that span uncommitted work.
  Does not solve the "two versions in context" problem.

**Decision: B.** Explicit checkpoints are the right primitive. The plan is the natural
place to encode "this step changes the architecture, refresh the map before continuing."

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

**Implementation:** One `console.log` line added to `runGenerate()` in `src/cli/index.ts`
after the file is written. No other changes.

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
Run `strand update` then read the new `.strand`.
The fresh map supersedes the session-start version.
Verify blast radius for `auth-core.ts` before continuing.

### Step 5: Update importers
...
```

The `[CHECKPOINT]` tag is a visual marker for both the agent and the plan author.

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

The current CLAUDE.md trust directive:

> Treat .strand data as ground truth for structural facts (blast radius, complexity,
> import counts, test coverage).

Updated:

> Treat .strand data as ground truth for structural facts (blast radius, complexity,
> import counts, test coverage). If you have run `strand update` during this session
> and read the new file, that version supersedes the session-start version. Prefer
> the most recently read .strand in all decisions.

This gives the agent explicit permission to override the session-start `.strand` when
a fresh version is available — without undermining the general trust directive.

### 4. writing-plans convention update

The `writing-plans` skill (or plan template) should include a reminder:

> For steps that restructure architecture (file creation, deletion, module moves),
> add a `[CHECKPOINT]` step immediately after: run `strand update`, read the new
> `.strand`, then continue. The checkpoint ensures the map reflects the current
> architecture before consequential decisions.

This makes checkpoints the default for plan authors rather than something they have
to remember.

---

## What This Does Not Solve

**CHURN data lags commits.** `strand update` regenerates structural data immediately
but CHURN comes from `git log`. Uncommitted changes don't appear in CHURN until the
next commit. This is an acceptable limitation — CHURN is a historical signal, not a
current-state signal. It doesn't affect blast radius or cascade decisions.

**Context bloat from multiple reads.** If the agent runs `strand update` and reads
`.strand` three times in a long session, that adds ~10,500 tokens. This is the
correct trade-off: fresh data is worth the context cost when architecture is changing.
For sessions where no checkpoints are triggered, cost is zero.

**Automatic detection of "should I checkpoint now?"** This design requires plan
authors to insert checkpoints. An agent-driven heuristic ("I just created a new
file, should I regenerate?") is out of scope — it requires the agent to reason about
its own actions in a structured way that isn't reliably prompted today.

---

## Success Criteria

| Scenario | Before | After |
|---|---|---|
| Agent runs `strand impact` after mid-session refactor | Returns stale cascade chain, agent trusts it | Agent has run checkpoint, reads fresh data, correct cascade |
| New file created mid-session | Invisible to manifest, no blast radius | Plan checkpoint triggers regeneration, file appears in next scan |
| Long session with two .strand versions in context | Agent may prefer either | Supersession signal + trust directive carve-out → agent prefers newer |
| Plan author forgets checkpoint | Silently accumulates drift | writing-plans convention reminder prompts insertion |

---

## Scope

**In scope:**
- `strand update` supersession output line
- Trust directive update in CLAUDE.md template
- Plan checkpoint convention (`[CHECKPOINT]` tag + criteria)
- writing-plans reminder

**Out of scope:**
- Automatic checkpoint detection
- Mid-session CHURN refresh (requires commits)
- Deduplication of old `.strand` from context (not controllable from outside the LLM)
- `strand impact --live` (re-scan on each call) — valid v5 candidate
