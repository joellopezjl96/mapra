# Experiment 6: Model Tiers Design

**Date:** 2026-02-28
**Hypothesis:** The .strand v2+Risk encoding pre-computes enough analytical work that Haiku 4.5 can match or beat Sonnet 4.6 on text-only for factual retrieval questions (Q1/Q3/Q5), at ~70% lower per-query cost.

---

## Three Conditions

| ID | Model | Encoding | Purpose |
|----|-------|----------|---------|
| `sonnet-text` | claude-sonnet-4-6 | Text Only | Control — what a developer uses today without .strand |
| `haiku-v2risk` | claude-haiku-4-5-20251001 | v2+Risk | Main hypothesis — cheapest model + best encoding |
| `sonnet-v2risk` | claude-sonnet-4-6 | v2+Risk | Reference ceiling — best model + best encoding |

**Key comparisons:**
- `haiku-v2risk` vs `sonnet-text` → does encoding enable full tier substitution?
- `haiku-v2risk` vs `sonnet-v2risk` → how much does Sonnet add over Haiku given the same encoding?

---

## Structure

**Target codebase:** Infisical frontend (`C:\dev\infisical\frontend`) — same as Exp 5 for direct comparison.

**Questions:** Same Q1–Q5 as Exp 5.

| ID | Type | Question |
|----|------|----------|
| Q1 | inventory | What are the main feature domains? How many files in each? |
| Q2 | analysis | What is the most complex part? What makes it complex? |
| Q3 | navigation | RBAC change — which files are highest risk? What's the blast radius? |
| Q4 | architecture | How is state management organized? What patterns? |
| Q5 | dependency | Which files would cause the most breakage if changed? |

**Trials:** 3 per condition-question = 45 API calls total.

**Scan:** Single `scanCodebase()` + `analyzeGraph()` call; all encodings generated from the same graph.

---

## Scoring Rubrics

### Q1 — Feature Domain Inventory
Ground truth: 8 domains (secrets, pki/cert, kms, ssh, pam, scanning, ai/mcp, org/admin).
Score: N/8 domains identified per trial.

### Q3 — RBAC Risk Navigation (updated rubric)
Ground truth files: `PermissionConditionHelpers` (amp 20.0), `roles/types`, `ProjectRoleModifySection`, `ConditionsFields`.
Score: N/4 correct files per trial. Also track: `GUESSED` (hedged language), `BLAST_AWARE` (mentions cascade/amplification).

### Q5 — High-Impact File Identification
Ground truth: `GenericAppConnectionFields` (×51), `secret-syncs/forms/schemas` (×46), `roles/types` (×51, amp 4.6).
Score: N/3 correct files per trial. Also track: `CASCADE_AWARE`.

---

## Output

### Per-question cost breakdown
Show input + output tokens per condition per question — not just totals. This reveals which questions Haiku wins on and which Sonnet earns its cost.

### Cost-efficiency metric
`score / total_tokens` per condition — normalises quality against cost.

### Summary table
```
Question | sonnet-text | haiku-v2risk | sonnet-v2risk | Haiku wins?
Q1       | 3/8         | ?/8          | ?/8           | ?
Q2       | correct     | ?            | ?             | ?
Q3       | 2/4         | ?/4          | ?/4           | ?
Q4       | pattern     | ?            | ?             | ?
Q5       | 2/3         | ?/3          | ?/3           | ?
```

### Outputs
- `experiments/output/experiment-6-results.json`
- `experiments/output/exp6-strand-v2-risk.strand` (encoding snapshot)
- Console scoring rubric output
- FINDINGS.md section: "Experiment 6: Model Tiers"

---

## Success Criteria

| Criterion | Definition |
|-----------|------------|
| Tier substitution confirmed | `haiku-v2risk` Q3 score ≥ `sonnet-text` Q3 score |
| Tier substitution strong | `haiku-v2risk` total score ≥ `sonnet-text` total score AND cost < 50% of `sonnet-text` |
| Sonnet earns cost on Q4 | `sonnet-v2risk` Q4 response demonstrably richer than `haiku-v2risk` Q4 |
| Haiku ceiling found | Identify which question type(s) Haiku consistently underperforms |

---

## File to Create

`experiments/experiment-6-model-tiers.ts` — new experiment runner, modelled on `experiment-5-generalization.ts`.
