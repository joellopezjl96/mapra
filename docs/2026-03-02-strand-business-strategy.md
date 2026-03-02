# Strand Business Strategy

**Date:** 2026-03-02
**Author:** Joel Lopez + Claude
**Status:** Draft — internal strategy document

---

## Executive Summary

Strand is a codebase intelligence tool that generates a compact structural encoding (`.strand` file) for AI coding agents. The encoding gives agents pre-computed knowledge about dependency graphs, blast radius, complexity hotspots, churn patterns, and architectural topology — eliminating the expensive codebase exploration that dominates agent session time.

No other tool produces a bounded-token, version-controlled, human-readable codebase encoding with blast radius analysis. This is a new product category.

The business model: free open-source CLI for adoption, paid cloud services (GitHub App, MCP server, dashboard) for team monetization. The defensible moat is format standardization — if `.strand` becomes the expected file in every repo, strand owns the ecosystem.

---

## The Problem

Every AI coding tool has the same bottleneck: understanding the codebase before it can work on it.

| Tool | How it understands codebases | Cost per session |
|------|-----|-----|
| Claude Code | Ad-hoc grep, no index | 45+ tool calls, 70K+ tokens, re-explores every session |
| Cursor | Vector embeddings (Turbopuffer) | Semantic similarity, no dependency graph, cloud-required |
| Aider | Tree-sitter repo map (PageRank) | ~1K token budget, no churn/complexity/blast radius |
| Copilot Workspace | Opaque internal ranking | Cloud-locked, no portable artifact, no blast radius |
| Repomix | Raw file concatenation | 100K-500K+ tokens, no structure, no prioritization |

The cost is measured in three currencies:
1. **Tokens** — every file read consumes context window. Past ~30% utilization, LLM quality degrades due to attention dilution and the "lost in the middle" effect.
2. **Time** — each tool call triggers an API round-trip costing 15-35 seconds of LLM inference. A 35-tool-call exploration session takes 3+ minutes before any real work begins.
3. **Accuracy** — without structural context, agents make wrong decisions (e.g., concluding a stale plan is "ready to execute" when 23 files would cascade-break).

### Validated Impact

Eight controlled experiments across two codebases (289-file Next.js app, 3,142-file React SPA) demonstrated:

- **Zero tool calls** for structural questions when `.strand` is present vs. 45 tool calls without (Experiment 7)
- **3/3 accuracy** on blast radius identification vs. 0/3 without the RISK section (Experiment 5)
- **78% cost reduction** when pairing strand with cheaper models (Haiku + strand matches Sonnet without strand) (Experiment 6)
- **96% self-documenting** — models understand the format without external explanation (Experiment 8)

Real-world test (preorder feature planning, 289-file Next.js app):
- Without strand: 35 tool calls, 57K tokens, 3 minutes, **wrong conclusion**
- With strand: 2 tool calls, ~3.5K tokens, 1.3 minutes, **correct conclusion with blast radius**

---

## The Product

### What Strand Computes

Strand scans a codebase and builds:
1. A full dependency graph (every file, every import edge)
2. Blast radius with cascade depth and amplification scores
3. Complexity metrics per file
4. Git churn history (30-day commit patterns)
5. Test coverage mapping (which files have direct test edges)
6. Domain classification (feature grouping)
7. Convention detection (shared patterns across files)
8. Cross-module coupling analysis

This graph is the core asset. Every product surface is a different projection of the same data.

### Product Surfaces

**1. The `.strand` File (Free)**
A compact text encoding (~2,400 tokens for a 289-file project) checked into the repo. AI tools read it automatically via CLAUDE.md / .cursorrules integration. Contains: RISK (blast radius), FLOWS (entry point dependencies), CHURN (change patterns), HOTSPOTS (complexity), MOST IMPORTED (centrality), INFRASTRUCTURE (module coupling), API ROUTES, TEST COVERAGE.

**2. CLI Tools (Free)**
- `strand generate` — scan codebase, write `.strand`
- `strand impact <file>` — cascade tree with per-node metrics (complexity, churn, test count)
- `strand validate-plan <plan.md>` — cross-reference implementation plan against RISK and CHURN data
- `strand status` — check freshness, detect staleness
- Auto-regeneration hooks (pre-commit, post-checkout)

