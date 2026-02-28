# .strand v2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix Q3 (payment flow misidentification) and Q1 (route truncation) in the .strand encoder by adding ALIASES + FLOWS sections and removing display caps.

**Architecture:** All changes are in `src/encoder/strand-format-encode.ts`. Two new sections (ALIASES, FLOWS) are added to the output. Existing sections are modified to use aliases and remove truncation. A new experiment file validates the changes.

**Tech Stack:** TypeScript (ES2022, nodenext modules), `@anthropic-ai/sdk` for experiment runner

---

### Task 1: Uncap API ROUTES display

**Files:**
- Modify: `src/encoder/strand-format-encode.ts:141-179` (renderApiRoutes)

**Step 1: Remove the showCount cap and annotations in renderApiRoutes**

Change `renderApiRoutes` to list all routes with compact formatting:

```typescript
function renderApiRoutes(graph: StrandGraph): string {
  const apiRoutes = graph.nodes
    .filter((n) => n.type === "api-route")
    .sort((a, b) => b.complexity - a.complexity);

  if (apiRoutes.length === 0) return "";

  let out = `─── API ROUTES (${apiRoutes.length}) ─────────────────────────────────\n`;

  for (const route of apiRoutes) {
    const methods =
      (route.framework?.metadata as { methods?: string[] })?.methods?.join(
        ",",
      ) || "?";
    const routePath =
      (route.framework?.metadata as { routePath?: string })?.routePath ||
      route.path;
    const lines = `${route.lines}L`.padStart(5);
    const complexity = route.complexity.toFixed(2);

    out += `${methods.padEnd(7)}${routePath.padEnd(50)} ${lines} ${complexity}\n`;
  }

  out += `\n`;
  return out;
}
```

Key changes:
- Removed `showCount` and the `... +N more routes` truncation
- Reduced method padding from 18 to 7
- Removed hardcoded annotations (`← payment+POS hub`, etc.)
- Loop over all routes, not just first 12

**Step 2: Run the encoder to verify output**

Run: `npx tsx -e "import { scanCodebase } from './src/scanner/index.js'; import { encodeToStrandFormat } from './src/encoder/strand-format-encode.js'; const g = scanCodebase('C:\\\\dev\\\\SenorBurritoCompany'); console.log(encodeToStrandFormat(g));" 2>/dev/null | head -80`

Expected: API ROUTES section lists all 36 routes with no `... +N more` line.

**Step 3: Commit**

```bash
git add src/encoder/strand-format-encode.ts
git commit -m "fix: uncap API ROUTES display — show all routes with compact formatting"
```

---

### Task 2: Uncap PAGES display

**Files:**
- Modify: `src/encoder/strand-format-encode.ts:181-216` (renderPages)

**Step 1: Remove the showCount cap in renderPages**

```typescript
function renderPages(graph: StrandGraph): string {
  const pages = graph.nodes
    .filter((n) => n.type === "route")
    .sort((a, b) => b.complexity - a.complexity);

  if (pages.length === 0) return "";

  let out = `─── PAGES (${pages.length}) ──────────────────────────────────────────\n`;

  for (const page of pages) {
    const routePath =
      (page.framework?.metadata as { routePath?: string })?.routePath ||
      page.path;
    const client = (page.framework?.metadata as { isClientComponent?: boolean })
      ?.isClientComponent
      ? " [client]"
      : "";
    const lines = `${page.lines}L`.padStart(5);
    const complexity = page.complexity.toFixed(2);

    out += `${(routePath + client).padEnd(44)} ${lines} ${complexity}\n`;
  }

  out += `\n`;
  return out;
}
```

Key changes:
- Removed `showCount` and the `... +N more pages` truncation
- Removed hardcoded annotations (`homepage`, `← payment UI`)

**Step 2: Run encoder, verify PAGES shows all 35 pages**

Run: `npx tsx -e "import { scanCodebase } from './src/scanner/index.js'; import { encodeToStrandFormat } from './src/encoder/strand-format-encode.js'; const g = scanCodebase('C:\\\\dev\\\\SenorBurritoCompany'); console.log(encodeToStrandFormat(g));" 2>/dev/null | grep -A 50 "PAGES"`

