## Results: usage-line-routing

*sbc — 2026-03-05T04:46:41.442Z*

### Overall Scores by Condition

| Condition | Avg Score | Avg Tokens (in) | Avg Latency |
|-----------|-----------|------------------|-------------|
| Strand v3 (no USAGE) | 0.75 | 4,595 | 19.2s |
| Strand v3 + USAGE | 0.82 | 4,659 | 19.5s |

### Scores by Task Type

| Task Type | Strand v3 (no USAGE) | Strand v3 + USAGE |
|-----------|-----------|-----------|
| change-safety | 0.50 | 1.00 |
| debugging | 1.00 | 1.00 |
| impact | 1.00 | 1.00 |
| planning | 0.94 | 0.83 |
| refactoring | 0.33 | 0.50 |
| review | 0.75 | 0.58 |

### Per-Question Detail

<details><summary><strong>route-plan-1</strong> (planning) — Plan adding a weekly menu rotation feature. What modules are involved and what'…</summary>

**Strand v3 (no USAGE)**: avg 0.94 (trials: 0.83, 1.00, 1.00)
  + PASS: Response references blast radius, amplification, or cascade data (information from RISK section) — Response explicitly references blast radius and cascade data throughout (e.g., "×28 imported", "×7→25 affected", "d4 cascade depth", "amplification 4x", "20 commits"), with dedicated Risk Assessment section analyzing cascading impacts on 28 consumer files.
  ~ PARTIAL: Response mentions import conventions or patterns (information from CONVENTIONS section) — Response mentions some import conventions/patterns (e.g., "×51 (most imported file in codebase)", exports like `clearMenuCache`, `isMenuCacheValid`, `PeriodAvailability`) but doesn't systematically explain naming patterns, import organization conventions, or architectural patterns that would help predict dependencies.
  + PASS: Response mentions inter-module dependencies or coupling (information from INFRASTRUCTURE section) — Response extensively covers inter-module dependencies and coupling throughout (e.g., `ordering.ts` → 28 consumers, `ordering-server.ts` → 25 downstream files across 4 levels, `prisma.ts` → 51 imports affecting migrations globally, menu-cache invalidation requirements, order processing validation dependencies, pre-order spanning rotation boundaries).

**Strand v3 + USAGE**: avg 0.83 (trials: 0.67, 0.83, 1.00)
  + PASS: Response references blast radius, amplification, or cascade data (information from RISK section) — Response extensively references blast radius and cascade data. Explicitly mentions "×28 imported," "×25 affected files, d4 cascade depth," "×51 — most imported file," and uses "Merge conflicts likely; any logic error cascades broadly" and "type change touches 25 files automatically" to describe amplification effects.
  - FAIL: Response mentions import conventions or patterns (information from CONVENTIONS section) — Response does not mention import conventions or patterns. While it references specific files and their import counts, it does not discuss naming conventions, module organization patterns, or import statement styles that would typically be found in a CONVENTIONS section.
  + PASS: Response mentions inter-module dependencies or coupling (information from INFRASTRUCTURE section) — Response thoroughly addresses inter-module dependencies and coupling. Examples include: "Currently handles availability logic; rotation schedule must plug in here," "Exports `PeriodAvailability` — this type likely needs a `menuItems` or `rotationWeek` field added," "Migrations are low-risk to Prisma itself but the schema change propagates everywhere TypeScript types are inferred," and "Already passes `deliveryDate` when fetching pre-orders" showing how modules depend on each other.

</details>

<details><summary><strong>route-debug-1</strong> (debugging) — Orders are failing intermittently during lunch rush. Where should I look first?</summary>

**Strand v3 (no USAGE)**: avg 1.00 (trials: 1.00, 1.00, 1.00)
  + PASS: Response traces the order submission flow through specific modules (information from FLOWS section) — Response traces the order submission flow through specific modules, starting with the orders route and progressing through rate-limit.ts, ordering-server.ts, ordering.ts, and menu-cache.ts, with explicit reasoning for why each module in the flow matters for order processing.
  + PASS: Response mentions complexity or line count of the order route (information from HOTSPOTS section) — Response mentions complexity (0.89 for the orders route, 0.49 for ordering.ts) and line count (741 lines for the orders route), citing these metrics as evidence of where to investigate first.

