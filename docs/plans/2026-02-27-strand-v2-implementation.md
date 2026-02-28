# .strand v2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix Q3 (payment flow misidentification) and Q1 (route truncation) in the .strand encoder by adding a FLOWS section and removing display caps.

**Architecture:** Main changes are in `src/encoder/strand-format-encode.ts`. One new section (FLOWS) is added to the output. Existing sections are modified to remove truncation. A frozen copy of the v1 encoder enables fair A/B comparison. A new experiment validates the changes.

**Tech Stack:** TypeScript (ES2022, nodenext modules), `@anthropic-ai/sdk` for experiment runner

**Changes from original plan (post-review):**
- **ALIASES dropped** — net token loss on this codebase (-16 tokens); HOTSPOTS/MOST IMPORTED have near-zero path overlap; routes/pages use routePaths not file paths so aliases can't compress them
- **FLOWS algorithm rewritten** — old version had 2 blockers: `getModuleId()` treated all of `src/lib` as one module (killing intra-lib edges), and `classifyEdge()` failed on infrastructure files (cluster-pos, prisma). New version uses finer-grained sub-modules, hub-and-spoke rendering, and whole-flow classification
- **Experiment redesigned** — old version compared frozen v1 file against live v2 scan (codebase drift confound), used priming prompts, had no scoring rubrics, and ran N=1 trials. New version generates all encodings from same scan, uses uniform prompts, defines rubrics, and runs 3 trials

---

### Task 1: Preserve v1 encoder for experiment control

**Files:**
- Create: `src/encoder/strand-format-encode-v1.ts` (copy of current encoder)

**Why:** The experiment needs to generate v1 and v2 encodings from the same `scanCodebase()` call to eliminate codebase-drift confounds. We preserve the current encoder before modifying it.

**Step 1: Copy the current encoder to a v1 file**

Copy `src/encoder/strand-format-encode.ts` to `src/encoder/strand-format-encode-v1.ts`. Change only:
- The export function name: `encodeToStrandFormat` → `encodeToStrandFormatV1`
- Nothing else — keep all helper functions, formatting, and the `showCount` caps exactly as they are

The v1 file is a frozen snapshot. It will NOT be modified by subsequent tasks.

**Step 2: Verify the v1 encoder produces identical output to the current encoder**

Run both encoders on the target codebase and diff the output:

```bash
npx tsx -e "
import { scanCodebase } from './src/scanner/index.js';
import { encodeToStrandFormat } from './src/encoder/strand-format-encode.js';
import { encodeToStrandFormatV1 } from './src/encoder/strand-format-encode-v1.js';
const g = scanCodebase('C:\\\\dev\\\\SenorBurritoCompany');
const v1 = encodeToStrandFormatV1(g);
const current = encodeToStrandFormat(g);
console.log('Match:', v1 === current);
console.log('v1 length:', v1.length, 'current length:', current.length);
" 2>/dev/null
```

Expected: `Match: true`

**Step 3: Commit**

```bash
git add src/encoder/strand-format-encode-v1.ts
git commit -m "chore: preserve v1 encoder as frozen control for experiment 4"
```

---

### Task 2: Uncap API ROUTES display

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
- Removed hardcoded annotations (`← payment+POS hub`, etc.) — redundant with FLOWS
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

### Task 3: Uncap PAGES display

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

### Task 4: Add FLOWS section — hub-and-spoke dependency rendering

**Files:**
- Modify: `src/encoder/strand-format-encode.ts` — add `renderFlows` + helpers, update `encodeToStrandFormat`

**Background — why the original FLOWS algorithm failed:**

The v1 plan had 2 blockers and 1 fundamental design error:
1. `getModuleId()` uses 2 path segments, grouping all of `src/lib/*` into one module. So `ordering.ts` → `cluster-pos/client.ts` (both `src/lib`) was filtered as same-module.
2. `classifyEdge()` failed on infrastructure files — `cluster-pos/client.ts → prisma` has no payment keywords, so the edge was classified as "data" and excluded from the payment domain.
3. The real payment flow is a **star pattern** (orders/route.ts fans out to 6+ direct deps), not a linear chain. The `walkChain` DFS would pick one arbitrary branch and miss the rest.

