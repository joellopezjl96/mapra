## Results: trim-validation

*sbc — 2026-03-07T05:03:14.253Z*

### Overall Scores by Condition

| Condition | Avg Score | Avg Tokens (in) | Avg Latency |
|-----------|-----------|------------------|-------------|
| Full v3 (baseline) | 1.00 | 4,611 | 13.3s |
| No TERRAIN | 1.00 | 3,949 | 13.6s |
| Trimmed (no PAGES, TERRAIN, DOMAINS) | 0.90 | 3,158 | 14.8s |

### Scores by Task Type

| Task Type | Full v3 (baseline) | No TERRAIN | Trimmed (no PAGES, TERRAIN, DOMAINS) |
|-----------|-----------|-----------|-----------|
| architecture | 1.00 | 1.00 | 1.00 |
| debugging | 1.00 | 1.00 | 1.00 |
| impact | 1.00 | 1.00 | 1.00 |
| inventory | 1.00 | 1.00 | 0.67 |
| planning | 1.00 | 1.00 | 1.00 |

### Per-Question Detail

<details><summary><strong>terrain-1</strong> (architecture) — Compare the complexity distribution across modules. Which module has the highes…</summary>

**Full v3 (baseline)**: avg 1.00 (trials: 1.00, 1.00, 1.00)
  + PASS: Response references specific complexity bar notation (e.g., block characters like squares/bars) or numeric complexity averages per module — Response provides numeric complexity averages per module (e.g., `__tests__` at 0.25, `app` at 0.25, `scripts` at 0.23, `lib` at 0.18, `types` at 0.04, `config` at 0.05). While no bar notation is used, the numeric data directly satisfies the intent of the requirement.
  + PASS: Response names at least one high-complexity module and one low-complexity module with supporting data — Response clearly names high-complexity modules (`__tests__` and `app` at 0.25, with specific supporting data including file counts and line totals) and low-complexity modules (`types` at 0.04, `config` at 0.05, `postcss.config.js` at 0.00), with supporting metrics provided for each.

**No TERRAIN**: avg 1.00 (trials: 1.00, 1.00, 1.00)
  + PASS: Response references specific complexity bar notation (e.g., block characters like squares/bars) or numeric complexity averages per module — The response provides numeric complexity averages per module (Teacher Club ~0.43, Kitchen Admin ~0.16) with detailed supporting data tables showing individual file complexity scores. While it doesn't use block characters/bars for visualization, it uses structured tables with numeric values that effectively communicate the complexity distribution.
  + PASS: Response names at least one high-complexity module and one low-complexity module with supporting data — The response clearly names Teacher Club as the highest-complexity module (~0.43 average, with the single highest file at 0.89) and Kitchen Admin as the lowest-complexity module (~0.16 average), both supported by comprehensive data tables listing specific files and their complexity scores.

**Trimmed (no PAGES, TERRAIN, DOMAINS)**: avg 1.00 (trials: 1.00, 1.00, 1.00)
  + PASS: Response references specific complexity bar notation (e.g., block characters like squares/bars) or numeric complexity averages per module — Response provides numeric complexity averages per module in a structured table format (e.g., "~0.34", "0.74", "~0.19"), clearly showing the 0.0–1.0 scale values. While it doesn't use block characters, it uses numeric notation consistently throughout.
  + PASS: Response names at least one high-complexity module and one low-complexity module with supporting data — Response identifies `scripts/` as highest average complexity (0.82) and `app/api/admin` as lowest (0.19), both with supporting data. Additionally provides secondary insight about `app` (pages) at 0.55 as the most meaningful high-complexity multi-file module, demonstrating thorough analysis with evidence.

</details>

<details><summary><strong>terrain-2</strong> (architecture) — Looking at module-level complexity, which modules are simple utilities vs compl…</summary>