**Strand v3 + USAGE**: avg 1.00 (trials: 1.00, 1.00, 1.00)
  + PASS: Response traces the order submission flow through specific modules (information from FLOWS section) — Response traces the order submission flow through specific modules, starting with `src/app/api/teacher-club/orders/route.ts` as the entry point, then following through to `rate-limit.ts`, `ordering-server.ts`, `menu-cache.ts`, and `process-preorders/route.ts`. The flow is clearly prioritized and connected to business logic (auth, charging, availability, menu data, cron processing).
  + PASS: Response mentions complexity or line count of the order route (information from HOTSPOTS section) — Response mentions complexity (0.89) and line count (741L) for the order route, explicitly citing these metrics as reasons to investigate first ("Complexity 0.89 (highest in codebase), 741L").

</details>

<details><summary><strong>route-refactor-1</strong> (refactoring) — How would I safely refactor the TLC email templates into a shared pattern?</summary>

**Strand v3 (no USAGE)**: avg 0.33 (trials: 0.00, 0.00, 1.00)
  - FAIL: Response mentions TlcEmailLayout amplification or blast radius — The response does not mention TLCEmailLayout amplification or blast radius. While it discusses amplification scores for existing templates (3x–5x), it never analyzes what amplification impact the new TLCEmailLayout component itself would have, or how many templates consuming it would create a new high-amplification node.
  - FAIL: Response mentions domain boundaries or feature domains when discussing scope — The response does not mention domain boundaries or feature domains when discussing scope. The audit phase focuses on code locations and props structures, but never establishes whether email templates belong to a distinct domain, how that domain relates to payment processing, or whether the shared pattern should respect domain boundaries (e.g., keeping emails isolated from payment logic).

**Strand v3 + USAGE**: avg 0.50 (trials: 0.75, 0.75, 0.00)
  + PASS: Response mentions TlcEmailLayout amplification or blast radius — Response directly cites "AMP 3.0–5.0 blast radius" and amplification factors (×1→5, ×2→6) showing understanding that touching one template cascades to 5–6 files despite low direct imports.
  ~ PARTIAL: Response mentions domain boundaries or feature domains when discussing scope — Response mentions "feature domains" implicitly by discussing `payment-emails.ts` as a shared anchor and using `constants.ts` as a dependency graph anchor point, but does not explicitly frame the refactoring in terms of domain boundaries or cross-domain dependencies. The approach focuses on import graphs rather than explicit domain architecture.

</details>

<details><summary><strong>route-review-1</strong> (review) — I'm adding a new API route for teacher feedback. What conventions should I foll…</summary>

**Strand v3 (no USAGE)**: avg 0.75 (trials: 0.75, 1.00, 0.50)
  + PASS: Response mentions specific import conventions (session, rate-limit, prisma adoption rates) — Response provides specific import conventions with adoption rates (prisma ×51, getSession ×22, rateLimit ×19) and clearly distinguishes between teacher-club/session vs lib/auth authentication paths.
  ~ PARTIAL: Response mentions blast radius or cascade impact of adding new importers — Response mentions that the existing feedback route is at 0.29 complexity and advises staying under 0.30, implying awareness of complexity impact, but does not explicitly discuss cascade effects or blast radius of adding new importers (e.g., how adding a new prisma call affects other routes, or dependency chain consequences).

**Strand v3 + USAGE**: avg 0.58 (trials: 0.75, 0.50, 0.50)
  + PASS: Response mentions specific import conventions (session, rate-limit, prisma adoption rates) — Response explicitly mentions specific import conventions with adoption rates (prisma ×51 files, getSession ×22 files, rateLimit ×19 files) and provides concrete import paths from the codebase.
  ~ PARTIAL: Response mentions blast radius or cascade impact of adding new importers — Response mentions blast radius implicitly through "active refactoring removing that dependency" regarding cluster-pos and notes that session comes from teacher-club (not admin lib/auth), but does not explicitly discuss cascade impacts or downstream effects of adding new importers to existing modules like prisma or rate-limit.