**3. GitHub App (Pro — $19/repo/month)**
- Automatic blast radius comments on every PR
- Risk score badge (green/yellow/red) based on cascade analysis
- Architecture health tracking over 30 days
- Alerts when PRs touch high-AMP files without test coverage

**4. MCP Server (Pro — included)**
- Cloud-hosted MCP server any AI tool can query
- `impact`, `validate-plan`, `risk-score` endpoints
- Works with Claude Code, Cursor, Aider, custom agents
- Replaces local CLI for team-shared environments

**5. Team Dashboard (Team — $49/repo/month)**
- Architecture health over 12 months (trend lines)
- Multi-repo dependency graph (cross-repo blast radius)
- Coupling increase alerts (Slack/email)
- Team blast radius dashboard
- Code ownership mapping (who touched which high-risk files)

---

## Market

### Target Customer

**Primary:** AI agent developers — engineers building with Claude Code, Cursor, Copilot, or Aider who want their agents to be faster and more accurate on codebases.

**Conversion path:** Individual developer adopts free CLI → shows blast radius to teammate during PR review → team wants automated PR comments → engineering manager sees architecture visibility → pays for Pro/Team.

### Market Size

The AI coding tools market is growing rapidly:
- GitHub Copilot: ~1.8M paid subscribers (2024)
- Cursor: fastest-growing IDE, millions of users
- Claude Code: launched 2025, growing rapidly
- Aider: open-source, strong developer community

Every developer using an AI coding tool is a potential strand user. The addressable market is the subset working on codebases large enough to benefit from structural encoding (~50+ files, which covers most professional projects).

Conservative estimate:
- 5M developers using AI coding tools by end of 2026
- 10% adopt strand free tier = 500K users
- 5% of free users convert to Pro = 25K paying repos
- Average $25/repo/month = **$7.5M ARR**

### Customer Segments

| Segment | Size | Free value | Conversion trigger | Revenue potential |
|---------|------|-----------|-------------------|------------------|
| Solo dev + AI tool | Large | High — full CLI | None (stays free) | $0 (distribution) |
| Startup (1-5 eng) | Medium | High | Teammate sees blast radius in PR | Low ($19/repo) |
| Mid-size (10-50 eng) | Medium | Medium | Need PR automation + dashboard | Medium ($49/repo × 5-20 repos) |
| Enterprise (50+ eng) | Small | Low | SSO, audit logs, multi-repo | High (custom pricing) |

---

## Competitive Landscape

### Direct Competitors

No tool currently does what strand does. The closest:

**Depwire** — MCP-based dependency analysis with blast radius. Tree-sitter parsing, impact analysis tool, D3 visualizations. Limitation: query-time only (no static encoding), 4 languages, BSL license. Strand's advantage: portable file, more signals (churn, complexity, conventions), format standard play.

**Axon** — Graph database (KuzuDB) with MCP interface. Hybrid search (BM25 + semantic), blast radius with confidence scores, community detection. Limitation: query-time only, Python/TS/JS only, requires database. Strand's advantage: zero infrastructure, human-readable, version-controlled.

**Aider Repo Map** — Tree-sitter symbol extraction with PageRank. Dynamic per-turn, ~1K token budget. Limitation: no blast radius, no churn, locked to Aider. Strand's advantage: richer signals, tool-agnostic, static artifact.

### Platform Risk

The existential threat is platform owners building this natively:

| Platform | Likelihood | Timeline | Mitigation |
|----------|-----------|----------|-----------|
| Anthropic (Claude Code) | Medium-high | 6-12 months | Partnership / acquisition target. Make `.strand` the recommended format before they build their own. |
| Cursor | Medium | 3-6 months | Their embedding-based approach doesn't do blast radius. Complementary positioning — strand adds what embeddings can't. |
| GitHub (Copilot) | Low-medium | 12-18 months | Slow-moving. Ship format standard before they decide to act. |

**Mitigation strategy:** Make `.strand` the standard that platforms adopt rather than compete with. If Anthropic recommends `.strand` files in their docs, they validate the ecosystem rather than threatening it.

### Competitive Moat Analysis

