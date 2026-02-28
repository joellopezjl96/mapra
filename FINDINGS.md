# Strand Experiment Findings

Research log tracking what we've learned about encoding codebases for LLM consumption.

**Project:** Strand — codebase cartography for AI
**Target codebase:** SenorBurritoCompany (Next.js 14, 289 files, 49,966 lines, 27 modules)
**Model:** claude-sonnet-4-20250514 (1024 max tokens)
**5 standard questions:** inventory (Q1), analysis (Q2), navigation (Q3), architecture (Q4), dependency (Q5)

---

## Experiment 1: Visual vs. Text

**Date:** 2026-02-27
**File:** `experiments/visual-vs-text.ts` (same file, conditions 1-2)
**Results:** `experiments/output/experiment-results.json`

### Conditions

| # | Condition | Description |
|---|-----------|-------------|
| 1 | Visual Only | Single combined SVG→PNG with shapes, colors, connections |
| 2 | Text Only | Structured YAML-like text with explicit metrics |

### Token Costs

| Condition | Input | Output | Total |
|-----------|-------|--------|-------|
| Visual Only | 8,654 | 1,650 | **10,304** |
| Text Only | 13,674 | 2,830 | **16,504** |

### Key Findings

- **Text crushes visual on factual accuracy.** Visual said "12-15 API routes" (actual: 36). Text listed all 36 with HTTP methods.
- **Visual can't read its own labels.** 7px text in rasterized PNG is unreadable. The model admitted it couldn't extract file names or route paths.
- **Visual gives qualitative spatial intuition.** For Q2, visual correctly identified `app` as architecturally complex based on density and centrality — a judgment that's arguably more useful than text's "most lines" answer.
- **Text is necessary for actionable answers.** Q3 (payment flow trace) was useless from visual — generic shape descriptions. Text named specific files with line counts.

### Verdict

**Text is the minimum viable encoding.** Visual alone is not useful for structural questions. But visual gave spatial intuition that text lacks — suggesting a hybrid approach.

---

## Experiment 2: Multi-Layer Topographic

**Date:** 2026-02-27
**File:** `experiments/visual-vs-text.ts` (conditions 1-5)
**Results:** `experiments/output/experiment-2-results.json`

### Conditions

| # | Condition | Description |
|---|-----------|-------------|
| 1 | Text Only | Same as Exp 1 |
| 2 | Single Visual | Same as Exp 1 |
| 3 | 3-Layer Topographic | Terrain + Infrastructure + Labels as 3 separate PNGs |
| 4 | Terrain + Text | Terrain PNG + structured text |
| 5 | Terrain + Infrastructure | Layers 1+2 only, no text labels |

### Token Costs

| Condition | Input | Output | Total | vs Text |
|-----------|-------|--------|-------|---------|
| Text Only | 13,674 | 2,729 | **16,403** | baseline |
| Single Visual | 8,654 | 1,754 | **10,408** | -36.6% |
| 3-Layer | 24,624 | 2,413 | **27,037** | +64.8% |
| Terrain + Text | 21,829 | 3,054 | **24,883** | +51.7% |
| Terrain + Infra | 16,509 | 2,331 | **18,840** | +14.9% |

### Key Findings

- **3-Layer is the worst condition.** Most expensive AND most inaccurate. Hallucinated fake route names on Q1 ("api/products", "api/customers" — don't exist), fake payment providers on Q3 ("Stripe, PayPal" — it's Authorize.net), and fake file names on Q5. The Labels layer (7px text in PNG) gave the model just enough pixels to confabulate.
- **Terrain + Text is the best hybrid.** Correct on all factual questions (text provides ground truth), plus unique cross-modal insights. On Q5, it cross-referenced terrain dots with dependency data: "the most depended-on files appear as small green dots — low complexity files, which is architecturally ideal." This insight requires both modalities.
- **Images without text cause hallucination.** Both 3-Layer and Terrain+Infra hallucinated specific details (route names, file names) they couldn't actually read. Single Visual was more honest ("I can see approximately...").
- **Terrain adds real value over text alone.** On Q2, Terrain+Text used the complexity spirals to confirm quantitative rankings. On Q4, it cross-referenced visual density patterns with module statistics.

### Verdict

