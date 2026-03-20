# Advanced Usage

## validate-plan

Cross-reference an implementation plan's file paths against your `.mapra` data. Catches stale files, high-cascade risks, dead code references, and missing conventions before you start coding.

```bash
mapra validate-plan docs/plans/my-feature.md
```

### Flags

- `--since YYYY-MM-DD` — only flag files modified after this date
- `--checkpoints` — warn if architectural changes lack `[CHECKPOINT]` steps (points where you should run `mapra update` mid-plan)

### Output sections

| Section | What it means |
|---------|---------------|
| STALE | Files modified recently — your plan may be working with outdated assumptions |
| HIGH CASCADE | Files with amplification >= 2.0 — changes here break more than you'd expect |
| MISSING CONVENTIONS | Plan adds files of a type that usually imports a shared anchor (e.g., API routes that should use a shared auth helper) |
| NEW FILES | Paths in the plan that don't exist yet (files the plan will create) |

### Example

```
STALE (modified in last 30 days):
  src/lib/ordering-server.ts
    6 commits, +585 -43 lines
    Last: "feat: pre-order core" (2026-03-05)
    RISK: [AMP] amp3.6 ×7→25 d4

HIGH CASCADE (amplification >= 2.0):
  src/lib/constants.ts
    RISK: [AMP] amp7.0 ×3→21 d3
    exports: ORDER_ONLINE_URL
    Tests: 5 files

SUMMARY: 1 stale, 1 high-cascade, 2 new files
```

## The .mapra Format

A `.mapra` file is plain text, designed to be read by both humans and LLMs. Here's what each part means.

### Header line

```
MAPRA v3 | myapp | Nextjs | 300 files | 53,081 lines | generated 2026-03-06T23:49:06
```

Format version, project name, detected framework, file/line counts, generation timestamp.

### LEGEND

```
LEGEND: ×N=imported by N files | ×A→B=A direct, B total affected | dN=cascade depth | [AMP]=amplification>=2x
```

Decodes the compact notation used throughout the file. The format is 96% self-documenting — the LEGEND handles the remaining edge cases.

### USAGE

```
USAGE: planning→RISK,CONVENTIONS | debugging→FLOWS,CHURN,HOTSPOTS | refactoring→RISK,CHURN
```

Tells the reader which sections matter for which task type. An AI agent doing a code review can skip to CONVENTIONS and RISK instead of reading everything.

### RISK

The most important section. Lists files where changes cascade broadly.

```
[AMP] amp3.6  ×7→25     d4   3mod  T4   src/lib/ordering-server.ts
  exports: PeriodAvailability
```

Reading this line:
- `[AMP]` — amplification >= 2x (hidden amplifier)
- `amp3.6` — each direct importer leads to 3.6 affected files on average
- `×7→25` — 7 direct importers, but 25 total files affected
- `d4` — cascade depth of 4 (changes propagate through 4 layers)
- `3mod` — spans 3 modules
- `T4` — 4 test files cover this
- `exports:` — the specific exports, so you know what interface changes would trigger the cascade

**Hidden amplifiers** are RISK's unique value. `ordering-server.ts` has only 7 direct importers — it wouldn't appear in a "most imported" list. But it affects 25 files. Without RISK, you'd miss this.

### CHURN

```
20 commits   +1159 -1011  src/app/api/orders/route.ts  "feat: pre-order core"
```

Files with the most activity in the last 30 days. High churn + high risk = the files that need the most attention during review.

### HOTSPOTS

```
0.79  src/batch/runner.ts       543L 13imp
```

Complexity score (0-1), line count, import count. Files above 0.3 are flagged. High-complexity files are harder to modify safely.

### INFRASTRUCTURE

Inter-module dependency roads — which modules depend on which, and how strongly coupled they are.

### TEST COVERAGE

```
18 test files | 12/57 testable files with direct test edges (21.1%)
```

How many source files have corresponding test files.

### CONVENTIONS

```
pattern: 18/22 API routes import { auth } from src/lib/auth.ts
```

Detected patterns — if most files of a type import a shared helper, this section surfaces it so new code follows the same pattern.

## CI / Automation

The `mapra check --fail-if-stale` command exits with code 1 when `.mapra` is out of date, making it ideal for CI gates and pre-commit hooks.

### GitHub Actions

```yaml
name: Check .mapra freshness
on: [pull_request]
jobs:
  mapra-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npx mapra check --fail-if-stale
```

### Pre-commit hook (via pre-commit framework)

```yaml
repos:
  - repo: local
    hooks:
      - id: mapra-freshness
        name: Check .mapra freshness
        entry: npx mapra check --fail-if-stale
        language: system
        pass_filenames: false
```

## Experiment Tooling

Mapra includes a batch experiment runner for systematically testing encoding effectiveness. This is primarily for mapra development, but available to anyone.

### Running experiments

```bash
mapra batch experiments/configs/my-experiment.json [--resume] [--smart]
```

- `--resume` — continue from checkpoint if a run was interrupted
- `--smart` — score trials inline and stop early when verdicts are unanimous (saves ~30-50% cost)

### Analyzing results

```bash
# Free analysis: stats, diagnostics, budget waste estimate
mapra analyze results.json

# Haiku-powered suggestions (~$0.05)
mapra analyze results.json --advise

# Judge consistency check (~$0.02)
mapra analyze results.json --judge-check

# Compare two runs (before/after iteration)
mapra analyze old-results.json new-results.json
```

### Analysis output

The analyzer produces:

- **Condition stats** — mean, stddev, min/max, verdict distributions per condition
- **Pairwise comparisons** — Cliff's Delta (effect size), bootstrap confidence intervals, win rates
- **Assertion diagnostics** — flags non-discriminating (zero signal), flaky (high variance), redundant (correlated), and negative-signal assertions
- **Budget estimate** — how much spend went to assertions that produced no useful signal

### Config format

Experiment configs are JSON files. See `experiments/configs/` for examples. Key fields:

```json
{
  "name": "my-experiment",
  "description": "What you're testing",
  "codebases": [{ "name": "myapp", "path": "/path/to/codebase" }],
  "conditions": [
    { "id": "full", "name": "Mapra full", "model": "claude-sonnet-4-6", "encoding": "mapra-v3" },
    { "id": "none", "name": "No context", "model": "claude-sonnet-4-6", "encoding": "none" }
  ],
  "questions": [
    {
      "id": "q1",
      "question": "What are the API routes?",
      "taskType": "inventory",
      "assertions": [
        { "description": "Lists routes", "check": "Response lists at least 10 API routes" }
      ]
    }
  ],
  "trials": 3,
  "maxTokens": 1024,
  "judgeModel": "claude-haiku-4-5-20251001"
}
```

Conditions can use `excludeSections` to test which sections matter:

```json
{
  "id": "no-risk",
  "name": "Without RISK",
  "model": "claude-sonnet-4-6",
  "encoding": "mapra-v3",
  "excludeSections": ["RISK"]
}
```