**New approach:**
- **Finer-grained sub-modules**: 3 path segments for `src/lib` and `src/app` (so `src/lib/teacher-club` ≠ `src/lib/cluster-pos`)
- **No per-edge domain filtering**: Build adjacency from ALL non-test import edges across sub-modules
- **Hub-and-spoke rendering**: For each API route entry point, list all cross-sub-module dependencies
- **Whole-flow classification**: Classify the entire cluster (entry + deps) by majority-vote on path keywords, with entry-point priority

**Step 1: Add helper functions**

Add above the existing helpers section:

```typescript
// ─── FLOWS ──────────────────────────────────────────────

/**
 * Finer-grained module ID for FLOWS.
 * Uses 3 path segments for src/lib and src/app to distinguish sub-modules.
 * e.g., "src/lib/teacher-club" vs "src/lib/cluster-pos"
 */
function getFlowModuleId(nodePath: string): string {
  const parts = nodePath.split("/");
  if (
    parts.length > 3 &&
    parts[0] === "src" &&
    (parts[1] === "lib" || parts[1] === "app" || parts[1] === "components")
  ) {
    return parts.slice(0, 3).join("/");
  }
  return parts.length > 2
    ? parts.slice(0, 2).join("/")
    : (parts[0] ?? nodePath);
}

/**
 * Classify a single file path into a domain.
 * Uses word boundaries on "test" to avoid matching "contest", "latest", etc.
 */
function classifyNodeDomain(nodePath: string): string {
  if (/auth|session|login|magic-link|trusted-device|verify/.test(nodePath))
    return "auth";
  if (/payment|authorize-net|order|cart|price|tip/.test(nodePath))
    return "payment";
  if (/\btest\b|\.spec\.|__tests__/.test(nodePath)) return "test";
  return "other";
}

/**
 * Classify an entire flow (entry point + dependencies) by domain.
 * Entry point path takes priority; falls back to majority-vote on deps.
 */
function classifyFlow(entryPath: string, depPaths: string[]): string {
  // Primary: classify by entry point
  const entryDomain = classifyNodeDomain(entryPath);
  if (entryDomain !== "other" && entryDomain !== "test") return entryDomain;

  // Fallback: majority vote on dependency paths
  const votes = new Map<string, number>();
  for (const p of depPaths) {
    const d = classifyNodeDomain(p);
    if (d !== "other" && d !== "test") {
      votes.set(d, (votes.get(d) || 0) + 1);
    }
  }

  let best = "data";
  let bestCount = 0;
  for (const [domain, count] of votes) {
    if (count > bestCount) {
      best = domain;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Shorten a file path for display in FLOWS.
 * Strips src/, file extensions, and /route /page suffixes.
 */
function shortenPath(fullPath: string): string {
  return fullPath
    .replace(/^src\//, "")
    .replace(/\.(ts|tsx|js|jsx)$/, "")
    .replace(/\/route$/, "")
    .replace(/\/page$/, "");
}
```

**Step 2: Add the renderFlows function**