Expected: All 35 pages listed, no truncation.

**Step 3: Commit**

```bash
git add src/encoder/strand-format-encode.ts
git commit -m "fix: uncap PAGES display — show all pages"
```

---

### Task 3: Add buildAliases and renderAliases

**Files:**
- Modify: `src/encoder/strand-format-encode.ts` — add new functions, modify `encodeToStrandFormat`

**Step 1: Add the Alias type and buildAliases function**

Add at the bottom of the file, before the existing helpers section:

```typescript
// ─── Alias System ───────────────────────────────────────

interface AliasEntry {
  alias: string;
  fullPath: string;
}

/**
 * Scan rendered sections for file paths appearing 2+ times.
 * Generate short aliases for them.
 */
function buildAliases(graph: StrandGraph): AliasEntry[] {
  // Count how many times each node path appears across sections that reference individual files.
  // HOTSPOTS + MOST IMPORTED + edges (for FLOWS) are the main consumers.
  const pathCounts = new Map<string, number>();

  // Count from hotspots (complexity > 0.3, non-test, non-config)
  const hotspots = graph.nodes
    .filter(
      (n) => n.type !== "test" && n.type !== "config" && n.complexity > 0.3,
    );
  for (const node of hotspots) {
    pathCounts.set(node.path, (pathCounts.get(node.path) || 0) + 1);
  }

  // Count from most-imported
  const edgeCounts = new Map<string, number>();
  for (const edge of graph.edges) {
    edgeCounts.set(edge.to, (edgeCounts.get(edge.to) || 0) + 1);
  }
  const mostImported = [...edgeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  for (const [fileId] of mostImported) {
    pathCounts.set(fileId, (pathCounts.get(fileId) || 0) + 1);
  }

  // Count from edges (files that participate in cross-module flows)
  for (const edge of graph.edges) {
    const fromMod = getModuleId(edge.from);
    const toMod = getModuleId(edge.to);
    if (fromMod !== toMod) {
      pathCounts.set(edge.from, (pathCounts.get(edge.from) || 0) + 1);
      pathCounts.set(edge.to, (pathCounts.get(edge.to) || 0) + 1);
    }
  }

  // Filter to paths appearing 2+ times
  const frequentPaths = [...pathCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([p]) => p);

  // Generate aliases
  const usedAliases = new Set<string>();
  const aliases: AliasEntry[] = [];

  for (const fullPath of frequentPaths) {
    const alias = generateAlias(fullPath, usedAliases);
    if (alias) {
      usedAliases.add(alias);
      aliases.push({ alias, fullPath });
    }
  }

  return aliases;
}

/**
 * Generate a short alias from a file path.
 * Strategy: take the most distinctive path segments and abbreviate.
 */
function generateAlias(fullPath: string, used: Set<string>): string | null {
  const parts = fullPath.replace(/\.(ts|tsx|js|jsx)$/, "").split("/");

  // Remove common prefixes like "src/app/api", "src/lib", "src/components"
  const meaningful = parts.filter(
    (p) => !["src", "app", "api", "route", "page", "index"].includes(p),
  );

  // Try progressively longer combinations
  // e.g., "src/lib/cluster-pos/client.ts" -> ["lib", "cluster-pos", "client"] -> "$cluster-pos-client" -> "$pos-client"
  let candidate = "";

  if (meaningful.length >= 2) {
    // Use last 2 meaningful segments
    const last2 = meaningful.slice(-2);
    candidate = last2.join("-");
  } else if (meaningful.length === 1) {
    candidate = meaningful[0] || "file";
  } else {
    // Fallback: use last 2 path segments
    candidate = parts.slice(-2).join("-");
  }

  // Abbreviate common words
  candidate = candidate
    .replace("teacher-club", "tlc")
    .replace("cluster-pos", "pos")
    .replace("components", "comp")
    .replace("emails", "email");

  // Truncate to 15 chars max
  if (candidate.length > 15) {
    candidate = candidate.slice(0, 15);
  }

  const alias = `$${candidate}`;

  // Deduplicate
  if (used.has(alias)) {
    // Append a number
    for (let i = 2; i < 10; i++) {
      const alt = `${alias}${i}`;
      if (!used.has(alt)) return alt;
    }
    return null;
  }

  return alias;
}

function renderAliases(aliases: AliasEntry[]): string {
  if (aliases.length === 0) return "";

  let out = `─── ALIASES ─────────────────────────────────────────────\n`;

  for (const { alias, fullPath } of aliases) {
    out += `${alias.padEnd(20)} ${fullPath}\n`;
  }

  out += `\n`;
  return out;
}

/**
 * Replace full file paths with their aliases in rendered text.
 */
function applyAliases(text: string, aliases: AliasEntry[]): string {
  let result = text;
  // Sort by longest path first to avoid partial replacements
  const sorted = [...aliases].sort(
    (a, b) => b.fullPath.length - a.fullPath.length,
  );
  for (const { alias, fullPath } of sorted) {
    result = result.replaceAll(fullPath, alias);
  }
  return result;
}
```

