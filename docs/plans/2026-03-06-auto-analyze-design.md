# Auto-Analyze + Experiment Cycle Skill Design

## Goal

Make `strand analyze` discoverable and integrated:
1. Auto-print the free analysis report after every `strand batch` run
2. A personal Claude Code skill that guides the experiment iteration cycle

## Part 1: Auto-Print After Batch

After `runBatch` writes JSON + markdown outputs (runner.ts ~line 305), add:

```typescript
import { analyzeResults, formatReport } from "./analyzer.js";

// 9. Auto-analyze
const report = analyzeResults(batchResults);
onProgress("\n" + formatReport(report));
```

Two lines. Always runs. Free. No flags, no config.

## Part 2: Experiment Cycle Skill

**Location:** `C:\dev\strand\.claude\skills\experiment-cycle.md`

**Type:** Flexible (reference map, not rigid checklist). Identify where the user is in the cycle and guide from there.

### Entry Point Detection

```
- User mentions a config file (.json in experiments/configs/) → Start at RUN
- User mentions a results file (-results.json) → Start at DIAGNOSE
- User mentions two result files → Start at COMPARE
- User asks to edit/create assertions or questions → Start at EDIT
- User mentions FINDINGS.md or writing up → Start at SHIP
- User says "what should I change" or "iterate" → Start at ADVISE
```

### The Cycle

#### 1. RUN
```
strand batch <config.json> [--smart] [--resume]
```
- First run: don't use `--smart` (need full variance data)
- Subsequent iterations: use `--smart` to save money (stops early on unanimous verdicts)
- If run fails partway: re-run with `--resume` to continue from checkpoint
- Output lands in `experiments/experiments/output/` (resolved relative to config dir)

#### 2. DIAGNOSE
Read the auto-printed analysis report (appended to batch output). Or run manually:
```
strand analyze <results.json>
```
Free. Prints condition stats, pairwise comparisons, assertion diagnostics, budget waste.

#### 3. DECIDE
Check diagnostics against these thresholds:

| Signal | Threshold | Action |
|--------|-----------|--------|
| Budget waste | >20% `totalSavingsPercent` | Run `--advise`, prune before re-running |
| Non-discriminating | Any flagged | Rewrite assertions to test reasoning, not keywords |
| Flaky (CV > 0.5) | Any flagged | Assertion is ambiguous — rewrite it |
| Flaky (CV 0.3-0.5) | >2 flagged | Consider adding 2 more trials for statistical power |
| Redundant | Any flagged | Remove the redundant assertion |
| Negative signal | Any flagged | Investigate — more context may be hurting |
| Ceiling (all conditions >0.95) | Any question | Tighten assertions or retire question |
| High flaky + untrusted judge | — | Run `--judge-check` (~$0.02) to verify judge consistency |

**"Clean" = ready to ship:** 0 non-discriminating, 0 flaky, 0 redundant, <10% waste, no negative signals.

If clean → skip to SHIP.

#### 4. ADVISE
```
strand analyze <results.json> --advise    # ~$0.05
strand analyze <results.json> --judge-check  # ~$0.02
```
- `--advise`: Haiku suggests assertion rewrites, condition changes, question suggestions
- `--judge-check`: Check judge consistency and verdict bias
- Don't pay for `--advise` if diagnostics are already clean

#### 5. EDIT
- **Copy the config to a new file before editing** (e.g., `my-experiment-v2.json`). Never edit the original after a run has completed — you need it for comparison.
- Apply assertion rewrites, condition changes, question adjustments
- This is judgment work — the skill does not automate it

#### 6. RE-RUN
```
strand batch <new-config.json> [--smart]
```
Same as step 1. `--smart` is recommended for iterations.

#### 7. COMPARE
```
strand analyze <old-results.json> <new-results.json>
```
- **Argument order matters:** first file = baseline, second file = new run
- Check for regressions (score drops > 0.10) — investigate per-question before shipping
- A net improvement with regressions means something the old config handled well may be broken

#### 8. SHIP
Write findings to `FINDINGS.md` at repo root. Minimal template:

```markdown
## Experiment N: <name> (<date>)

**Config:** `experiments/configs/<config>.json`
**Results:** `experiments/experiments/output/<name>-results.json`

### Conditions
| Condition | Mean | Cliff's Delta vs baseline |
|-----------|------|--------------------------|

### Key Findings
1. ...

### Implications
- ...
```

Commit config, results, and FINDINGS.md together.

### Trigger Description (for YAML frontmatter)

```
Guide the strand experiment iteration cycle. Use when running strnd batch, strand analyze, iterating on experiment configs, checking diagnostics, comparing experiment runs, editing assertions or conditions, or writing findings. Triggers on: batch, analyze, --advise, --judge-check, --smart, experiment config, results.json, assertions, diagnostics, non-discriminating, flaky, redundant, FINDINGS.md, Cliff's delta, win rate, trial variance.
```

## What This Does NOT Do

- No automation of config editing (judgment work)
- No automatic re-runs (experiments cost money)
- No gating or blocking
- No mention of `--apply` (not yet implemented)