**Full v3 (baseline)**: avg 1.00 (trials: 1.00, 1.00, 1.00)
  + PASS: Response classifies modules by complexity level using quantitative data (complexity scores, line counts, or heatmap notation) rather than guessing from names alone — Response extensively uses quantitative data (complexity scores like 0.04, 0.18, 0.25; line counts like 133L, 9,668L; import frequencies like ×54, ×28; AMP flags; cascade depths d1-d4; hotspot scores 0.74-0.89; commit churn metrics) to classify modules rather than inferring from names alone. The final signal table explicitly reinforces this quantitative approach.

**No TERRAIN**: avg 1.00 (trials: 1.00, 1.00, 1.00)
  + PASS: Response classifies modules by complexity level using quantitative data (complexity scores, line counts, or heatmap notation) rather than guessing from names alone — The response systematically uses quantitative signals (hotspot scores 0.0–1.0, import counts, line counts, churn rates, AMP/blast radius metrics) to distinguish utility from business logic. Simple utilities are identified by high import counts *paired with absent hotspot scores* (e.g., prisma.ts ×54 imports, no hotspot = shallow logic). Complex modules are ranked by hotspot scores (0.89 and 0.74 are highest), line counts (741, 716), and cascade depth metrics (d4). The response explicitly warns against name-only classification ("rather than guessing from names alone") and demonstrates this by showing email templates have high AMP despite low direct imports—a non-obvious finding requiring metric interpretation.

**Trimmed (no PAGES, TERRAIN, DOMAINS)**: avg 1.00 (trials: 1.00, 1.00, 1.00)
  + PASS: Response classifies modules by complexity level using quantitative data (complexity scores, line counts, or heatmap notation) rather than guessing from names alone — Response uses multiple quantitative metrics: complexity scores (0.89, 0.74), line counts (741L, 716L), import frequencies (×54, ×28, ×7→25), churn data (20 commits, 9 commits), and AMP cascade flags (amp3.6, d4) to classify modules rather than relying on naming conventions alone. The "fingerprint" section explicitly contrasts these signals between simple and complex modules.

</details>

<details><summary><strong>pages-1</strong> (inventory) — What user-facing pages does the Teacher Lunch Club app have? List them.</summary>

**Full v3 (baseline)**: avg 1.00 (trials: 1.00, 1.00, 1.00)
  + PASS: Response lists at least 4 specific page names or paths from the teacher-club section (e.g., menu, orders, profile, register, catering, spirit-night) — The response lists 14 specific page paths from the teacher-club section, well exceeding the minimum of 4. Examples include /teacher-club/menu, /teacher-club/orders, /teacher-club/profile, /teacher-club/register, /teacher-club/dashboard, and /teacher-club/feedback, all of which are clearly identified with descriptive labels.

**No TERRAIN**: avg 1.00 (trials: 1.00, 1.00, 1.00)
  + PASS: Response lists at least 4 specific page names or paths from the teacher-club section (e.g., menu, orders, profile, register, catering, spirit-night) — The response lists 14 specific page paths from the teacher-club section, well exceeding the minimum of 4. Includes register, login, dashboard, menu, cart, orders, profile, feedback, and others with clear path names.

**Trimmed (no PAGES, TERRAIN, DOMAINS)**: avg 0.33 (trials: 0.50, 0.50, 0.00)
  ~ PARTIAL: Response lists at least 4 specific page names or paths from the teacher-club section (e.g., menu, orders, profile, register, catering, spirit-night) — The response lists 7 items, exceeding the minimum of 4, but several are API routes (`/api/teacher-club/auth/...`) rather than user-facing pages. Only 2-3 are clearly user-facing pages (dashboard, order detail, cart). The auth routes are backend endpoints, not pages users directly navigate to. The response conflates API routes with user-facing pages, though it does identify some legitimate pages.

</details>

<details><summary><strong>domains-1</strong> (inventory) — How many feature domains does this codebase have? Name them and their relative …</summary>

**Full v3 (baseline)**: avg 1.00 (trials: 1.00, 1.00, 1.00)
  + PASS: Response names at least 3 feature domains with approximate file counts or relative size comparisons — The response names 23 feature domains and provides file counts and relative size comparisons for each. Well exceeds the requirement of naming at least 3 domains with size information.