**Step 2: Wire aliases into encodeToStrandFormat**

Update the main function to build aliases, render the ALIASES section, and apply aliases to HOTSPOTS and MOST IMPORTED:

```typescript
export function encodeToStrandFormat(graph: StrandGraph): string {
  let out = "";

  // Header
  out += `STRAND v2 | ${graph.projectName} | ${capitalize(graph.framework)} | ${graph.totalFiles} files | ${graph.totalLines.toLocaleString()} lines\n\n`;

  // Build aliases from graph data
  const aliases = buildAliases(graph);

  // ALIASES section
  out += renderAliases(aliases);

  // TERRAIN section — complexity heatmap
  out += renderTerrain(graph);

  // INFRASTRUCTURE section — inter-module dependency roads
  out += renderInfrastructure(graph);

  // FLOWS section — critical paths (NEW)
  out += renderFlows(graph, aliases);

  // API ROUTES section
  out += renderApiRoutes(graph);

  // PAGES section
  out += renderPages(graph);

  // HOTSPOTS section (apply aliases)
  out += applyAliases(renderHotspots(graph), aliases);

  // MOST IMPORTED section (apply aliases)
  out += applyAliases(renderMostImported(graph), aliases);

  // TEST COVERAGE section
  out += renderTestCoverage(graph);

  return out;
}
```

Note: `renderFlows` doesn't exist yet — add a stub that returns `""` so the encoder compiles:

```typescript
function renderFlows(graph: StrandGraph, aliases: AliasEntry[]): string {
  // TODO: implement in Task 4
  return "";
}
```

**Step 3: Run the encoder and verify aliases appear**

Run: `npx tsx -e "import { scanCodebase } from './src/scanner/index.js'; import { encodeToStrandFormat } from './src/encoder/strand-format-encode.js'; const g = scanCodebase('C:\\\\dev\\\\SenorBurritoCompany'); console.log(encodeToStrandFormat(g));" 2>/dev/null | head -30`

Expected: Header says `STRAND v2`, ALIASES section appears with `$`-prefixed short names mapped to full paths.

**Step 4: Verify aliases are applied in HOTSPOTS and MOST IMPORTED**

Run: `npx tsx -e "import { scanCodebase } from './src/scanner/index.js'; import { encodeToStrandFormat } from './src/encoder/strand-format-encode.js'; const g = scanCodebase('C:\\\\dev\\\\SenorBurritoCompany'); console.log(encodeToStrandFormat(g));" 2>/dev/null | grep -E '^\$|HOTSPOT|MOST IMP' -A 10`

Expected: HOTSPOTS and MOST IMPORTED sections use `$alias` references instead of full paths for files that appear in the alias table.

**Step 5: Commit**

```bash
git add src/encoder/strand-format-encode.ts
git commit -m "feat: add ALIASES system — short references for frequently-used files"
```

---

### Task 4: Add renderFlows — auto-detected critical path chains

**Files:**
- Modify: `src/encoder/strand-format-encode.ts` — replace the `renderFlows` stub

