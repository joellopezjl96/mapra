---
name: experiment-cycle
description: Guide the strand experiment iteration cycle. Use when running strnd batch, strand batch, strand analyze, --advise, --judge-check, --smart, iterating on experiment configs, checking diagnostics, comparing experiment runs, editing assertions or conditions, writing findings, or mentioning non-discriminating, flaky, redundant, Cliff's delta, win rate, trial variance, or FINDINGS.md.
---

# Experiment Cycle

Guide the strand batch experiment iteration cycle: RUN → DIAGNOSE → DECIDE → ADVISE → EDIT → RE-RUN → COMPARE → SHIP.

**Type:** Flexible. Identify where the user is in the cycle based on context, then guide from there. Do not force the full cycle sequentially.

## Entry Point Detection

- User mentions a config file (.json in experiments/configs/) → Start at RUN
- User mentions a results file (-results.json) → Start at DIAGNOSE
- User mentions two result files → Start at COMPARE
- User asks to edit/create assertions or questions → Start at EDIT
- User mentions FINDINGS.md or writing up → Start at SHIP
- User says "what should I change" or "iterate" → Start at ADVISE

## The Cycle

### 1. RUN

```
strand batch <config.json> [--smart] [--resume]
```

- **First run:** Don't use `--smart` — need full variance data
- **Subsequent iterations:** Use `--smart` to save money (stops early on unanimous verdicts)
- **If run fails partway:** Re-run with `--resume` to continue from checkpoint
- **Output path:** Results land in `experiments/experiments/output/` when config is in `experiments/configs/` (resolved relative to config dir, up one level, then `outputDir`)

### 2. DIAGNOSE

The batch runner auto-prints the free analysis report at the end. Or run manually:

```
strand analyze <results.json>
```

Free. Prints: condition stats, pairwise comparisons (Cliff's Delta + bootstrap CI), assertion diagnostics, budget waste estimate.

### 3. DECIDE

Check diagnostics against these thresholds:

| Signal | Threshold | Action |
|--------|-----------|--------|
| Budget waste | >20% totalSavingsPercent | Run --advise, prune before re-running |
| Non-discriminating | Any flagged | Rewrite assertions to test reasoning, not keywords |
| Flaky (CV > 0.5) | Any flagged | Assertion is ambiguous — rewrite it |
| Flaky (CV 0.3–0.5) | >2 flagged | Consider adding 2 more trials for statistical power |
| Redundant | Any flagged | Remove the redundant assertion |
| Negative signal | Any flagged | Investigate — more context may be hurting |
| Ceiling (all conditions >0.95) | Any question | Tighten assertions or retire question |
| High flaky + untrusted judge | — | Run --judge-check (~$0.02) to verify judge consistency |

**"Clean" means ready to ship:** 0 non-discriminating, 0 flaky, 0 redundant, <10% waste, no negative signals.

If clean → skip to SHIP.

### 4. ADVISE

```
strand analyze <results.json> --advise       # ~$0.05, Haiku-powered suggestions
strand analyze <results.json> --judge-check  # ~$0.02, judge consistency check
```

- `--advise`: Suggests assertion rewrites, condition changes, question suggestions
- `--judge-check`: Checks judge consistency and verdict bias
- Don't pay for --advise if diagnostics are already clean

### 5. EDIT

- **Copy the config to a new file before editing** (e.g., `my-experiment-v2.json`). Never edit the original after a run has completed — you need it for comparison.
- Apply assertion rewrites, condition changes, question adjustments from the advice
- This is judgment work — do not automate it

### 6. RE-RUN

```
strand batch <new-config.json> [--smart]
```

Same as step 1. `--smart` is recommended for iterations after the first run.

### 7. COMPARE

```
strand analyze <old-results.json> <new-results.json>
```

- **Argument order matters:** first file = baseline, second file = new run
- Check for regressions (score drops > 0.10) — investigate per-question before shipping
- A net improvement with regressions means something the old config handled well may be broken

### 8. SHIP

Write findings to `FINDINGS.md` at repo root using this template:

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
