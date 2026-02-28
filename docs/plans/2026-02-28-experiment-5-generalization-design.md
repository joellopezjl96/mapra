# Experiment 5: .strand Generalization + Blast Radius Test

## Goal

Test two hypotheses:
1. **.strand generalizes** — does it help LLMs understand an unfamiliar codebase (Infisical) better than plain text?
2. **RISK section adds value** — does blast radius data improve LLM answers about change impact?

## Target Codebase

**Infisical frontend** (`C:\dev\infisical\frontend`) — Vite + React SPA for secrets management.
- 3142 files, 347K lines, 2934 edges
- TanStack Router (file-based), TanStack Query for server state, React Context, Zustand
- No API routes (pure SPA) — FLOWS section will be empty, testing graceful degradation
- 8+ feature domains: secrets, PKI/certs, KMS, SSH, PAM, secret-scanning, AI/MCP, org/admin

## Conditions

| ID | Format | Analysis | Purpose |
|----|--------|----------|---------|
| text | `encodeToText(graph)` | None | Baseline |
| v2 | `encodeToStrandFormat(graph)` | None | .strand without blast radius |
| v2+risk | `encodeToStrandFormat(graph, analysis)` | Yes | .strand with RISK section |

All encodings from same `scanCodebase()` call. Uniform prompts. 3 trials. 45 total API calls.

## Questions & Ground Truth

### Q1 — Inventory
"What are the main feature domains in this project? How many files are in each?"

Ground truth: 8+ domains. Modules: pages (1735 files), hooks (652), components (619).
Scoring: count correctly identified domains against keywords.

### Q2 — Analysis
"What is the most complex part of this project? What makes it complex?"

Ground truth: routeTree.gen.ts (complexity 1.0, 8791L, 250 imports). Meaningful hotspots: OverviewPage.tsx (2023L), ProjectRoleModifySection.utils.tsx (2900L).
Scoring: manual review — does it distinguish auto-generated from real complexity?

### Q3 — Navigation/Risk
"If I need to change the role-based permissions system (RBAC), which files are highest risk to modify? What's the blast radius?"

Ground truth: hooks/api/roles/types.ts (51 affected, depth 5, amp 4.6), ProjectRoleModifySection.utils.tsx (28 affected, depth 3, amp 3.5), ConditionsFields.tsx (19 affected).
Scoring: correct files named, hallucination detection.

### Q4 — Architecture
"How is state management organized in this project? What patterns does it use?"

Ground truth: TanStack Query (hooks/api/), React Context (7 providers), Zustand for batch edits.
Scoring: identifies hook-based API pattern, mentions context providers.

### Q5 — Dependency
"Which files would cause the most breakage if changed? Why?"

Ground truth: GenericAppConnectionFields.tsx (52 affected), secret-syncs/forms/schemas/index.ts (46), roles/types.ts (51 affected, amp 4.6).
Scoring: names high-impact files, explains cascade.

## Automated Scoring

| Q | Metric | Method |
|---|--------|--------|
| Q1 | Domains identified | Regex match against domain keywords |
| Q3 | Correct risk files | Check for roles/types, ProjectRoleModifySection, ConditionsFields |
| Q3 | Hallucinations | Flag hedging language |
| Q5 | High-impact files | Check for top 3 blast radius files |
| Q5 | Cascade understanding | Check for transitive/cascade/blast-radius keywords |

## Implementation

File: `experiments/experiment-5-generalization.ts`
Model: claude-sonnet-4-20250514
Output: `experiments/output/experiment-5-results.json`