**Step 1: Implement renderFlows**

Replace the stub with the full implementation:

```typescript
/**
 * Auto-detect critical path chains by walking edges grouped by domain.
 * Uses classifyEdge() categories to group file-to-file edges into named flows.
 */
function renderFlows(graph: StrandGraph, aliases: AliasEntry[]): string {
  // Group cross-module file-to-file edges by domain
  const domainEdges = new Map<string, Array<{ from: string; to: string }>>();

  for (const edge of graph.edges) {
    if (edge.type === "tests") continue; // Skip test edges

    const fromMod = getModuleId(edge.from);
    const toMod = getModuleId(edge.to);
    if (fromMod === toMod) continue; // Only cross-module edges

    const domain = classifyEdge(edge.from, edge.to);
    if (domain === "test") continue; // Skip test domain

    if (!domainEdges.has(domain)) {
      domainEdges.set(domain, []);
    }
    domainEdges.get(domain)!.push({ from: edge.from, to: edge.to });
  }

  if (domainEdges.size === 0) return "";

  // Build adjacency lists per domain for chain walking
  const chains: Array<{ domain: string; chain: string[] }> = [];

  for (const [domain, edges] of domainEdges) {
    // Build adjacency list
    const adj = new Map<string, Set<string>>();
    const allNodes = new Set<string>();
    const hasIncoming = new Set<string>();

    for (const { from, to } of edges) {
      if (!adj.has(from)) adj.set(from, new Set());
      adj.get(from)!.add(to);
      allNodes.add(from);
      allNodes.add(to);
      hasIncoming.add(to);
    }

    // Find entry points (nodes with no incoming edges in this domain, preferring API routes)
    const entryPoints = [...allNodes]
      .filter((n) => !hasIncoming.has(n))
      .sort((a, b) => {
        // Prefer API routes as entry points
        const aIsApi = a.includes("/api/") ? 0 : 1;
        const bIsApi = b.includes("/api/") ? 0 : 1;
        return aIsApi - bIsApi;
      });

    // Walk chains from entry points (DFS, max depth 5)
    for (const entry of entryPoints) {
      const chain = walkChain(entry, adj, 5);
      if (chain.length >= 2) {
        chains.push({ domain, chain });
      }
    }
  }

  if (chains.length === 0) return "";

  // Group chains by domain and limit to top 3 chains per domain
  const grouped = new Map<string, string[][]>();
  for (const { domain, chain } of chains) {
    if (!grouped.has(domain)) grouped.set(domain, []);
    const domainChains = grouped.get(domain)!;
    if (domainChains.length < 3) {
      domainChains.push(chain);
    }
  }

  // Render
  let out = `─── FLOWS ──────────────────────────────────────────────\n`;
  out += `Critical paths (entry → logic → infrastructure)\n\n`;

  // Sort domains: payment first, then auth, then rest alphabetically
  const domainOrder = ["payment", "auth", "rendering", "data"];
  const sortedDomains = [...grouped.keys()].sort((a, b) => {
    const ai = domainOrder.indexOf(a);
    const bi = domainOrder.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const aliasMap = new Map(aliases.map((a) => [a.fullPath, a.alias]));

  for (const domain of sortedDomains) {
    const domainChains = grouped.get(domain)!;
    const label = `${domain}:`.padEnd(12);

    for (let i = 0; i < domainChains.length; i++) {
      const chain = domainChains[i]!;
      const chainStr = chain
        .map((p) => aliasMap.get(p) || shortenPath(p))
        .join(" -> ");

      if (i === 0) {
        out += `${label}${chainStr}\n`;
      } else {
        out += `${"".padEnd(12)}${chainStr}\n`;
      }
    }
  }

  out += `\n`;
  return out;
}

/**
 * Walk a chain from an entry point following adjacency edges.
 * Returns the longest path up to maxDepth.
 */
function walkChain(
  start: string,
  adj: Map<string, Set<string>>,
  maxDepth: number,
): string[] {
  const chain: string[] = [start];
  let current = start;
  const visited = new Set<string>([start]);

  for (let depth = 0; depth < maxDepth; depth++) {
    const neighbors = adj.get(current);
    if (!neighbors || neighbors.size === 0) break;

    // Pick the first unvisited neighbor (prefer non-test, non-config files)
    let next: string | null = null;
    for (const n of neighbors) {
      if (!visited.has(n)) {
        next = n;
        break;
      }
    }

    if (!next) break;
    visited.add(next);
    chain.push(next);
    current = next;
  }

  return chain;
}

/**
 * Shorten a file path for display in FLOWS when no alias exists.
 * Removes common prefixes and extensions.
 */
function shortenPath(fullPath: string): string {
  return fullPath
    .replace(/^src\//, "")
    .replace(/\.(ts|tsx|js|jsx)$/, "")
    .replace(/\/route$/, "")
    .replace(/\/page$/, "");
}
```