```typescript
/**
 * Auto-detect business flows by finding API route entry points and their
 * cross-sub-module dependencies. Renders as hub-and-spoke: each entry point
 * lists its direct dependencies, classified by domain.
 *
 * This design handles star patterns (one hub importing many leaves) correctly,
 * which is the actual topology of business logic in Next.js API routes.
 */
function renderFlows(graph: StrandGraph): string {
  // 1. Build adjacency from ALL non-test import edges across sub-modules
  const adj = new Map<string, Set<string>>();

  for (const edge of graph.edges) {
    if (edge.type === "tests") continue;

    const fromMod = getFlowModuleId(edge.from);
    const toMod = getFlowModuleId(edge.to);
    if (fromMod === toMod) continue;

    if (!adj.has(edge.from)) adj.set(edge.from, new Set());
    adj.get(edge.from)!.add(edge.to);
  }

  // 2. Find entry points: API routes with outgoing cross-sub-module edges
  const entryPoints = graph.nodes
    .filter((n) => n.type === "api-route" && adj.has(n.id))
    .sort((a, b) => b.complexity - a.complexity);

  if (entryPoints.length === 0) return "";

  // 3. Build flow entries: each entry point + its cross-sub-module deps
  interface FlowEntry {
    entry: string;
    deps: string[];
    domain: string;
  }

  const flows: FlowEntry[] = [];

  for (const ep of entryPoints) {
    const deps = [...(adj.get(ep.id) || [])];
    if (deps.length === 0) continue;

    // Sort deps by complexity (most significant first)
    const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
    deps.sort((a, b) => {
      const ca = nodeMap.get(a)?.complexity ?? 0;
      const cb = nodeMap.get(b)?.complexity ?? 0;
      return cb - ca;
    });

    const domain = classifyFlow(ep.id, deps);
    if (domain === "test") continue;

    flows.push({ entry: ep.id, deps, domain });
  }

  if (flows.length === 0) return "";

  // 4. Group by domain, limit to top 3 flows per domain (by entry complexity)
  const grouped = new Map<string, FlowEntry[]>();
  for (const flow of flows) {
    if (!grouped.has(flow.domain)) grouped.set(flow.domain, []);
    const domainFlows = grouped.get(flow.domain)!;
    if (domainFlows.length < 3) {
      domainFlows.push(flow);
    }
  }

  // 5. Render
  let out = `─── FLOWS ──────────────────────────────────────────────\n`;
  out += `Entry points and their cross-module dependencies\n\n`;

  // Sort domains: payment first, then auth, then rest alphabetically
  const domainOrder = ["payment", "auth", "data"];
  const sortedDomains = [...grouped.keys()].sort((a, b) => {
    const ai = domainOrder.indexOf(a);
    const bi = domainOrder.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  for (const domain of sortedDomains) {
    const domainFlows = grouped.get(domain)!;
    const label = `${domain}:`.padEnd(12);

    for (let i = 0; i < domainFlows.length; i++) {
      const flow = domainFlows[i]!;
      const entryStr = shortenPath(flow.entry);
      const depStr = flow.deps.map((p) => shortenPath(p)).join(", ");

      if (i === 0) {
        out += `${label}${entryStr} -> ${depStr}\n`;
      } else {
        out += `${"".padEnd(12)}${entryStr} -> ${depStr}\n`;
      }
    }
  }

  out += `\n`;
  return out;
}
```

**Step 3: Wire FLOWS into encodeToStrandFormat**

Update the main function:

```typescript
export function encodeToStrandFormat(graph: StrandGraph): string {
  let out = "";

  // Header
  out += `STRAND v2 | ${graph.projectName} | ${capitalize(graph.framework)} | ${graph.totalFiles} files | ${graph.totalLines.toLocaleString()} lines\n\n`;

  // TERRAIN section — complexity heatmap
  out += renderTerrain(graph);

  // INFRASTRUCTURE section — inter-module dependency roads
  out += renderInfrastructure(graph);

  // FLOWS section — entry point dependency maps (NEW)
  out += renderFlows(graph);

  // API ROUTES section
  out += renderApiRoutes(graph);

  // PAGES section
  out += renderPages(graph);

  // HOTSPOTS section
  out += renderHotspots(graph);

  // MOST IMPORTED section
  out += renderMostImported(graph);

  // TEST COVERAGE section
  out += renderTestCoverage(graph);

  return out;
}
```

**Step 4: Run the encoder and verify FLOWS section**

Run: `npx tsx -e "import { scanCodebase } from './src/scanner/index.js'; import { encodeToStrandFormat } from './src/encoder/strand-format-encode.js'; const g = scanCodebase('C:\\\\dev\\\\SenorBurritoCompany'); console.log(encodeToStrandFormat(g));" 2>/dev/null | grep -B 1 -A 30 "FLOWS"`

Expected output should look approximately like:
```
─── FLOWS ──────────────────────────────────────────────
Entry points and their cross-module dependencies

payment:    api/teacher-club/orders -> lib/teacher-club/ordering, lib/cluster-pos/client, ...
            api/teacher-club/orders/[orderNumber]/cancel -> lib/teacher-club/ordering, ...
auth:       api/teacher-club/auth/register -> lib/teacher-club/emails/..., ...
            api/teacher-club/auth/magic-link -> ...
```

**Verify specifically:**
- Payment domain lists `orders/route` as entry, NOT `catering/page` or `spirit-night/page`
- Payment deps include `cluster-pos/client` and `ordering`
- catering and spirit-night do NOT appear in the payment domain
- No hallucinated file paths — every path in FLOWS must correspond to a real file

**Step 5: Verify full output and token budget**