**No TERRAIN**: avg 1.00 (trials: 1.00, 1.00, 1.00)
  + PASS: Response names at least 3 feature domains with approximate file counts or relative size comparisons — The response names 23 feature domains with file counts and relative size comparisons. It far exceeds the requirement of naming at least 3 domains, providing detailed metrics for each including exact file counts and percentage/size classifications (Largest, Large, Medium, Small, Tiny, Minimal).

**Trimmed (no PAGES, TERRAIN, DOMAINS)**: avg 1.00 (trials: 1.00, 1.00, 1.00)
  + PASS: Response names at least 3 feature domains with approximate file counts or relative size comparisons — Response identifies 5 feature domains (well exceeds the minimum of 3) and provides relative size comparisons for each domain using percentages (60%, 8%, 6%, 5%, 5%) with a summary table showing complexity levels.

</details>

<details><summary><strong>regression-debug</strong> (debugging) — Orders are failing intermittently during lunch rush. Where should I look first?</summary>

**Full v3 (baseline)**: avg 1.00 (trials: 1.00, 1.00, 1.00)
  + PASS: Response mentions the orders route and at least one downstream file (ordering-server.ts, ordering.ts, or authorize-net.ts) — Response explicitly mentions `src/app/api/teacher-club/orders/route.ts` as "the primary suspect" and directly references downstream files including `ordering-server.ts` (PeriodAvailability check), `authorize-net.ts` (auth holds), and `ordering.ts` (via ordering dependency).
  + PASS: Response mentions complexity score, line count, or hotspot ranking for the orders route — Response provides specific metrics for the orders route: complexity score of 0.89, line count of 741 lines, and hotspot ranking context ("Highest complexity in the codebase," "Most churned payment file" with 20 commits and +1159/-1011 lines recently).

**No TERRAIN**: avg 1.00 (trials: 1.00, 1.00, 1.00)
  + PASS: Response mentions the orders route and at least one downstream file (ordering-server.ts, ordering.ts, or authorize-net.ts) — Response identifies `src/app/api/teacher-club/orders/route.ts` as the starting point and mentions downstream files including rate-limit.ts, authorize-net references, and prisma.ts in the payment flow diagram.
  + PASS: Response mentions complexity score, line count, or hotspot ranking for the orders route — Response explicitly states the orders route has "Highest complexity (0.89)" and "741 lines" and notes it's "most churned (20 commits, +1159/-1011 lines recently)".

**Trimmed (no PAGES, TERRAIN, DOMAINS)**: avg 1.00 (trials: 1.00, 1.00, 1.00)
  + PASS: Response mentions the orders route and at least one downstream file (ordering-server.ts, ordering.ts, or authorize-net.ts) — Response mentions the orders route (`src/app/api/teacher-club/orders/route.ts`) and identifies three downstream files: `lib/teacher-club/ordering.ts`, `lib/teacher-club/authorize-net`, and `lib/prisma.ts`. It also mentions `lib/rate-limit.ts` as a direct import of the orders route.
  + PASS: Response mentions complexity score, line count, or hotspot ranking for the orders route — Response provides complexity score (0.89), line count (741L), and hotspot ranking ("highest complexity file and highest churn file simultaneously") for the orders route.

</details>

<details><summary><strong>regression-impact</strong> (impact) — What would be the blast radius of changing ordering-server.ts?</summary>

**Full v3 (baseline)**: avg 1.00 (trials: 1.00, 1.00, 1.00)
  + PASS: Response mentions ordering-server.ts affects more files than its direct import count suggests, OR mentions approximately 20-25 affected files — Response explicitly states "25 files" as total affected and "7 files" as direct importers, clearly demonstrating the cascade effect beyond direct imports.
  + PASS: Response mentions amplification ratio, cascade depth, or the AMP flag for ordering-server.ts — Response mentions "amplification 3.6x", "cascade depth 4 levels", and references the "amp3.6 ×7→25" from STRAND data, covering both amplification ratio and cascade depth.