**Step 2: Run the encoder and verify FLOWS section appears**

Run: `npx tsx -e "import { scanCodebase } from './src/scanner/index.js'; import { encodeToStrandFormat } from './src/encoder/strand-format-encode.js'; const g = scanCodebase('C:\\\\dev\\\\SenorBurritoCompany'); console.log(encodeToStrandFormat(g));" 2>/dev/null | grep -A 20 "FLOWS"`

Expected: FLOWS section with named domains (payment, auth, rendering, data) showing file-to-file chains using `->` syntax. Payment chain should include `orders/route` -> `ordering` -> `cluster-pos/client`, NOT `catering/page` or `spirit-night/page`.

**Step 3: Verify the full output looks correct**

Run: `npx tsx -e "import { scanCodebase } from './src/scanner/index.js'; import { encodeToStrandFormat } from './src/encoder/strand-format-encode.js'; const g = scanCodebase('C:\\\\dev\\\\SenorBurritoCompany'); const out = encodeToStrandFormat(g); console.log(out); console.log('---'); console.log('Total chars:', out.length, '  ~tokens:', Math.ceil(out.length/4));" 2>/dev/null`

Expected: Full .strand v2 output with all sections. Estimated ~6-7KB total.

**Step 4: Save the v2 output for comparison**

Run: `npx tsx -e "import { scanCodebase } from './src/scanner/index.js'; import { encodeToStrandFormat } from './src/encoder/strand-format-encode.js'; import * as fs from 'fs'; const g = scanCodebase('C:\\\\dev\\\\SenorBurritoCompany'); fs.writeFileSync('experiments/output/exp4-strand-v2.strand', encodeToStrandFormat(g));" 2>/dev/null`

**Step 5: Commit**

```bash
git add src/encoder/strand-format-encode.ts experiments/output/exp4-strand-v2.strand
git commit -m "feat: add FLOWS section — auto-detected critical path chains for Q3 fix"
```

---

### Task 5: Write Experiment 4 runner

**Files:**
- Create: `experiments/experiment-4-strand-v2.ts`

**Step 1: Write the experiment runner**

Follow the exact pattern from `experiments/experiment-3-formats.ts` but with 3 conditions: Text Only (baseline), .strand v1 (control — need to keep original encoder available), .strand v2 (test).

Since we've modified the encoder in place, we need a way to produce v1 output. Two options:
- Read the saved v1 output from `experiments/output/exp3-strand-format.strand`
- This is actually the cleanest approach — the v1 output is already saved and won't change