**Terrain + Text wins.** The terrain PNG provides spatial/complexity intuition; the text provides factual ground truth. Never send labels as images — text is better for labels. The key insight: **the right medium for the right data** (pixels for patterns, tokens for facts).

### Hallucination Risk Matrix

| Condition | Hallucinated? | Pattern |
|-----------|--------------|---------|
| Text Only | Never | Has ground truth |
| Single Visual | No | Admits limitations |
| 3-Layer | **Yes — Q1, Q3, Q5** | Blurry text → confabulation |
| Terrain + Text | Never | Text provides ground truth |
| Terrain + Infra | **Yes — Q1** | No text → fills in gaps |

---

## Experiment 3: Text-Native Spatial Formats

**Date:** 2026-02-27
**File:** `experiments/experiment-3-formats.ts`
**Results:** `experiments/output/experiment-3-results.json`

### Hypothesis

Terrain+Text is the best encoding (Exp 2), but PNG is the wrong medium for half the job. Can we get spatial reasoning WITHOUT images?

### Conditions

| # | Condition | Description | Encoding size |
|---|-----------|-------------|---------------|
| 1 | Text Only | Baseline structured text | 6.7 KB |
| 2 | Terrain + Text | Exp 2 winner (PNG + text) | 189.5 KB + 6.7 KB |
| 3 | Spatial Text | Text with @(x,y) coordinates from layout engine | 9.3 KB |
| 4 | .strand Format | ASCII art heatmap (█▓░·) + box-drawing deps + compact data | 4.8 KB |

### Token Costs

| Condition | Input | Output | Total | vs Text |
|-----------|-------|--------|-------|---------|
| Text Only | 13,674 | 3,047 | **16,721** | baseline |
| Terrain + Text | 21,829 | 2,964 | **24,793** | +48.3% |
| Spatial Text | 20,289 | 3,223 | **23,512** | +40.6% |
| .strand Format | 8,779 | 2,539 | **11,318** | **-32.3%** |

### Key Findings

- **.strand is the cheapest encoding tested across all 3 experiments** — 32% cheaper than plain text, 54% cheaper than Terrain+Text. The ASCII heatmap and compact format pack information denser than verbose text listings.
- **Spatial Text coordinates work.** On Q4, the model used @(x,y) coordinates to describe spatial layout: "Top Row — Core Application Logic @(60-1320, 60)" vs "smaller utility modules at y=430+." This is genuine 2D reasoning from numbers alone.
- **.strand's ASCII heatmap gave complexity intuition comparable to terrain PNG.** On Q2, .strand cited the `█░········` bar to identify `__tests__` as most complex — same conclusion as Terrain+Text which used actual contour visualizations.
- **Q1 limitation:** .strand only showed 12 of 36 routes (by design — compact format truncates). It correctly stated the total count but couldn't enumerate all routes. This is a trade-off of the compact design.
- **Q3 weakness:** .strand misidentified some payment flow entry points (listed `catering/page.tsx` and `spirit-night/page.tsx` as payment entry points). The compact format loses some relational context between files.
- **Spatial Text didn't justify its cost.** At +40.6% vs text, the spatial coordinates added moderate value (Q4 spatial reasoning) but not enough to justify nearly matching Terrain+Text's cost. The coordinates are information-dense but verbose.

### The .strand Trade-off

| Metric | .strand | Text Only | Terrain+Text |
|--------|---------|-----------|--------------|
| Token cost | **Best** (11.3K) | Mid (16.7K) | Worst (24.8K) |
| Factual accuracy | Good (count correct, some Q3 errors) | **Best** (no errors) | **Best** (no errors) |
| Cross-modal insight | Moderate (ASCII patterns) | None | **Best** (pixel+text fusion) |
| Compact enough for system prompts | **Yes** (~1.2K tokens) | Borderline (~1.7K) | No (image required) |

---

## Cross-Experiment Patterns

### What works

1. **Text is non-negotiable.** Every condition with structured text got factual questions right. Every condition without text either failed or hallucinated.
2. **Complexity visualization adds real value.** Whether terrain PNG, ASCII heatmap, or @(x,y) coordinates — giving the model spatial/complexity information produces richer architectural reasoning.
3. **The hybrid principle holds.** Best results come from pairing spatial intuition (any format) with factual ground truth (text). The medium for spatial can vary; the text must be present.

