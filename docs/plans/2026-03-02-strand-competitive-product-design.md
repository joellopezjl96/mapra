# Strand Product Design — Competitive Intelligence Synthesis

**Date:** 2026-03-02
**Status:** Approved design
**Supersedes:** Extends (not replaces) `2026-03-02-strand-v4-toolbelt-design.md` and `2026-03-02-strand-business-strategy.md`

---

## Context

Competitive analysis of 5 tools in the codebase-for-AI space revealed specific capabilities strand should adopt. This design synthesizes those learnings into a concrete product plan.

### Competitors Analyzed

| Tool | Approach | Key Insight for Strand |
|------|----------|----------------------|
| **Aider Repo Map** | Tree-sitter + PageRank, ~1K tokens, conversation-aware | Relevance ranking — boost files related to current query |
| **Repomix** | File concatenation, 22K stars, tree-sitter compression | Signature-only code compression (~70% token reduction) |
| **Codebase Digest** | File concatenation + 60 prompt templates | Nothing unique — defers all analysis to LLM |
| **Depwire** | Tree-sitter + graphology, 12 MCP tools, BSL license | Auto-generated docs (ARCHITECTURE.md, CONVENTIONS.md) |
| **Axon** | Tree-sitter + KuzuDB graph, community detection, hybrid search | Git change coupling, Leiden clustering, dead code with exemptions |

### Product Philosophy

**The .strand file is the free map — it drives adoption.** The MCP toolbelt is the paid product — it drives revenue. The map proves strand understands your codebase. The tools make that understanding actionable.

Analogy: Google Maps is free. The Places API / Routes API / Geocoding are paid.

---

## Part 1: Enriched .strand Encoding (Free)

Three new analysis engines, all baked into the free `.strand` file:

### 1.1 Git Change Coupling

**Source:** Axon's change coupling analysis
**What:** Detect file pairs that frequently co-change in git history.
**How:** Parse `git log --numstat` (already done for CHURN), count co-occurrence pairs over 6 months. Filter to strength >= 0.3 and 3+ co-changes.

**New .strand section:**
```
─── COUPLING (files that co-change) ─────────────────
ordering.ts ↔ ordering-server.ts     0.85  12×
session.ts ↔ magic-link.ts           0.72   8×
authorize-net.ts ↔ payment-emails.ts 0.68   6×
cart/types.ts ↔ cart/index.ts        0.65   5×
```

**Implementation:** New analyzer in `src/analyzer/coupling.ts`. Reuses git log parsing from `churn.ts`. O(n²) pair counting on co-committed files per commit, filtered by thresholds.

**Value:** Answers "if I change X, what else usually needs to change?" — a question RISK (import-based) can't answer. This is practice-based coupling, not structural coupling.

### 1.2 Better Dead Code Detection

**Source:** Axon's multi-pass dead code analysis
**What:** Upgrade from "51 unreachable files" to actionable list with exemptions.
**How:** Multi-pass analysis:
- Pass 1: Find all files with zero inbound edges
- Pass 2: Exempt entry points (pages, API routes, layouts, configs)
- Pass 3: Exempt barrel exports (index.ts files that re-export)
- Pass 4: Exempt test files
- Pass 5: Exempt framework files (next.config, tailwind.config, etc.)
- Remaining: truly dead code

**Updated .strand section:**
```
─── DEAD CODE (7 truly unreachable files) ───────────
src/lib/old-menu-parser.ts         142L  utility
src/components/DeprecatedBanner.tsx  38L  component
src/lib/unused-validator.ts          22L  utility
...
(44 exempted: 35 pages/routes, 6 configs, 3 barrel exports)
```

**Implementation:** Update `src/analyzer/blast-radius.ts` (or new `dead-code.ts`) with exemption logic. Node type classification already exists in the scanner.

### 1.3 Graph-Based Domain Detection

**Source:** Axon's Leiden algorithm community detection
**What:** Replace path-based domain heuristic with import-graph clustering.
**How:** Run community detection on the dependency graph. Files that heavily import each other cluster into functional domains.

**Expected impact:** DOMAINS section currently scores 3/8 in experiments (scanner limitation — path-based heuristic misclassifies). Graph clustering should improve to 6-7/8.