```typescript
/**
 * Experiment 4: .strand v2 Validation
 *
 * Tests whether .strand v2 (aliases + flows + uncapped routes/pages) fixes
 * the Q3 and Q1 weaknesses while maintaining Q2/Q4/Q5 accuracy.
 *
 * 3 conditions:
 *   1. Text Only    — baseline (same as Exp 1-3)
 *   2. .strand v1   — control (saved output from Exp 3)
 *   3. .strand v2   — test (new encoder with ALIASES + FLOWS)
 *
 * Same 5 questions from all previous experiments.
 *
 * Usage: ANTHROPIC_API_KEY=sk-... npx tsx experiments/experiment-4-strand-v2.ts [path-to-codebase]
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";
import { scanCodebase } from "../src/scanner/index.js";
import { encodeToText } from "../src/encoder/text-encode.js";
import { encodeToStrandFormat } from "../src/encoder/strand-format-encode.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TARGET_CODEBASE = process.argv[2] || "C:\\dev\\SenorBurritoCompany";

const QUESTIONS = [
  {
    id: "q1",
    question:
      "How many API routes does this project have? List them with their HTTP methods.",
    type: "inventory",
  },
  {
    id: "q2",
    question:
      "What is the most complex module in this project? What makes it complex?",
    type: "analysis",
  },
  {
    id: "q3",
    question:
      "If I needed to fix a bug in the payment processing flow, which files would I need to look at? Trace the likely call chain.",
    type: "navigation",
  },
  {
    id: "q4",
    question:
      "What are the main module boundaries in this project? Are there any modules that should be isolated but aren't?",
    type: "architecture",
  },
  {
    id: "q5",
    question:
      "Which files are the most depended-on (imported by the most other files)? What does this tell you about the architecture?",
    type: "dependency",
  },
];

type ConditionId = "text" | "strand-v1" | "strand-v2";

interface Condition {
  id: ConditionId;
  name: string;
  description: string;
}

const CONDITIONS: Condition[] = [
  {
    id: "text",
    name: "Text Only",
    description: "Structured text encoding — baseline (same as all experiments)",
  },
  {
    id: "strand-v1",
    name: ".strand v1",
    description: "Original .strand format from Exp 3 (saved output, control)",
  },
  {
    id: "strand-v2",
    name: ".strand v2",
    description:
      "New .strand format with ALIASES + FLOWS + uncapped routes/pages",
  },
];

interface ConditionResult {
  conditionId: ConditionId;
  conditionName: string;
  response: string;
  tokens: { input: number; output: number };
}

interface QuestionResult {
  questionId: string;
  question: string;
  type: string;
  conditions: ConditionResult[];
}

async function runExperiment() {
  console.log("=== STRAND EXPERIMENT 4: .strand v2 Validation ===\n");
  console.log(`Target codebase: ${TARGET_CODEBASE}\n`);

  // Step 1: Scan the codebase
  console.log("Scanning codebase...");
  const graph = scanCodebase(TARGET_CODEBASE);
  console.log(
    `Found ${graph.totalFiles} files, ${graph.nodes.length} nodes, ${graph.edges.length} edges, ${graph.modules.length} modules\n`,
  );

  // Step 2: Generate encodings
  const outputDir = path.join(__dirname, "output");
  fs.mkdirSync(outputDir, { recursive: true });

  console.log("Generating encodings...");

  // Condition 1: Text Only
  const textContent = encodeToText(graph);
  console.log(
    `  Text Only:    ${textContent.length} chars (~${Math.ceil(textContent.length / 4)} tokens)`,
  );

  // Condition 2: .strand v1 (load saved output from Exp 3)
  const v1Path = path.join(outputDir, "exp3-strand-format.strand");
  if (!fs.existsSync(v1Path)) {
    console.error(`ERROR: v1 output not found at ${v1Path}`);
    console.error("Run experiment 3 first to generate the v1 baseline.");
    process.exit(1);
  }
  const strandV1Content = fs.readFileSync(v1Path, "utf-8");
  console.log(
    `  .strand v1:   ${strandV1Content.length} chars (~${Math.ceil(strandV1Content.length / 4)} tokens) [loaded from exp3]`,
  );

  // Condition 3: .strand v2 (current encoder)
  const strandV2Content = encodeToStrandFormat(graph);
  fs.writeFileSync(
    path.join(outputDir, "exp4-strand-v2.strand"),
    strandV2Content,
  );
  console.log(
    `  .strand v2:   ${strandV2Content.length} chars (~${Math.ceil(strandV2Content.length / 4)} tokens)`,
  );

  console.log("\nAll encodings ready.\n");

  // Print size comparison
  printEncodingSizes(textContent, strandV1Content, strandV2Content);

  // Step 3: Run LLM experiment if API key available
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log(
      "ANTHROPIC_API_KEY not set — encodings saved. Skipping LLM comparison.\n",
    );
    console.log("To run the full experiment:");
    console.log(
      "  ANTHROPIC_API_KEY=sk-... npx tsx experiments/experiment-4-strand-v2.ts\n",
    );
    return;
  }

  const client = new Anthropic({ apiKey });
  const results: QuestionResult[] = [];

  for (const q of QUESTIONS) {
    console.log(`\n--- Question ${q.id}: ${q.type} ---`);
    console.log(`"${q.question}"\n`);

    const conditionResults: ConditionResult[] = [];

    for (const condition of CONDITIONS) {
      console.log(`  [${condition.id}] ${condition.name}...`);

      const result = await queryCondition(
        client,
        condition.id,
        q.question,
        textContent,
        strandV1Content,
        strandV2Content,
      );

      conditionResults.push({
        conditionId: condition.id,
        conditionName: condition.name,
        ...result,
      });

      console.log(
        `    → ${result.tokens.input}in/${result.tokens.output}out tokens`,
      );
    }

    results.push({
      questionId: q.id,
      question: q.question,
      type: q.type,
      conditions: conditionResults,
    });
  }

  // Step 4: Save and print results
  const resultsPath = path.join(outputDir, "experiment-4-results.json");
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to ${resultsPath}`);

  printComparison(results);
}