Run: `npx tsx -e "import { scanCodebase } from './src/scanner/index.js'; import { encodeToStrandFormat } from './src/encoder/strand-format-encode.js'; const g = scanCodebase('C:\\\\dev\\\\SenorBurritoCompany'); const out = encodeToStrandFormat(g); console.log(out); console.log('---'); console.log('Total chars:', out.length, '  ~tokens:', Math.ceil(out.length/4));" 2>/dev/null`

Expected: ~5.5-6.5KB total. Token estimate ~1.4-1.6K. This is v1 (~4.8KB, ~1.2K tokens) + ~700-1700 chars for uncapped routes/pages and FLOWS.

**Step 6: Commit**

```bash
git add src/encoder/strand-format-encode.ts
git commit -m "feat: add FLOWS section — hub-and-spoke entry point dependency maps for Q3 fix"
```

---

### Task 5: Write Experiment 4 runner

**Files:**
- Create: `experiments/experiment-4-strand-v2.ts`

**Design decisions (post-review fixes):**

1. **Same scan for all conditions**: All 3 encodings generated from one `scanCodebase()` call. V1 encoder imported from the frozen copy, not loaded from a saved file. This eliminates codebase-drift confounds.

2. **Uniform prompts**: All conditions use the same prompt template. No section-specific hints, no domain names mentioned. The encoding must speak for itself.

3. **Scoring rubrics**: Q1 and Q3 have defined ground-truth criteria. Automated scoring for key metrics (route count, payment file identification).

4. **3 trials**: Each condition-question pair runs 3 times to surface non-determinism. Results report per-trial answers and agreement rate.

**Step 1: Write the experiment runner**

```typescript
/**
 * Experiment 4: .strand v2 Validation
 *
 * Tests whether .strand v2 (FLOWS + uncapped routes/pages) fixes
 * the Q3 and Q1 weaknesses while maintaining Q2/Q4/Q5 accuracy.
 *
 * Fixes from review:
 * - All encodings from same scanCodebase() call (no frozen file loading)
 * - Uniform prompt template (no domain priming)
 * - Scoring rubrics for Q1 and Q3
 * - 3 trials per condition-question pair
 *
 * 3 conditions:
 *   1. Text Only    — baseline
 *   2. .strand v1   — control (frozen encoder, same graph)
 *   3. .strand v2   — test (new encoder with FLOWS)
 *
 * Usage: ANTHROPIC_API_KEY=sk-... npx tsx experiments/experiment-4-strand-v2.ts [path-to-codebase]
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";
import { scanCodebase } from "../src/scanner/index.js";
import { encodeToText } from "../src/encoder/text-encode.js";
import { encodeToStrandFormatV1 } from "../src/encoder/strand-format-encode-v1.js";
import { encodeToStrandFormat } from "../src/encoder/strand-format-encode.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TARGET_CODEBASE = process.argv[2] || "C:\\dev\\SenorBurritoCompany";
const TRIALS = 3;

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
}

const CONDITIONS: Condition[] = [
  { id: "text", name: "Text Only" },
  { id: "strand-v1", name: ".strand v1" },
  { id: "strand-v2", name: ".strand v2" },
];

interface TrialResult {
  trial: number;
  response: string;
  tokens: { input: number; output: number };
}

interface ConditionResult {
  conditionId: ConditionId;
  conditionName: string;
  trials: TrialResult[];
}

interface QuestionResult {
  questionId: string;
  question: string;
  type: string;
  conditions: ConditionResult[];
}

/**
 * Uniform prompt template — identical structure for all conditions.
 * No section-specific hints, no domain names, no priming.
 */
function buildPrompt(formatName: string, content: string, question: string): string {
  return `You are reading a ${formatName} encoding of a software project's architecture. It contains multiple sections describing different aspects of the project.

${content}

Based on this encoding, answer this question:
${question}