**Implementation:** Add community detection in `src/analyzer/domains.ts`. Can use a simple label propagation algorithm (no need for full Leiden — strand's graphs are small enough). Each cluster becomes a domain.

**Risk:** Needs experimental validation. Run a batch experiment comparing path-based vs graph-based domains before shipping.

---

## Part 2: MCP Toolbelt Architecture

### Architecture

```
Developer's machine
├── .strand file (free, always available, enriched)
├── strand graph cache (.strand-graph.json, gitignored)
│   └── Full graph + analysis data (too detailed for .strand encoding)
├── strand MCP server (strand serve)
│   ├── Reads graph cache on startup
│   ├── Exposes tools via Model Context Protocol
│   └── File watcher for incremental updates
└── Claude Code / Cursor / Aider (calls MCP tools)
```

**Key decisions:**
- No database (no KuzuDB, no Neo4j) — graph lives in memory, loaded from JSON cache
- Cache is a byproduct of `strand generate` — no extra step
- File watcher for live updates (like Depwire) — re-parses changed files, patches graph
- Zero infrastructure beyond `strand serve`

### Free MCP Tools

Available to all users with `strand serve`:

| Tool | Input | Output | Source |
|------|-------|--------|--------|
| `strand_impact` | file path | Cascade tree with metrics (complexity, churn, test count, depth) | v4 toolbelt design |
| `strand_validate_plan` | markdown plan path | Cross-reference against RISK+CHURN, flag stale/high-cascade/missing-convention files | v4 toolbelt design |
| `strand_file_context` | file path | All imports, exports, importers, domain, complexity, churn | Depwire's `get_file_context` |
| `strand_search` | name pattern | Find files/symbols matching pattern with relevance ranking | Depwire's `search_symbols` |

### Pro MCP Tools ($10/mo)

| Tool | Input | Output | Source |
|------|-------|--------|--------|
| `strand_smart_context` | natural language query | Compressed code (signatures only) for relevant files, ranked by query relevance | Repomix (tree-sitter compression) + Aider (relevance ranking) |
| `strand_coupling` | file path | Co-change partners with strength scores and co-change count | Axon's change coupling |
| `strand_architecture` | (none) | Auto-generated ARCHITECTURE.md from graph data | Depwire's auto-docs |
| `strand_conventions` | (none) | Auto-generated CONVENTIONS.md with detected patterns | Depwire's auto-docs |
| `strand_dead_code` | (none) | List of truly dead files with exemption reasoning | Axon's dead code |
| `strand_diff_impact` | git ref or diff | Map changed files to affected downstream files and flows | Axon's `detect_changes` |

### The Killer Tool: `strand_smart_context`

This combines three competitive advantages no other tool has together:

1. **Strand's graph** knows which files matter for a query (FLOWS, RISK, imports)
2. **Tree-sitter compression** strips function bodies, keeps signatures (~70% token reduction)
3. **Relevance ranking** (inspired by Aider's personalization) boosts files related to the query

**Example:** AI agent asks "show me everything relevant to the payment flow"

1. FLOWS data identifies: `orders/route.ts → authorize-net.ts → payment-emails.ts → ordering-server.ts → session.ts → prisma.ts`
2. Tree-sitter compresses each file to signatures:
   ```typescript
   // src/lib/teacher-club/authorize-net.ts (compressed)
   export async function authorizePayment(params: AuthorizeParams): Promise<AuthResult> { ⋮ }
   export async function captureTransaction(transId: string, amount: number): Promise<CaptureResult> { ⋮ }
   export async function voidTransaction(transId: string): Promise<VoidResult> { ⋮ }
   ```
3. Returns ~2-3K tokens instead of ~15K tokens of full code

**This replaces 15+ grep/read tool calls with one MCP call.** That's the value prop for $10/mo.

### Licensing Enforcement

```typescript
// In MCP tool handler
async function handleProTool(toolName: string, params: unknown) {
  const key = process.env.STRAND_PRO_KEY;
  if (!key || !await validateLicense(key)) {
    return {
      content: [{
        type: "text",
        text: `${toolName} is a Strand Pro feature.\n\n` +
              `Get started at https://strand.dev/pro ($10/mo)\n\n` +
              `Free alternative: use \`strand_impact\` for basic blast radius analysis.`
      }]
    };
  }
  // ... execute tool
}
```

- Free tools: always available
- Pro tools: require `STRAND_PRO_KEY` environment variable
- License validation: JWT check against strand.dev API (no codebase data sent — just the key)
- Offline grace period: 7 days of cached validation for intermittent connectivity

---

## Part 3: Pricing

### Tiers

| Tier | Price | Includes |
|------|-------|---------|
| **Free** | $0 | Full enriched .strand file, CLI tools (`generate`, `impact`, `validate-plan`, `status`), free MCP tools, auto-regen hooks |
| **Solo Pro** | $10/mo | Pro MCP tools (`smart-context`, `coupling`, `architecture`, `conventions`, `dead-code`, `diff-impact`), priority support |
| **Team Pro** | $19/repo/mo | Everything in Solo + GitHub App (PR blast radius comments), team license sharing |
| **Team+** | $49/repo/mo | Multi-repo graphs, 12-month architecture trends, coupling alerts, Slack integration |

### Solo Dev Value Proposition

Target user: Developer paying $20/mo for Claude Code (Max plan).

**The pitch:** "You spend $20/mo on Claude. Strand Pro ($10/mo) makes Claude actually understand your codebase — 6x better on structural questions (0.13 → 0.82, experimentally validated). It's half what you pay for Claude, and it makes the other $20 dramatically more effective."

**Conversion triggers (specific moments a free user hits the pro wall):**

1. **"Show me the payment flow code"** → Without pro: 15 manual file reads. With `strand_smart_context`: one call, compressed code.
2. **"What usually changes with this file?"** → Without pro: manual git log. With `strand_coupling`: instant co-change partners.
3. **"Generate architecture docs for the new hire"** → Without pro: write manually. With `strand_architecture`: one command.
4. **"What's the blast radius of this PR?"** → Without pro: run `strand impact` per file. With `strand_diff_impact`: one call for the entire diff.

### Conversion Funnel

```
1. Install strand (free)              "Cool, it understands my project"
2. Use .strand with Claude daily      "This saves me time every session"
3. Try strand serve (free MCP)        "Nice, strand_impact saved me a search"
4. Hit a pro tool gate                "$10/mo to never manually trace deps? Yes."
```

---

## Part 4: Implementation Priority

### Phase 1: Enrich the Free Map (2-3 weeks)

1. Git change coupling analyzer → new COUPLING section in .strand
2. Better dead code detection → improved DEAD CODE section
3. Graph-based domain detection → improved DOMAINS section
4. Batch experiment to validate improvements

### Phase 2: MCP Server Foundation (2-3 weeks)

5. `strand serve` command — local MCP server
6. Free tools: `strand_impact`, `strand_file_context`, `strand_search`
7. Graph cache (.strand-graph.json) for fast startup
8. File watcher for live updates

### Phase 3: Pro Tools (3-4 weeks)

9. Tree-sitter compression engine (for `strand_smart_context`)
10. `strand_smart_context` — the killer tool
11. `strand_coupling` — co-change partner queries
12. `strand_architecture` + `strand_conventions` — auto-doc generation
13. `strand_diff_impact` — PR-level blast radius
14. License key system

### Phase 4: GitHub App (4-6 weeks)

15. GitHub App skeleton (webhook receiver)
16. Automatic blast radius comments on PRs
17. Risk score badges
18. Team license management

---

## Part 5: Competitive Moat

### What Strand Has That No One Else Does

| Capability | Strand | Aider | Repomix | Depwire | Axon |
|-----------|--------|-------|---------|---------|------|
| Static portable encoding | .strand file | No | Output file | No | No |
| Pre-computed blast radius | In .strand | No | No | Query-time | Query-time |
| Git churn analysis | In .strand | No | Sort-by-changes | No | Co-change only |
| Complexity heatmap | In .strand | No | No | No | No |
| Convention detection | In .strand | No | No | Auto-docs | No |
| Conversation-aware context | MCP (Pro) | PageRank per-turn | No | No | Hybrid search |
| Tree-sitter compression | MCP (Pro) | Signatures in map | --compress flag | No | No |
| Zero infrastructure | .strand file | In-process | CLI | Node.js MCP | Python MCP + DB |
| Experimental validation | 10 experiments | Benchmark suite | None | None | None |
| Token-bounded | ~3-4K fixed | ~1-2K fixed | Unbounded | Per-query | Per-query |

**Strand's unique position:** The only tool that combines a static, portable, token-bounded encoding with queryable MCP tools. The .strand file works even without the MCP server (competitors require a running process). The MCP server adds depth without abandoning the zero-infrastructure core.

### Defensibility Timeline

| Period | What Defends Strand |
|--------|-------------------|
| 0-6 months | Speed of iteration — ship v4+enrichments+MCP before anyone clones v3 |
| 6-18 months | Format standard — .strand files in thousands of repos create network effects |
| 18+ months | GitHub App data — 12 months of architecture health history creates switching costs |

---

## Success Metrics

### Free Tier Adoption
- npm weekly downloads (target: 1K by month 3, 10K by month 6)
- GitHub stars (target: 500 by month 3, 5K by month 6)
- Public repos with .strand files

### Pro Conversion
- Free → Pro conversion rate (target: 5%)
- Monthly recurring revenue
- `strand_smart_context` usage (the conversion trigger)

### Product Quality
- Batch experiment scores for enriched encoding (target: maintain 0.82+)
- MCP tool call success rate
- Time-to-first-value for new users (target: <30 seconds)

---

## Explicitly Out of Scope

- Symbol-level analysis (Axon's function→function call tracing) — file-level is sufficient for v4
- Hybrid search (BM25 + vector + fuzzy) — over-engineered for strand's graph size
- Graph database (KuzuDB/Neo4j) — in-memory JSON is sufficient
- Multi-language scanner beyond JS/TS — ship Python and Go as separate Phase 5 effort
- Enterprise tier (SSO, audit logs) — premature until Team tier has traction