async function queryCondition(
  client: Anthropic,
  conditionId: ConditionId,
  question: string,
  textContent: string,
  strandV1Content: string,
  strandV2Content: string,
): Promise<{ response: string; tokens: { input: number; output: number } }> {
  let prompt: string;

  switch (conditionId) {
    case "text":
      prompt = `You are reading a structured text encoding of a software project's architecture:\n\n${textContent}\n\nBased on this encoding, answer this question:\n${question}\n\nBe specific. Reference the data from the encoding.`;
      break;

    case "strand-v1":
      prompt = `You are reading a .strand encoding of a codebase. The TERRAIN section shows complexity as a visual heatmap (█=high, ·=low). The INFRASTRUCTURE section shows dependency flow between modules. Use both the visual patterns and the structured data sections together.\n\n${strandV1Content}\n\nBased on this .strand encoding, answer this question:\n${question}\n\nBe specific. Reference both the visual patterns and the structured data.`;
      break;

    case "strand-v2":
      prompt = `You are reading a .strand v2 encoding of a codebase. The TERRAIN section shows complexity heatmaps. The ALIASES section defines short names for frequently-referenced files. The FLOWS section shows critical call-chain paths grouped by domain (payment, auth, etc.). The INFRASTRUCTURE section shows inter-module dependencies. Use all sections together to answer questions.\n\n${strandV2Content}\n\nBased on this .strand v2 encoding, answer this question:\n${question}\n\nBe specific. Reference the FLOWS, ALIASES, and structured data sections.`;
      break;
  }

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    response.content[0]?.type === "text" ? response.content[0].text : "";
  return {
    response: text,
    tokens: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
    },
  };
}

function printEncodingSizes(
  textContent: string,
  strandV1Content: string,
  strandV2Content: string,
): void {
  console.log("=== ENCODING SIZE COMPARISON ===\n");
  console.log(
    `  Text Only:     ${(textContent.length / 1024).toFixed(1)} KB  (~${Math.ceil(textContent.length / 4)} tokens)`,
  );
  console.log(
    `  .strand v1:    ${(strandV1Content.length / 1024).toFixed(1)} KB  (~${Math.ceil(strandV1Content.length / 4)} tokens)`,
  );
  console.log(
    `  .strand v2:    ${(strandV2Content.length / 1024).toFixed(1)} KB  (~${Math.ceil(strandV2Content.length / 4)} tokens)`,
  );

  const v1Chars = strandV1Content.length;
  const v2Chars = strandV2Content.length;
  const textChars = textContent.length;
  console.log(
    `\n  v2 vs v1:      ${v2Chars > v1Chars ? "+" : ""}${(((v2Chars - v1Chars) / v1Chars) * 100).toFixed(1)}%`,
  );
  console.log(
    `  v2 vs text:    ${(((v2Chars - textChars) / textChars) * 100).toFixed(1)}%`,
  );
  console.log();
}

