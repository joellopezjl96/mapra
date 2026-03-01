# Experiment 8: .strand Format Comprehension Test

## Context

Experiments 1-7 tested whether the LLM gets correct *answers* when reading `.strand`. But a model can answer "what's the most imported file?" by picking the biggest number without understanding what `×51` means. If it doesn't truly comprehend the notation, it can't do complex reasoning (like combining RISK + MOST IMPORTED data). This experiment isolates comprehension: does the LLM understand the format, or just pattern-match?

This also tests whether adding a **LEGEND** section improves comprehension — directly informing the "should we add a legend to .strand?" design decision.

## Broader Strategic Context

This session also established key product decisions:

1. **Strip `.strand` to navigation-only** — remove RISK, DEAD CODE, TEST COVERAGE from the committed file. These are security risks (the RISK section is essentially a pentest recon report) and not core to the navigation identity.
2. **Move analysis to on-demand skills** — RISK, dead code, test coverage become CLI subcommands (`strand risk`, `strand dead-code`, `strand test-coverage`) and Claude Code slash commands.
3. **Product identity: "a map for LLMs to navigate codebases"** — not an audit tool. Ship the map free, analysis skills are premium.
4. **Clean `[AMP]` markers from FLOWS** — the security analyst noted FLOWS leaks RISK data via amplification-based hub selection. Strip this too.
5. **Format adoption is the moat** — open-source the generator, standardize the format, get `.strand` into public repos.
6. **Add a LEGEND** (pending this experiment's results) — cartographic history shows standardized legends transformed map usability. Test whether this applies to LLM consumption.

### DX Priorities (from subagent feedback)

- P0: Remove `sharp` from runtime deps (blocks installs)
- P0: Move `@anthropic-ai/sdk` to devDependencies
- P0: Make `npx strand` (no subcommand) the default that does setup+generate+init
- P1: Add analysis subcommands (`strand risk`, `strand dead-code`, etc.)
- P1: Wire slash command hints into CLAUDE.md
- P1: Add `--if-stale` flag + pre-commit hook for freshness

## Conditions (2)

| ID | Description |
|----|-------------|
| `strand-bare` | .strand v2+Risk as-is (no legend) |
| `strand-legend` | Same encoding with a LEGEND line after the header |

**LEGEND text:**
```
LEGEND: ×N=imported by N files | █▓░·=complexity high→low | ═/·=coupling strong/weak | ×A→B=A direct, B total affected | dN=cascade depth | [AMP]=amplification≥2x | NL=lines of code
```

## Questions (8)

### Tier A: Definitional (does the LLM know what notation means?)

| Q | Question | Key rubric checks |
|---|---------|-------------------|
| Q1 | "What does `×N` (e.g., `×51`) represent in MOST IMPORTED?" | Must say: other files import this file; N is the count |
| Q2 | "What's the difference between `▓░········` and `··········` in TERRAIN?" | Must say: bars = complexity levels; dense = higher, dots = lower |
| Q3 | "Explain each component of `[AMP] amp20.0 ×1→20 d3 1mod` from RISK" | Must parse all 5 components correctly |
| Q4 | "What's the difference between `═══════` and `·······` in INFRASTRUCTURE?" | Must say: coupling strength; thick = many deps, thin = few |

### Tier B: Applied (can the LLM use comprehension to reason?)

| Q | Question | Key rubric checks |
|---|---------|-------------------|
| Q5 | "Which module has highest complexity *relative to its size*?" | Must pick `src` (0.15, 7 files), NOT `pages` (most files) |
| Q6 | "If you modified PermissionConditionHelpers.tsx, what happens step by step?" | Must state: 1 direct, 20 total, depth 3, explain cascade |
| Q7 | "Which two modules are most tightly coupled? How many connections, what types?" | Must identify src→pages, ×251, rendering:213 + auth:38 |
| Q8 | "GenericAppConnectionFields is ×51 but NOT in RISK. PermissionConditionHelpers IS in RISK with amp20.0 but only ×1 direct. Explain why." | Must distinguish import count from cascade amplification |

## Scoring

Each response scored on two axes:

1. **Numeric score** — automated regex checks against rubric keywords (per-question, varying max scores)
2. **Comprehension classification:**
   - `COMPREHENDS` — hits all required keyword checks
   - `PARTIAL` — hits ≥50% of checks
   - `PATTERN_MATCH` — extracts data but doesn't demonstrate understanding

## Parameters

- **Target codebase:** Infisical frontend (same as Exp 5/6)
- **Model:** `claude-sonnet-4-20250514`
- **Trials:** 3 per condition-question
- **Total API calls:** 2 × 8 × 3 = **48 calls**
- **Max tokens:** 1024

## Implementation

Create `experiments/experiment-8-comprehension.ts` following the pattern from `experiments/experiment-5-generalization.ts`:
- Same imports (scanCodebase, analyzeGraph, encodeToStrandFormat)
- Same prompt template structure
- Same trial loop pattern
- Dynamic question generation: Q2/Q5 extract actual TERRAIN bars from the encoding
- Results → `experiments/output/experiment-8-results.json`
- Encoding snapshots → `experiments/output/exp8-strand-bare.strand` + `exp8-strand-legend.strand`

## Expected Output

```
COMPREHENSION MATRIX (3 trials per cell)
              strand-bare   strand-legend
Q1 (def)      ?/3           ?/3
Q2 (def)      ?/3           ?/3
Q3 (def)      ?/3           ?/3
Q4 (def)      ?/3           ?/3
Q5 (app)      ?/3           ?/3
Q6 (app)      ?/3           ?/3
Q7 (app)      ?/3           ?/3
Q8 (syn)      ?/3           ?/3
```

If LEGEND consistently improves Tier B scores, add a legend to the .strand format. If bare comprehension is already high, the format is self-documenting and no legend is needed.

## Hypotheses

- **H1:** Without a legend, the LLM comprehends ≥75% of Tier A (definitional) questions — the format is somewhat self-documenting via section headers.
- **H2:** The LEGEND provides a larger boost on Tier B (applied) than Tier A — application requires precise notation understanding that context clues alone may not provide.
- **H3:** Q8 (cross-section synthesis) has the lowest comprehension rate in both conditions — it requires combining two notation systems.
- **H4:** The LEGEND costs <5% additional tokens (~50 tokens) — negligible overhead.