### What doesn't work

1. **Images with embedded text labels.** Rasterized text at small sizes → hallucination. The model tries to read blurry pixels and confabulates plausible-sounding but wrong details. (3-Layer was the worst performer across all experiments.)
2. **Images without any text anchor.** Visual-only conditions can't answer factual questions and hallucinate details when pushed.
3. **Coordinates without payoff.** Spatial Text costs 40% more than plain text for marginal gains. The coordinates are accurate but the model doesn't leverage them enough to justify the cost.

### Q2 Divergence: "app" vs "__tests__"

This question revealed a consistent divergence across all experiments:

| Said `app` | Said `__tests__` |
|------------|------------------|
| Visual Only (Exp 1) | Text Only (Exp 2) |
| Text Only (Exp 1, Exp 3) | Terrain+Text (Exp 2, 3) |
| Single Visual (Exp 2) | Spatial Text (Exp 3) |
| 3-Layer (Exp 2) | .strand (Exp 3) |
| Terrain+Infra (Exp 2) | |

**Pattern:** Conditions with complexity metrics (scores, heatmaps) say `__tests__` (largest by line count). Visual-only or less data-rich conditions say `app` (architecturally central). Text Only was inconsistent across experiments — non-deterministic even with identical encoding.

**What this means:** "Most complex" is ambiguous. By raw metrics, `__tests__` wins. By architectural significance, `app` wins. The terrain/heatmap conditions bias toward raw size; pure text leaves more room for interpretive judgment.

### Hallucination Risk

| Risk Level | Conditions | Pattern |
|------------|-----------|---------|
| **None** | Text Only, Terrain+Text | Text provides verifiable ground truth |
| **Low** | Single Visual, .strand | Admits limitations or minor inaccuracies |
| **High** | 3-Layer, Terrain+Infra | Blurry/absent text → fills in plausible-sounding fakes |

**Rule: Never give the model almost-readable visual text.** It's worse than no text at all. Crisp, structured text or nothing.

---

## Experiment 4: .strand v2 Validation

**Date:** 2026-02-28
**File:** `experiments/experiment-4-strand-v2.ts`
**Results:** `experiments/output/experiment-4-results.json`

### Hypothesis

.strand v1 had two known weaknesses: Q1 (route truncation — only 12 of 36 routes enumerable) and Q3 (payment flow misidentification — catering/spirit-night listed as payment entry points, cluster-pos/client missing). Can v2 fix these without regressing Q2/Q4/Q5?

### Design Improvements Over Previous Experiments

1. **Same scan for all conditions** — v1 and v2 encodings generated from one `scanCodebase()` call (no codebase-drift confound)
2. **Frozen v1 encoder** — imported from `strand-format-encode-v1.ts`, not loaded from a saved file
3. **Uniform prompts** — identical template for all conditions, no domain priming
4. **3 trials per condition-question** — surfaces non-determinism (45 API calls total)
5. **Automated scoring rubrics** — ground-truth checks for Q1 (route count) and Q3 (correct files, false positives)

### Conditions

| # | Condition | Description | Encoding Size |
|---|-----------|-------------|---------------|
| 1 | Text Only | Baseline structured text | 6.7 KB (~1,726 tokens) |
| 2 | .strand v1 | Frozen v1 encoder (same graph) | 5.4 KB (~1,381 tokens) |
| 3 | .strand v2 | Uncapped routes/pages + FLOWS section | 10.0 KB (~2,566 tokens) |

v2 is +85.8% larger than v1 due to uncapped routes/pages and the new FLOWS section.

### Token Costs (averaged per 5-question run)

| Condition | Input | Output | Total | vs Text |
|-----------|-------|--------|-------|---------|
| Text Only | 13,874 | 2,965 | **16,839** | baseline |
| .strand v1 | 9,794 | 2,428 | **12,222** | -27.4% |
| .strand v2 | 16,839 | 2,813 | **19,652** | +16.7% |

### Q1 Scoring: Route Inventory

Ground truth: 36 API routes.

| Condition | Stated Count | Routes Enumerated | Agreement (3 trials) |
|-----------|-------------|-------------------|---------------------|
| Text Only | 36 | **36/36** | 3/3 |
| .strand v1 | 36 | **12/36** | 3/3 |
| .strand v2 | 36 | **36/36** | 3/3 |