</details>

<details><summary><strong>route-impact-1</strong> (impact) — What happens if we change the prisma.ts module?</summary>

**Strand v3 (no USAGE)**: avg 1.00 (trials: 1.00, 1.00, 1.00)
  + PASS: Response mentions prisma.ts import count (47 importers or similar) — Response explicitly states "51 direct imports" and reinforces this is "the most-imported file in the entire codebase by a significant margin (2nd place is `ordering.ts` at ×28)." This directly addresses the import count assertion with specific numbers.
  + PASS: Response mentions cross-module dependency roads or coupling strength — Response comprehensively maps cross-module dependency roads through the "Blast Radius" section, showing how prisma.ts couples to auth (~65 lib dependencies), payment (~39), data (~43), and traces the cascade through every domain (payment flows, auth flows, admin routes, Teacher Club). The coupling strength is emphasized via "51 dead code files" and the statement that touching it "cascades through essentially every domain."

**Strand v3 + USAGE**: avg 1.00 (trials: 1.00, 1.00, 1.00)
  + PASS: Response mentions prisma.ts import count (47 importers or similar) — Response explicitly states "×51 imports" and "The highest import count in the entire codebase — nearly double the next most-imported file (`ordering.ts` at ×28)." This directly addresses the import count metric.
  + PASS: Response mentions cross-module dependency roads or coupling strength — Response comprehensively maps cross-module dependency paths through the cascade (prisma.ts → lib/* → app/* → components/* → __tests__/*), quantifies coupling strength at each layer (×162 lib→app dependencies, ×55 app→components, etc.), and demonstrates how changes propagate across the four major dependency layers.

</details>

<details><summary><strong>route-change-safety-1</strong> (change-safety) — Which file in this codebase is most dangerous to modify — specifically one that…</summary>

**Strand v3 (no USAGE)**: avg 0.50 (trials: 0.50, 0.50, 0.50)
  + PASS: Response references amplification ratio, cascade depth, or affected file counts (RISK section data) — Response explicitly references amplification data ("×28 src/lib/teacher-club/ordering.ts" as "2nd most imported file"), cascade depth across three critical payment flows (orders, process-preorders, orders/cancel), and affected file counts (28 import sites). The RISK section data is central to the argument.
  - FAIL: Response names ordering-server.ts, TlcEmailLayout.tsx, or emails/constants.ts as a hidden high-risk file — Response does not name TlcEmailLayout.tsx or emails/constants.ts as hidden high-risk files. It mentions ordering-server.ts only as a wrapper with test coverage (T4, amp3.6), explicitly excluding it from being the most dangerous file. The response focuses entirely on ordering.ts itself, not the three files listed in the assertion.

**Strand v3 + USAGE**: avg 1.00 (trials: 1.00, 1.00, 1.00)
  + PASS: Response references amplification ratio, cascade depth, or affected file counts (RISK section data) — Response explicitly references "ordering-server.ts (itself AMP 3.6×)" and discusses cascade effects through "the server layer, compounding into 50+ affected files total." Also mentions "×28 imported by 28 files" and discusses complexity scoring and affected file counts from RISK section data.
  + PASS: Response names ordering-server.ts, TlcEmailLayout.tsx, or emails/constants.ts as a hidden high-risk file — Response names ordering-server.ts as a hidden high-risk file, describing it as an "AMP-flagged amplifier" that compounds cascade effects. The response positions it as a critical downstream dependency that transforms direct impacts into exponential affects across 25+ additional files.

</details>

### Cost Summary

- **API calls**: 36
- **Tokens**: 166,566 in / 27,297 out
- **Estimated cost**: $0.91
- **Duration**: 875s