| Asset | Defensibility | Duration |
|-------|-------------|----------|
| Scanner/analyzer code | Low — 2-4 week replication | 3-6 months |
| Encoder format | Low — readable from output | 3-6 months |
| Experimental research (8 experiments) | Medium — conclusions are public in FINDINGS.md | 6-12 months |
| Format standard adoption | High — network effects compound | 18+ months |
| GitHub App historical data | High — switching costs (6+ months of data) | 24+ months |
| Multi-language support | Medium — each language is engineering investment | 12 months |
| Platform partnerships | High — relationship-based | Indefinite |

---

## Go-to-Market Strategy

### Phase 1: Win the Format Standard (Now → Month 3)

**Goal:** Get `.strand` files into as many repos as possible.

**Actions:**
- Ship v4 with toolbelt (impact, freshness, compressed encoding)
- Make `npx strand` work in any JS/TS project in under 5 seconds
- Publish strand on npm with clear README and examples
- Write "How .strand saved us 3 minutes per AI session" blog post with real data from experiments
- Submit `.strand` to popular repos as PRs (with permission — show the value, not spam)
- Build integrations: `.cursorrules` support, Aider config, VS Code extension (show `.strand` data inline)
- Ship Python support (doubles addressable market)
- Ship Go support (captures infrastructure/backend developers)

**Metrics:**
- npm weekly downloads
- GitHub stars
- Number of public repos with `.strand` files
- CLI usage telemetry (opt-in)