**v1 problem:** Correctly stated "36 routes" (from section header) but could only enumerate the 12 shown, acknowledging "+24 more routes" were truncated. All 3 trials produced identical responses.

**v2 fix:** All 36 routes enumerated with correct HTTP methods across all 3 trials. Matches Text Only performance.

### Q3 Scoring: Payment Flow Navigation

Ground truth files: `orders/route`, `ordering`, `cluster-pos/client`
Known false positives: `catering/page`, `spirit-night/page`

| Condition | Correct Files | Missing | False Positives | Guessed Paths | Agreement |
|-----------|--------------|---------|-----------------|--------------|-----------|
| Text Only | 2-3/3 | cluster-pos (1 trial) | None | 3/3 trials | Moderate |
| .strand v1 | 2/3 | cluster-pos/client (all) | **catering, spirit-night** | 3/3 trials | High (same error) |
| .strand v2 | **3/3** | None | **None** | 1/3 trials | High |

**v1 problem:** Never found `cluster-pos/client`. Listed `catering/page` and `spirit-night/page` as payment entry points in all 3 trials — these are event pages, not payment processors. The v1 encoding had no way to show which files the orders route actually depends on, so the model guessed from file names containing payment-adjacent keywords.

**v2 fix:** FLOWS section explicitly maps `orders/route -> ordering, cluster-pos/client, authorize-net, price-validation, payment-emails`. All 3 trials named the correct files. None listed catering or spirit-night as payment entry points. The model also surfaced `authorize-net.ts`, `price-validation.ts`, and `payment-emails.ts` — real files that v1 never mentioned.

### Q2/Q4/Q5 Regression Check

| Question | Text Only | .strand v1 | .strand v2 | Regression? |
|----------|-----------|------------|------------|-------------|
| Q2 (analysis) | 2/3 "app", 1/3 "__tests__" | 3/3 "__tests__" | 3/3 "__tests__" | No |
| Q4 (architecture) | Comparable | Comparable | Comparable | No |
| Q5 (dependency) | Correct top deps | Correct top deps | Correct top deps | No |

No regressions detected. Q2 shows v1 and v2 are more consistent (always `__tests__`) than Text Only, which is non-deterministic on this question.

### Key Findings

1. **FLOWS fixes Q3 decisively.** v1 scored 2/3 correct files with false positives in every trial. v2 scored 3/3 with zero false positives. The FLOWS section gives the model explicit dependency data instead of forcing it to guess from file names.

2. **Uncapping fixes Q1 completely.** v1 could state the count but not enumerate. v2 enumerates all 36, matching Text Only. Trivial fix, large impact.

3. **v2 surfaces files invisible to v1.** `authorize-net.ts`, `price-validation.ts`, `payment-emails.ts` appeared in every v2 Q3 response. These are real, important payment files that v1 (and even Text Only) never mentioned because they're not in the HOTSPOTS or MOST IMPORTED sections — they only appear as dependencies in FLOWS.

4. **Cost trade-off is moderate.** v2 costs +16.7% vs Text Only and +61% vs v1. The encoding grew from 5.4 KB to 10.0 KB. For system prompt injection (~2.6K tokens), this is still viable but approaching the upper bound.

5. **No regressions on Q2/Q4/Q5.** v2 answers are comparable or more consistent than v1.

6. **Trial consistency is high.** Most condition-question pairs gave identical answers across all 3 trials. The main source of non-determinism is Text Only on Q2 (2/3 "app" vs 1/3 "__tests__").

### Verdict

**v2 achieves its goals.** Both target weaknesses (Q1 truncation, Q3 misidentification) are fixed without regressions. The cost increase is acceptable for the accuracy gains. The FLOWS section is the most impactful change — it provides relational context that no other section captures.

### The .strand v2 Trade-off (updated from Exp 3)

| Metric | .strand v1 | .strand v2 | Text Only |
|--------|-----------|-----------|-----------|
| Token cost | **Best** (12.2K) | Mid (19.7K) | Mid (16.8K) |
| Q1 route enumeration | Partial (12/36) | **Full (36/36)** | **Full (36/36)** |
| Q3 payment navigation | 2/3, false positives | **3/3, no FPs** | 2-3/3, guessed |
| Q3 file discovery | 2 files | **6 files** | 3 files |
| System prompt viable | **Yes** (~1.4K tokens) | Yes (~2.6K tokens) | Borderline (~1.7K) |