function printComparison(results: QuestionResult[]): void {
  console.log("\n\n========================================");
  console.log("EXPERIMENT 4 RESULTS: .strand v2 Validation");
  console.log("========================================\n");

  const totals = new Map<ConditionId, { input: number; output: number }>();
  for (const cond of CONDITIONS) {
    totals.set(cond.id, { input: 0, output: 0 });
  }

  for (const r of results) {
    console.log(`\n--- ${r.questionId} [${r.type}]: ${r.question} ---\n`);

    for (const cr of r.conditions) {
      console.log(`  [${cr.conditionId}] ${cr.conditionName}:`);
      console.log(
        `    ${cr.response.slice(0, 300).replace(/\n/g, "\n    ")}${cr.response.length > 300 ? "..." : ""}`,
      );
      console.log(
        `    Tokens: ${cr.tokens.input}in/${cr.tokens.output}out\n`,
      );

      const t = totals.get(cr.conditionId as ConditionId)!;
      t.input += cr.tokens.input;
      t.output += cr.tokens.output;
    }
  }

  console.log("\n========================================");
  console.log("TOKEN COST SUMMARY (across all 5 questions)");
  console.log("========================================\n");

  const textTotal = totals.get("text")!;
  const textTotalTokens = textTotal.input + textTotal.output;

  for (const cond of CONDITIONS) {
    const t = totals.get(cond.id)!;
    const total = t.input + t.output;
    const vsText = ((total / textTotalTokens) * 100 - 100).toFixed(1);
    const sign = total >= textTotalTokens ? "+" : "";
    console.log(
      `  ${cond.name.padEnd(25)} ${t.input.toLocaleString().padStart(8)}in + ${t.output.toLocaleString().padStart(6)}out = ${total.toLocaleString().padStart(8)} total  (${sign}${vsText}% vs text)`,
    );
  }

  console.log("\n=== KEY VALIDATION QUESTIONS ===");
  console.log(
    "  Q1: Does v2 list all 36 routes? (v1 only listed 12)",
  );
  console.log(
    "  Q3: Does v2 correctly identify payment files via FLOWS? (v1 misidentified entry points)",
  );
  console.log(
    "  Q2/Q4/Q5: Do unchanged sections still perform well? (regression check)",
  );
  console.log(
    "\n(Review experiments/output/experiment-4-results.json for full responses)",
  );
}

runExperiment().catch(console.error);
```

**Step 2: Run the experiment without API key to verify it generates encodings**

Run: `npx tsx experiments/experiment-4-strand-v2.ts`

Expected: Scans codebase, generates 3 encodings, prints size comparison, says "ANTHROPIC_API_KEY not set — encodings saved."

**Step 3: Commit**

```bash
git add experiments/experiment-4-strand-v2.ts
git commit -m "feat: add Experiment 4 runner — .strand v1 vs v2 validation"
```

---

### Task 6: Run Experiment 4 and update FINDINGS.md

**Files:**
- Modify: `FINDINGS.md` — add Experiment 4 results section

**Step 1: Run the full experiment with API key**

Run: `ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY npx tsx experiments/experiment-4-strand-v2.ts`

Expected: Runs all 5 questions across 3 conditions (15 API calls total). Prints token costs and truncated responses.

**Step 2: Analyze results**

Read `experiments/output/experiment-4-results.json` and evaluate:
- Q1: Count how many routes each condition lists
- Q3: Check if v2's payment chain matches ground truth (orders/route -> ordering -> cluster-pos/client)
- Q2/Q4/Q5: Compare v1 vs v2 for regressions

**Step 3: Add Experiment 4 section to FINDINGS.md**

Add a new section following the existing format (Conditions table, Token Costs table, Key Findings, Verdict). Update the "Recommended Encodings" and "Open Questions" sections based on results.

**Step 4: Commit**

```bash
git add FINDINGS.md experiments/output/experiment-4-results.json experiments/output/exp4-strand-v2.strand
git commit -m "docs: add Experiment 4 results — .strand v2 validation"
```
