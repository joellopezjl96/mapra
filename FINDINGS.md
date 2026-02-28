# Strand Experiment Findings

Research log tracking what we've learned about encoding codebases for LLM consumption.

**Project:** Strand — codebase cartography for AI
**Target codebase:** SenorBurritoCompany (Next.js 14, 284 files, 49,834 lines, 25 modules)
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

## Recommended Encodings

### For system prompts (context-constrained)

**.strand format** — 1.2K tokens, 32% cheaper than text, good accuracy on most questions. The ASCII heatmap gives complexity intuition without an image. Best for: always-on context injection, large codebases where token budget matters.

### For one-shot analysis

**Terrain + Text** — 25K tokens including image, but produces the richest answers with genuine cross-modal insights. Best for: deep architectural review, onboarding a model to a new codebase, when you want insights you wouldn't get from text alone.

### For factual queries

**Text Only** — 1.7K tokens, zero hallucination risk, consistently correct on all factual questions. Best for: "list all routes", "what files handle X", any question with a verifiable answer.

---

## Open Questions

1. **Does .strand scale?** Tested on a 284-file project. Would the compact format still be useful at 2,000 files? 10,000?
2. **Can we improve .strand's relational context?** Q3 weakness (wrong payment entry points) suggests the compact format loses inter-file relationships. Could a "flows" section fix this?
3. **Would a smarter terrain PNG help?** Current terrain uses SVG→PNG which loses fidelity. Would a purpose-built low-res heatmap (e.g., 400×300 pixels, large text labels) avoid the hallucination problem?
4. **Is the cross-modal insight from Terrain+Text reliable?** The "low-complexity files are most depended-on" observation was novel and correct, but n=1. Does it replicate across different codebases and questions?
5. **Non-determinism in Text Only.** Q2 answer changed between experiments with identical encoding. How much variance exists in the factual answers? Should we run multiple trials?

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
| `src/encoder/strand-format-encode.ts` | .strand ASCII art format |
| `experiments/visual-vs-text.ts` | Experiment 1 & 2 runner |
| `experiments/experiment-3-formats.ts` | Experiment 3 runner |
| `experiments/output/experiment-results.json` | Exp 1 raw results |
| `experiments/output/experiment-2-results.json` | Exp 2 raw results |
| `experiments/output/experiment-3-results.json` | Exp 3 raw results |