**Cost:** $0 (Joel's time + open source community)

### Phase 2: Ship the MCP Server (Months 2-4)

**Goal:** Developers who have `.strand` files get queryable access to the graph.

**Actions:**
- Build `strand serve` — local MCP server exposing impact, validate-plan, risk-score
- Publish as MCP server in Claude Code and Cursor marketplaces
- Ship cloud-hosted version for teams (no local setup required)
- Free tier: local MCP server (same as CLI tools)
- Pro tier: cloud-hosted MCP server with team sharing

**Metrics:**
- MCP server installations
- Queries per day
- Cloud vs. local usage ratio

### Phase 3: Ship the GitHub App (Months 4-6)

**Goal:** Convert team adoption into revenue.

**Actions:**
- Build GitHub App that runs strand on every PR
- Automatic blast radius comment on PRs touching high-AMP files
- Risk score badge (green/yellow/red)
- 30-day architecture health tracking
- Free 14-day trial, then $19/repo/month

**The conversion trigger:** A developer who's been manually pasting `strand impact` output into PR comments can now automate it. The upgrade feels like "just automate what I'm already doing."

**Metrics:**
- GitHub App installations
- PRs analyzed per day
- Free trial → paid conversion rate (target: 15-25%)
- Monthly recurring revenue

### Phase 4: Team Dashboard (Months 6-9)

**Goal:** Expand revenue per customer.

**Actions:**
- Multi-repo dependency graph (cross-repo blast radius)
- Architecture health trends over 12 months
- Coupling increase alerts (Slack/email)
- Team ownership mapping
- $49/repo/month

**Metrics:**
- Average revenue per customer
- Net revenue retention (target: 130%+ via expansion)
- Repos per paying customer

### Phase 5: Enterprise (Months 9-12)

**Goal:** Capture high-ARPU enterprise deals.

**Actions:**
- SSO (SAML/OKTA)
- Audit logs
- SOC 2 compliance
- Self-hosted option
- Custom pricing (target: $500-2,000/month per organization)

---

## Pricing

| Tier | Price | Includes | Target |
|------|-------|---------|--------|
| **Free** | $0 | CLI tools, `.strand` generation, `strand impact`, `strand validate-plan`, auto-regen hooks, local MCP server | Solo developers, open source |
| **Pro** | $19/repo/month | GitHub App (PR risk comments), cloud MCP server, 30-day architecture health, risk score badges | Small teams (2-10 engineers) |
| **Team** | $49/repo/month | Multi-repo graphs, 12-month health trends, coupling alerts, ownership mapping, Slack integration | Mid-size teams (10-50 engineers) |
| **Enterprise** | Custom | SSO, audit logs, SOC 2, self-hosted option, dedicated support | Large organizations (50+ engineers) |

**Pricing rationale:**
- Free tier is generous by design — it's the distribution engine. Never paywall core CLI functionality.
- Pro price ($19) is below the "needs manager approval" threshold at most companies. Individual developers can expense it.
- Team price ($49) requires manager approval but is trivially justifiable against engineering time saved.
- Enterprise pricing follows the market (Linear, Sentry, PostHog all use custom enterprise pricing).

---

## Defensibility Strategy

### Short-term (0-6 months): Speed

Ship faster than anyone can clone. By the time a competitor reverse-engineers v3, you're shipping v5. The experimental research gives you a 2-3 month head start on knowing what works.

**Action:** Keep the FINDINGS.md research internal. The `.strand` format is public (it's the standard). The research on why specific sections matter and what token budgets work is your competitive edge — don't give it away.

### Medium-term (6-18 months): Format Standard

Make `.strand` the expected file in every repo, like `.gitignore` or `tsconfig.json`. Network effects compound — every repo with a `.strand` file makes the format more valuable for AI tools to support natively.

**Action:** Get `.strand` mentioned in Claude Code docs, Cursor docs, Aider docs. Partner with platform teams. Offer to help them integrate `.strand` reading into their default behavior.

### Long-term (18+ months): Data Moat

The GitHub App accumulates architecture health history that can't be replicated. A team with 12 months of trend data won't switch to a competitor starting from zero. Cross-repo dependency graphs are even stickier — they require the full organization's repos to be indexed.

**Action:** Build the historical data layer early (Phase 3). Even if revenue is low initially, the data accumulation creates switching costs that compound over time.

### Platform Partnership Strategy

The goal is to be acquired or adopted by a platform, not competed against.

**Ideal outcome:** Anthropic recommends `.strand` in their Claude Code documentation. Strand becomes the official codebase encoding standard for Claude. This validates the ecosystem and makes strand the default.

**Second-best outcome:** Acquisition by Anthropic, GitHub, or Cursor. The graph computation + format standard + team data layer is worth more inside a platform than as a standalone tool.

**Actions:**
- Present strand's experimental data to Anthropic's developer relations team
- Propose `.strand` as a recommended practice in Claude Code docs
- Build relationships with Cursor and GitHub Copilot teams
- Position strand as "we've already solved this problem — partner with us instead of building it"

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Anthropic builds native codebase indexing | Medium-high | Fatal | Partnership positioning; format standard; be the acquisition target |
| Open-source clone appears | High | Low-medium | Speed of iteration; format adoption; the clone copies v3 while you ship v5 |
| Low free-to-paid conversion | Medium | High | Focus on team trigger (PR comments); track "paste blast radius in PR" as activation event |
| Language support too narrow (JS/TS only) | Medium | Medium | Ship Python in Phase 1; Go in Phase 2; Rust in Phase 3 |
| Token budgets shrink (models get longer context) | Low | Medium | Strand's value is accuracy, not just compression; blast radius matters at any context size |
| Developer skepticism ("another dev tool") | Medium | Medium | Lead with data — 45 tool calls → 0, 3 minutes → instant. Show, don't tell. |

---

## Financial Projections (Conservative)

| Quarter | Free users | Pro repos | Team repos | MRR |
|---------|-----------|-----------|-----------|-----|
| Q2 2026 | 500 | 0 | 0 | $0 |
| Q3 2026 | 5,000 | 50 | 0 | $950 |
| Q4 2026 | 20,000 | 250 | 25 | $5,975 |
| Q1 2027 | 50,000 | 1,000 | 100 | $23,900 |
| Q2 2027 | 100,000 | 3,000 | 500 | $81,500 |

**Assumptions:**
- 5% free-to-Pro conversion (industry median for developer tools)
- 10% Pro-to-Team expansion
- 0% churn in first year (optimistic but typical for new product honeymoon)
- No enterprise deals in first year

**Break-even:** ~$5K MRR covers infrastructure costs (GitHub App hosting, MCP server, database). Achievable by Q4 2026 with conservative adoption.

---

## Immediate Next Steps

1. **Ship v4 toolbelt** — `strand impact`, freshness system, encoding compression (design doc complete)
2. **Publish to npm** — make `npx strand` work globally
3. **Write launch blog post** — lead with experimental data, show the 45→0 tool call comparison
4. **Ship Python scanner** — doubles addressable market
5. **Build GitHub App prototype** — even a manual/webhook version validates the PR comment value prop
6. **Reach out to Anthropic DevRel** — propose `.strand` as recommended practice

---

## The One-Line Pitch

**Strand gives AI coding agents a map of your codebase so they stop exploring and start working.**