**No TERRAIN**: avg 1.00 (trials: 1.00, 1.00, 1.00)
  + PASS: Response mentions ordering-server.ts affects more files than its direct import count suggests, OR mentions approximately 20-25 affected files — Response explicitly states "25 files touched transitively" and emphasizes this is "more files than its direct import count" (7 direct imports vs 25 total affected), directly addressing the cascading effect beyond direct importers.
  + PASS: Response mentions amplification ratio, cascade depth, or the AMP flag for ordering-server.ts — Response clearly mentions amplification ratio (3.6x), cascade depth (d4 / 4 levels), and the AMP flag (amp3.6) in both the STRAND encoding table and the direct metrics section.

**Trimmed (no PAGES, TERRAIN, DOMAINS)**: avg 1.00 (trials: 1.00, 1.00, 1.00)
  + PASS: Response mentions ordering-server.ts affects more files than its direct import count suggests, OR mentions approximately 20-25 affected files — Response explicitly states "25 files | Full cascade across the dependency graph" and contrasts this with "7 files | Import it immediately", clearly demonstrating that the file affects more total files than its direct import count.
  + PASS: Response mentions amplification ratio, cascade depth, or the AMP flag for ordering-server.ts — Response mentions all three requested metrics: amplification ratio ("3.6x"), cascade depth ("4 levels"), and the AMP flag ("amp3.6").

</details>

<details><summary><strong>regression-plan</strong> (planning) — Plan a DataCandy loyalty integration for Teacher Lunch Club. What modules need …</summary>

**Full v3 (baseline)**: avg 1.00 (trials: 1.00, 1.00, 1.00)
  + PASS: Response mentions the orders route or order submission as an integration point — Response explicitly identifies `src/app/api/teacher-club/orders/route.ts` as a core integration point, describes it as "already most complex file" (741L, 0.89 complexity), details specific changes needed (POST handler calls to DataCandy API for validation and award), and flags it as "VERY HIGH" risk.
  + PASS: Response mentions high import count or cascade risk for at least one module — Response identifies `src/lib/teacher-club/ordering.ts` with ×28 import count, explicitly calls this out as "imported by 28 files," notes it has "12 commits in 30 days" (active churn), and describes cascade risk: "any schema change cascades broadly." Also mentions `lib/prisma.ts` (×54 imported) in the architectural overview.

**No TERRAIN**: avg 1.00 (trials: 1.00, 1.00, 1.00)
  + PASS: Response mentions the orders route or order submission as an integration point — Response explicitly identifies `src/app/api/teacher-club/orders/route.ts` as the integration point where "points are earned — needs DataCandy API call on successful charge" and discusses the decision point of earning on hold vs. fulfillment. Also mentions `src/app/api/cron/process-preorders/route.ts` as the actual fulfillment moment for batch charges.
  + PASS: Response mentions high import count or cascade risk for at least one module — Response identifies `src/lib/teacher-club/ordering.ts` as "×28 imported (2nd most imported file)" and explicitly states "28 downstream consumers means a schema change here has wide blast radius," describing the cascade risk. Also notes `src/lib/teacher-club/ordering-server.ts` has "×7→25 blast radius" amplification effect.

**Trimmed (no PAGES, TERRAIN, DOMAINS)**: avg 1.00 (trials: 1.00, 1.00, 1.00)
  + PASS: Response mentions the orders route or order submission as an integration point — Response explicitly identifies `src/app/api/teacher-club/orders/route.ts` as the critical integration point, noting it must handle loyalty redemption codes, validate discounts before payment, award points after charge, and rollback on failure. This is the high-risk anchor for purchase-time loyalty logic.
  + PASS: Response mentions high import count or cascade risk for at least one module — Response thoroughly documents the cascade risk of `src/lib/teacher-club/ordering.ts` being ×28 imported with AMP risk, explicitly warns against modifying existing function signatures, and recommends additive changes only. It also identifies `src/lib/teacher-club/payment-emails.ts` touching `OrderReceiptEmailProps` with amp3.0 cascade to 6 files, recommending optional fields to avoid breaking existing call sites.

</details>

### Cost Summary

- **API calls**: 63
- **Tokens**: 246,060 in / 37,856 out
- **Estimated cost**: $1.31
- **Duration**: 1054s