Be specific. Reference the data from the encoding.`;
}

async function runExperiment() {
  console.log("=== STRAND EXPERIMENT 4: .strand v2 Validation ===\n");
  console.log(`Target codebase: ${TARGET_CODEBASE}`);
  console.log(`Trials per condition-question: ${TRIALS}\n`);

  // Step 1: Scan the codebase ONCE
  console.log("Scanning codebase...");
  const graph = scanCodebase(TARGET_CODEBASE);
  console.log(
    `Found ${graph.totalFiles} files, ${graph.nodes.length} nodes, ${graph.edges.length} edges, ${graph.modules.length} modules\n`,
  );

  // Step 2: Generate ALL encodings from the SAME graph
  const outputDir = path.join(__dirname, "output");
  fs.mkdirSync(outputDir, { recursive: true });

  console.log("Generating encodings from same scan...");

  const textContent = encodeToText(graph);
  console.log(
    `  Text Only:    ${textContent.length} chars (~${Math.ceil(textContent.length / 4)} tokens)`,
  );

  const strandV1Content = encodeToStrandFormatV1(graph);
  console.log(
    `  .strand v1:   ${strandV1Content.length} chars (~${Math.ceil(strandV1Content.length / 4)} tokens) [frozen encoder, same graph]`,
  );

  const strandV2Content = encodeToStrandFormat(graph);
  fs.writeFileSync(
    path.join(outputDir, "exp4-strand-v2.strand"),
    strandV2Content,
  );
  console.log(
    `  .strand v2:   ${strandV2Content.length} chars (~${Math.ceil(strandV2Content.length / 4)} tokens)`,
  );

  console.log("\nAll encodings generated from same scan.\n");

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

  // Map condition IDs to their content and format name
  const conditionContent: Record<ConditionId, { name: string; content: string }> = {
    text: { name: "structured text", content: textContent },
    "strand-v1": { name: ".strand v1", content: strandV1Content },
    "strand-v2": { name: ".strand v2", content: strandV2Content },
  };

  const results: QuestionResult[] = [];

  for (const q of QUESTIONS) {
    console.log(`\n--- Question ${q.id}: ${q.type} ---`);
    console.log(`"${q.question}"\n`);

    const conditionResults: ConditionResult[] = [];

    for (const condition of CONDITIONS) {
      console.log(`  [${condition.id}] ${condition.name}...`);

      const { name: formatName, content } = conditionContent[condition.id];
      const prompt = buildPrompt(formatName, content, q.question);

      const trials: TrialResult[] = [];

      for (let t = 0; t < TRIALS; t++) {
        const response = await client.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          messages: [{ role: "user", content: prompt }],
        });

        const text =
          response.content[0]?.type === "text" ? response.content[0].text : "";
        trials.push({
          trial: t + 1,
          response: text,
          tokens: {
            input: response.usage.input_tokens,
            output: response.usage.output_tokens,
          },
        });

        console.log(
          `    trial ${t + 1}: ${response.usage.input_tokens}in/${response.usage.output_tokens}out`,
        );
      }

      conditionResults.push({
        conditionId: condition.id,
        conditionName: condition.name,
        trials,
      });
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
  printScoring(results);
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
      console.log(`  [${cr.conditionId}] ${cr.conditionName} (${cr.trials.length} trials):`);
      // Show first trial response truncated
      const firstResponse = cr.trials[0]?.response || "";
      console.log(
        `    ${firstResponse.slice(0, 200).replace(/\n/g, "\n    ")}${firstResponse.length > 200 ? "..." : ""}`,
      );

      for (const trial of cr.trials) {
        const t = totals.get(cr.conditionId as ConditionId)!;
        t.input += trial.tokens.input;
        t.output += trial.tokens.output;
      }

      // Show per-trial token counts
      const trialTokens = cr.trials
        .map((t) => `${t.tokens.input + t.tokens.output}`)
        .join(", ");
      console.log(`    Tokens per trial: [${trialTokens}]\n`);
    }
  }

  console.log("\n========================================");
  console.log(`TOKEN COST SUMMARY (across all 5 questions × ${TRIALS} trials)`);
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
}

/**
 * Automated scoring for Q1 and Q3 using ground-truth rubrics.
 */
function printScoring(results: QuestionResult[]): void {
  console.log("\n\n========================================");
  console.log("SCORING RUBRICS");
  console.log("========================================\n");

  // Q1 scoring: count how many routes the response mentions
  const q1 = results.find((r) => r.questionId === "q1");
  if (q1) {
    console.log("--- Q1: Route Inventory ---");
    console.log("Ground truth: 36 API routes\n");

    for (const cr of q1.conditions) {
      console.log(`  [${cr.conditionId}]`);
      for (const trial of cr.trials) {
        // Count route-like patterns in response
        const routeMatches = trial.response.match(/\/api\/[\w/[\]-]+/g) || [];
        const uniqueRoutes = new Set(routeMatches.map((r) => r.replace(/\[.*?\]/g, "[param]")));
        const countMatch = trial.response.match(/\b(\d+)\s*(?:API\s+)?routes?\b/i);
        const statedCount = countMatch ? parseInt(countMatch[1]!) : 0;
        console.log(
          `    trial ${trial.trial}: stated=${statedCount} routes, enumerated=${uniqueRoutes.size} unique paths`,
        );
      }
    }
  }

  // Q3 scoring: check for correct and incorrect payment files
  const q3 = results.find((r) => r.questionId === "q3");
  if (q3) {
    console.log("\n--- Q3: Payment Flow Navigation ---");
    console.log("Ground truth files: orders/route, ordering, cluster-pos/client");
    console.log("False positives: catering/page, spirit-night/page\n");

    const correctFiles = ["orders/route", "ordering", "cluster-pos/client"];
    const falsePositives = ["catering/page", "spirit-night/page"];

    for (const cr of q3.conditions) {
      console.log(`  [${cr.conditionId}]`);
      for (const trial of cr.trials) {
        const resp = trial.response.toLowerCase();
        const hits = correctFiles.filter((f) => resp.includes(f));
        const misses = correctFiles.filter((f) => !resp.includes(f));
        const fps = falsePositives.filter((f) => resp.includes(f));
        const guessed = /look for files like|likely|probably|might be/.test(resp);

        console.log(
          `    trial ${trial.trial}: correct=${hits.length}/${correctFiles.length} [${hits.join(", ")}]` +
            `${misses.length > 0 ? ` missing=[${misses.join(", ")}]` : ""}` +
            `${fps.length > 0 ? ` FALSE_POS=[${fps.join(", ")}]` : ""}` +
            `${guessed ? " GUESSED_PATHS" : ""}`,
        );
      }
    }
  }

  console.log(
    "\n(Review experiments/output/experiment-4-results.json for full responses)",
  );
}

runExperiment().catch(console.error);
```