---

## Recommended Encodings

### For system prompts (context-constrained)

**.strand v2** — 2.6K tokens, fixes both known v1 weaknesses (route truncation, payment flow misidentification) while remaining viable for system prompt injection. The FLOWS section provides relational context no other encoding captures. Best for: always-on context injection where navigational accuracy matters.

**.strand v1** — 1.4K tokens, if budget is extremely tight. Accepts Q1/Q3 limitations for 46% fewer tokens than v2.

### For one-shot analysis

**Terrain + Text** — 25K tokens including image, but produces the richest answers with genuine cross-modal insights. Best for: deep architectural review, onboarding a model to a new codebase, when you want insights you wouldn't get from text alone.

### For factual queries

**Text Only** — 1.7K tokens, zero hallucination risk, consistently correct on all factual questions. Best for: "list all routes", "what files handle X", any question with a verifiable answer.

---

## Open Questions

1. **Does .strand scale?** Tested on a 289-file project. Would the compact format still be useful at 2,000 files? 10,000? v2 is already 10 KB at 289 files.
2. ~~**Can we improve .strand's relational context?**~~ **ANSWERED (Exp 4):** Yes. FLOWS section fixes Q3 completely — 3/3 correct files, zero false positives, and surfaces 3 additional payment files invisible to v1.
3. **Would a smarter terrain PNG help?** Current terrain uses SVG→PNG which loses fidelity. Would a purpose-built low-res heatmap (e.g., 400×300 pixels, large text labels) avoid the hallucination problem?
4. **Is the cross-modal insight from Terrain+Text reliable?** The "low-complexity files are most depended-on" observation was novel and correct, but n=1. Does it replicate across different codebases and questions?
5. ~~**Non-determinism in Text Only.**~~ **PARTIALLY ANSWERED (Exp 4):** 3-trial design confirms Q2 non-determinism in Text Only (2/3 "app", 1/3 "__tests__"). v1 and v2 are deterministic on Q2 (always "__tests__"). All other questions show high trial consistency across all conditions.
6. **Is v2's size growth sustainable?** v2 is +85.8% larger than v1 (5.4 KB → 10.0 KB). FLOWS contributes most of the growth. Could FLOWS be compressed (e.g., top-3 flows only) without losing accuracy?
7. **Does v2 generalize to other codebases?** Tested only on SenorBurritoCompany. Do the FLOWS heuristics (3-segment module IDs, keyword-based domain classification) work on projects with different structures?

---

## File Index

| File | Purpose |
|------|---------|
| `src/encoder/text-encode.ts` | Text-only encoder (baseline) |
| `src/encoder/encode.ts` | Single combined visual (Exp 1) |
| `src/encoder/layout.ts` | Shared layout engine (all layers) |
| `src/encoder/layer-terrain.ts` | Layer 1: complexity topography |
| `src/encoder/layer-infrastructure.ts` | Layer 2: data flow & dependencies |
| `src/encoder/layer-labels.ts` | Layer 3: precise details |
| `src/encoder/spatial-text-encode.ts` | Spatial text with @(x,y) coordinates |
| `src/encoder/strand-format-encode.ts` | .strand v2 ASCII art format (FLOWS + uncapped) |
| `src/encoder/strand-format-encode-v1.ts` | .strand v1 frozen encoder (experiment control) |
| `experiments/visual-vs-text.ts` | Experiment 1 & 2 runner |
| `experiments/experiment-3-formats.ts` | Experiment 3 runner |
| `experiments/experiment-4-strand-v2.ts` | Experiment 4 runner (v1 vs v2 validation) |
| `experiments/output/experiment-results.json` | Exp 1 raw results |
| `experiments/output/experiment-2-results.json` | Exp 2 raw results |
| `experiments/output/experiment-3-results.json` | Exp 3 raw results |
| `experiments/output/experiment-4-results.json` | Exp 4 raw results |
| `experiments/output/exp4-strand-v2.strand` | Exp 4 v2 encoding snapshot |