**Step 2: Run the experiment without API key to verify encoding generation**

Run: `npx tsx experiments/experiment-4-strand-v2.ts`

Expected: Scans codebase, generates 3 encodings from same graph, prints size comparison, says "ANTHROPIC_API_KEY not set — encodings saved."

**Step 3: Commit**

```bash
git add experiments/experiment-4-strand-v2.ts
git commit -m "feat: add Experiment 4 runner — fair v1 vs v2 comparison with scoring rubrics"
```

---

### Task 6: Run Experiment 4 and update FINDINGS.md

**Files:**
- Modify: `FINDINGS.md` — add Experiment 4 results section

**Step 1: Run the full experiment**

Run: `ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY npx tsx experiments/experiment-4-strand-v2.ts`

Expected: Runs all 5 questions × 3 conditions × 3 trials = 45 API calls. Prints token costs, truncated responses, and automated Q1/Q3 scoring.

**Step 2: Analyze results using the scoring output**

Read `experiments/output/experiment-4-results.json` and the scoring output:

**Q1 rubric:**
- Does v2 enumerate more routes than v1? (v1 caps at 12, v2 shows all 36)
- Does the stated count match 36 across all trials?
- Agreement rate: do all 3 trials give the same count?

**Q3 rubric:**
- Does v2 name `orders/route`, `ordering`, `cluster-pos/client`? (correct files)
- Does v2 avoid listing `catering/page` or `spirit-night/page` as payment entry points?
- Does v2 avoid guessing at non-existent file paths?
- Agreement rate: do all 3 trials name the same files?
- Compare v1 → v2 improvement on these metrics

**Q2/Q4/Q5 regression check:**
- Does v2 give comparable quality answers to v1?
- Any new hallucinations or errors introduced?

**Step 3: Add Experiment 4 section to FINDINGS.md**

Add a new section following the existing format. Include:
- Conditions table (note: all from same scan, uniform prompts, 3 trials)
- Token costs table (averaged across trials)
- Q1 scoring table (routes enumerated per condition)
- Q3 scoring table (correct files, false positives per condition)
- Key findings
- Verdict
- Update "Recommended Encodings" and "Open Questions" sections

**Step 4: Commit**

```bash
git add FINDINGS.md experiments/output/experiment-4-results.json experiments/output/exp4-strand-v2.strand
git commit -m "docs: add Experiment 4 results — .strand v2 validation with scoring"
```
