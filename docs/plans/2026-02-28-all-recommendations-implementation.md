# All Recommendations Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement three phases of improvements from the design review: format changes (RISK reorder/reformat, FLOWS SPA fallback, computed module descriptions), CLI improvements (setup/update/status commands, init fixes, error handling), and scanner improvements (domain detection, dead code analysis, O(N²) fix, edge weight normalization).

**Architecture:** All changes are in-place edits to existing files. Phase 1 changes `strand-format-encode.ts` and `analyzer/index.ts`. Phase 2 creates `src/cli/index.ts` and patches `package.json`. Phase 3 modifies `scanner/index.ts` and `analyzer/index.ts`. Each phase ends with a verification step. The frozen v1 encoder (`strand-format-encode-v1.ts`) is never touched.

**Tech Stack:** TypeScript (nodenext modules), tsx for dev execution, Node.js fs/path/process. No new dependencies.

---

## Phase 1 — Format Changes

### Task 1: Change RISK sort key from weightedImpact to amplificationRatio

**Files:**
- Modify: `src/analyzer/index.ts`

**Context:** Currently `analyzeGraph()` sorts RISK results by `weightedImpact` descending. This caused `roles/types.ts` (amp 4.6) to rank 5th in Exp 5 because `GenericAppConnectionFields.tsx` (52 affected, amp 1.0) had higher weighted impact despite being less dangerous. Amplification ratio is the key insight — it surfaces files whose small direct-importer count cascades to many.

**Step 1: Open `src/analyzer/index.ts`**

Current sort (line 31-33):
```typescript
const risk = [...blastMap.values()].sort(
  (a, b) => b.weightedImpact - a.weightedImpact,
);
```

**Step 2: Change the sort key**

Replace the sort with:
```typescript
const risk = [...blastMap.values()].sort(
  (a, b) => b.amplificationRatio - a.amplificationRatio,
);
```

**Step 3: Verify**

```bash
npx tsx -e "
import { scanCodebase } from './src/scanner/index.js';
import { analyzeGraph } from './src/analyzer/index.js';
const g = scanCodebase('C:/dev/infisical/frontend');
const a = analyzeGraph(g);
console.log('Top 3 RISK by new sort:');
a.risk.slice(0, 3).forEach(r => console.log(r.amplificationRatio.toFixed(1), r.nodeId));
"
```

Expected: `roles/types.ts` (amp 4.6) appears in top 3, not 5th.

**Step 4: Commit**

```bash
git add src/analyzer/index.ts
git commit -m "feat(analyzer): sort RISK by amplificationRatio instead of weightedImpact

roles/types.ts (amp 4.6) was ranked 5th behind files with higher absolute
impact but lower amplification. Amplification ratio surfaces hidden cascades
from files with few direct importers.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Reformat RISK rows and reorder sections

**Files:**
- Modify: `src/encoder/strand-format-encode.ts`

**Context:** Two changes in one file:
1. `renderRisk()` — new row format leads with amplification ratio, uses compact `×11→51` notation, adds `[AMP]` marker for ratio ≥ 2.0
2. `encodeToStrandFormat()` — reorder section calls so RISK and FLOWS come first

**Step 1: Replace `renderRisk()` function**

Find (lines 151-175):
```typescript
function renderRisk(analysis: GraphAnalysis): string {
  const top = analysis.risk.slice(0, 8);
  if (top.length === 0) return "";

  let out = `─── RISK (change with care) ─────────────────────────────\n`;

  for (const r of top) {
    const name = r.nodeId.padEnd(40);
    const affected = `${r.affectedCount} affected`.padStart(12);
    const depth = `depth ${r.maxDepth}`;
    const inbound = `×${r.directImporters} in`.padStart(6);
    const mods = `${r.modulesAffected} mod`;
    const amp = `amp ${r.amplificationRatio.toFixed(1)}`;

    out += `${name} ${affected}  ${depth}  ${inbound}  ${mods}  ${amp}\n`;
  }

  const remaining = analysis.risk.length - top.length;
  if (remaining > 0) {
    out += `  +${remaining} more with blast radius > 1\n`;
  }

  out += `\n`;
  return out;
}
```

Replace with:
```typescript
function renderRisk(analysis: GraphAnalysis): string {
  const top = analysis.risk.slice(0, 8);
  if (top.length === 0) return "";

  let out = `─── RISK (blast radius — modifying these cascades broadly) ─\n`;

  for (const r of top) {
    const isAmplified = r.amplificationRatio >= 2.0;
    const marker = isAmplified ? "[AMP]" : "     ";
    const amp = `amp${r.amplificationRatio.toFixed(1)}`.padEnd(7);
    const flow = `×${r.directImporters}→${r.affectedCount}`.padEnd(9);
    const depth = `d${r.maxDepth}`.padEnd(4);
    const mods = `${r.modulesAffected}mod`.padEnd(5);

    out += `${marker} ${amp} ${flow} ${depth} ${mods} ${r.nodeId}\n`;
  }

  const remaining = analysis.risk.length - top.length;
  if (remaining > 0) {
    out += `  +${remaining} more with blast radius > 1\n`;
  }

  out += `\n`;
  return out;
}
```

**Step 2: Reorder sections in `encodeToStrandFormat()`**

Find (lines 25-53):
```typescript
  // TERRAIN section — complexity heatmap
  out += renderTerrain(graph);

  // INFRASTRUCTURE section — inter-module dependency roads
  out += renderInfrastructure(graph);

  // RISK section — blast radius analysis
  if (analysis) {
    out += renderRisk(analysis);
  }

  // FLOWS section — entry point dependency maps
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
```

Replace with:
```typescript
  // RISK first — highest signal for change-impact questions
  if (analysis) {
    out += renderRisk(analysis);
  }

  // FLOWS second — relational context for navigation questions
  out += renderFlows(graph, analysis);

  // HOTSPOTS + MOST IMPORTED — file-level signals
  out += renderHotspots(graph);
  out += renderMostImported(graph);

  // TERRAIN — orientation heatmap
  out += renderTerrain(graph);

  // INFRASTRUCTURE — inter-module topology
  out += renderInfrastructure(graph);

  // API ROUTES + PAGES — enumeration sections
  out += renderApiRoutes(graph);
  out += renderPages(graph);

  // TEST COVERAGE — lowest signal, fine at end
  out += renderTestCoverage(graph);
```

Note: `renderFlows` now takes a second argument — that's implemented in Task 3.

**Step 3: Verify the new row format compiles**

```bash
npx tsc --noEmit
```

Expected: type error on `renderFlows(graph, analysis)` (expected 1 arg, got 2) — this is expected until Task 3 fixes the signature. All other errors should be zero.

**Step 4: Commit**

```bash
git add src/encoder/strand-format-encode.ts
git commit -m "feat(encoder): reorder sections and reformat RISK rows

- RISK and FLOWS move to positions 2-3 (highest-signal sections first)
- RISK rows lead with amplification ratio and [AMP] marker for ratio >= 2.0
- Compact x11->51 notation replaces verbose 'x11 in  51 affected'
- Section header updated: 'blast radius — modifying these cascades broadly'

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Add FLOWS SPA fallback

**Files:**
- Modify: `src/encoder/strand-format-encode.ts`

**Context:** `renderFlows` currently returns `""` for SPAs because it only looks for `api-route` nodes. When there are no API routes AND analysis is available, fall back to showing the top 5 hub files (by `amplificationRatio`) and their cross-module dependencies. This gives SPAs the same relational context that FLOWS provides for Next.js apps.

**Step 1: Change `renderFlows` signature**

Find (line 388):
```typescript
function renderFlows(graph: StrandGraph): string {
```

Replace with:
```typescript
function renderFlows(graph: StrandGraph, analysis?: GraphAnalysis): string {
```

**Step 2: Add SPA fallback after the `entryPoints.length === 0` early return**

Find (lines 404-408):
```typescript
  // 2. Find entry points: API routes with outgoing cross-sub-module edges
  const entryPoints = graph.nodes
    .filter((n) => n.type === "api-route" && adj.has(n.id))
    .sort((a, b) => b.complexity - a.complexity);

  if (entryPoints.length === 0) return "";
```

Replace with:
```typescript
  // 2. Find entry points: API routes with outgoing cross-sub-module edges
  const entryPoints = graph.nodes
    .filter((n) => n.type === "api-route" && adj.has(n.id))
    .sort((a, b) => b.complexity - a.complexity);

  // SPA fallback: no API routes — use top hub files by amplification ratio
  if (entryPoints.length === 0) {
    if (!analysis || analysis.risk.length === 0) return "";
    return renderFlowsFromHubs(graph, analysis, adj);
  }
```

**Step 3: Add the `renderFlowsFromHubs` helper function**

Insert after the closing `}` of `renderFlows` (before `// ─── Helpers ─`):

```typescript
/**
 * SPA fallback for FLOWS: use high-amplification hub files as implicit entry points.
 * Shows their cross-module dependencies in the same format as API-route FLOWS.
 */
function renderFlowsFromHubs(
  graph: StrandGraph,
  analysis: GraphAnalysis,
  adj: Map<string, Set<string>>,
): string {
  // Take top 5 by amplificationRatio that have cross-module outgoing edges
  const hubs = analysis.risk
    .filter((r) => adj.has(r.nodeId))
    .slice(0, 5);

  if (hubs.length === 0) return "";

  let out = `─── FLOWS (entry hubs) ──────────────────────────────────\n`;
  out += `High-amplification hubs and their cross-module dependencies\n\n`;

  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));

  for (const hub of hubs) {
    const deps = [...(adj.get(hub.nodeId) || [])];
    if (deps.length === 0) continue;

    // Sort deps by complexity
    deps.sort((a, b) => {
      const ca = nodeMap.get(a)?.complexity ?? 0;
      const cb = nodeMap.get(b)?.complexity ?? 0;
      return cb - ca;
    });

    const entryStr = shortenPath(hub.nodeId);
    const depStr = deps.map((p) => shortenPath(p)).join(", ");
    const marker = hub.amplificationRatio >= 2.0 ? "[AMP]" : "     ";

    out += `${marker} ${entryStr} -> ${depStr}\n`;
  }

  out += `\n`;
  return out;
}
```

**Step 4: Fix the TypeScript compile error from Task 2**

```bash
npx tsc --noEmit
```

Expected: 0 errors (the `renderFlows(graph, analysis)` call in `encodeToStrandFormat` now type-checks because `analysis` is `GraphAnalysis | undefined` and the parameter is `analysis?: GraphAnalysis`).

**Step 5: Quick smoke test on Infisical**

```bash
npx tsx -e "
import { scanCodebase } from './src/scanner/index.js';
import { analyzeGraph } from './src/analyzer/index.js';
import { encodeToStrandFormat } from './src/encoder/strand-format-encode.js';
const g = scanCodebase('C:/dev/infisical/frontend');
const a = analyzeGraph(g);
const encoded = encodeToStrandFormat(g, a);
const lines = encoded.split('\n');
const flowsIdx = lines.findIndex(l => l.includes('FLOWS'));
console.log('FLOWS section at line:', flowsIdx);
console.log(lines.slice(flowsIdx, flowsIdx + 6).join('\n'));
"
```

Expected: FLOWS section is non-empty, shows hub files with `->` dependency lists.

**Step 6: Commit**

```bash
git add src/encoder/strand-format-encode.ts
git commit -m "feat(encoder): add FLOWS SPA fallback using high-amplification hubs

When no API routes exist (SPA topology), FLOWS now shows the top 5 hub files
by amplificationRatio and their cross-module deps. Infisical's routeTree.gen.ts
becomes the entry hub instead of FLOWS being empty.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Replace hardcoded `moduleDescription()` with computed version

**Files:**
- Modify: `src/encoder/strand-format-encode.ts`

**Context:** Current `moduleDescription()` has 9 hardcoded strings tied to SenorBurritoCompany vocabulary (lines 526-538). For Infisical, `lib` gets labeled `"auth, payment, POS, email"` — completely wrong. Replace with: find the 3 most-imported file names within the module from `graph.edges`.

**Step 1: Replace the `moduleDescription` function**

Find (lines 526-538):
```typescript
function moduleDescription(modPath: string, graph: StrandGraph): string {
  const lower = modPath.toLowerCase();
  if (lower.includes("app")) return "routes, pages, admin, TLC";
  if (lower.includes("test")) return "unit, api, integration";
  if (lower.includes("lib")) return "auth, payment, POS, email";
  if (lower.includes("component")) return "TLC, admin, kitchen, shared";
  if (lower.includes("script")) return "deploy, sync, broadcast";
  if (lower.includes("cluster")) return "POS API client";
  if (lower.includes("prisma")) return "schema, migrations";
  if (lower.includes("data")) return "menu-pricing";
  if (lower.includes("e2e")) return "end-to-end tests";
  return "";
}
```

Replace with:
```typescript
/**
 * Compute a module description from the 3 most-imported file names within it.
 * Always correct because it derives from the actual graph, not from path guessing.
 */
function moduleDescription(modPath: string, graph: StrandGraph): string {
  // Count inbound edges for files within this module
  const inboundCounts = new Map<string, number>();
  for (const edge of graph.edges) {
    if (edge.to.startsWith(modPath + "/") || edge.to === modPath) {
      inboundCounts.set(edge.to, (inboundCounts.get(edge.to) || 0) + 1);
    }
  }

  if (inboundCounts.size === 0) return "";

  // Take top 3 by inbound count, use basename without extension
  const top3 = [...inboundCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([filePath]) => {
      const base = filePath.split("/").pop() ?? filePath;
      return base.replace(/\.(ts|tsx|js|jsx)$/, "");
    });

  return top3.join(", ");
}
```

**Step 2: Verify for both codebases**

```bash
npx tsx -e "
import { scanCodebase } from './src/scanner/index.js';
import { analyzeGraph } from './src/analyzer/index.js';
import { encodeToStrandFormat } from './src/encoder/strand-format-encode.js';

console.log('--- SenorBurritoCompany ---');
const g1 = scanCodebase('C:/dev/senorburritocompany');
const a1 = analyzeGraph(g1);
const e1 = encodeToStrandFormat(g1, a1);
const lines1 = e1.split('\n');
const terrainIdx1 = lines1.findIndex(l => l.includes('TERRAIN'));
console.log(lines1.slice(terrainIdx1, terrainIdx1 + 8).join('\n'));

console.log('\n--- Infisical ---');
const g2 = scanCodebase('C:/dev/infisical/frontend');
const a2 = analyzeGraph(g2);
const e2 = encodeToStrandFormat(g2, a2);
const lines2 = e2.split('\n');
const terrainIdx2 = lines2.findIndex(l => l.includes('TERRAIN'));
console.log(lines2.slice(terrainIdx2, terrainIdx2 + 8).join('\n'));
"
```

Expected for Infisical: `lib` row now shows actual file names like `utils, types, constants` instead of `"auth, payment, POS, email"`.

**Step 3: Commit**

```bash
git add src/encoder/strand-format-encode.ts
git commit -m "feat(encoder): replace hardcoded moduleDescription with computed top-3 importees

The old function returned project-specific strings (auth, payment, POS, email)
for any path containing 'lib', which was wrong for every codebase except
SenorBurritoCompany. New version derives from the 3 most-imported files
within the module — always accurate.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Run Experiment 5 to verify Phase 1 improvements

**Files:** No changes — this is a verification run.

**Step 1: Run Experiment 5**

```bash
npx tsx experiments/experiment-5-generalization.ts
```

This will run 45 API calls (3 conditions × 5 questions × 3 trials). Allow ~5 minutes.

**Step 2: Check results**

```bash
cat experiments/output/experiment-5-results.json | npx tsx -e "
const data = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf-8'));
// Print Q3 and Q5 results for all conditions
const conditions = ['text-only', 'strand-v2', 'strand-v2-risk'];
for (const cond of conditions) {
  const q3 = data.results?.filter(r => r.condition === cond && r.question === 'Q3');
  const q5 = data.results?.filter(r => r.condition === cond && r.question === 'Q5');
  console.log(cond, 'Q3:', q3?.length, 'Q5:', q5?.length);
}
"
```

**Step 3: Manually verify RISK ranking**

In the new experiment output, check that for `strand-v2-risk` condition:
- Q3 responses cite `roles/types.ts` (should now appear in top results since it ranks #1 in RISK)
- Q5 responses should still score 3/3 correct high-impact files

**Step 4: Check token costs haven't grown > 15%**

The Exp 5 baseline for v2+Risk was 27,705 total tokens (across 5Q × 3 trials). New total should be ≤ 31,860.

**Step 5: Log findings**

Add an "Experiment 5 Rerun" section to `FINDINGS.md` noting any changes. If scores improve, document it.

---

## Phase 2 — CLI Changes

### Task 6: Implement `strand setup`, `strand update`, and `strand status` commands

**Files:**
- Create: `src/cli/index.ts`

**Context:** The CLI plan (`docs/plans/2026-02-28-strand-cli.md`) has Tasks 1-3 covering a `generate` and `init` skeleton. This task implements the full CLI including the new commands from the design review. We implement the complete file here rather than following the original plan's incremental steps.

**Step 1: Create `src/cli/index.ts`**

```typescript
/**
 * strand CLI
 *
 * Commands:
 *   strand setup [path]    Generate .strand and wire CLAUDE.md (first-time setup)
 *   strand generate [path] Scan codebase and write .strand file
 *   strand update [path]   Regenerate .strand in place (alias for generate in cwd)
 *   strand init [path]     Wire .strand into project's CLAUDE.md
 *   strand status [path]   Show current strand setup state
 */

import * as fs from "fs";
import * as path from "path";

const [, , command, ...args] = process.argv;

if (!command || command === "--help" || command === "-h") {
  printHelp();
  process.exit(0);
}

switch (command) {
  case "setup":
    await runSetup(args[0]);
    break;
  case "generate":
    await runGenerate(args[0]);
    break;
  case "update":
    await runGenerate(args[0] ?? process.cwd());
    break;
  case "init":
    await runInit(args[0]);
    break;
  case "status":
    await runStatus(args[0]);
    break;
  default:
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exit(1);
}

function printHelp() {
  console.log(`
strand — codebase cartography for AI

Quick start:
  strand setup                  Generate .strand and wire CLAUDE.md in one step
  strand update                 Regenerate .strand after codebase changes

Commands:
  setup [path]    Run generate then init (recommended for first-time setup)
  generate [path] Scan codebase and write .strand to project root
  update [path]   Regenerate .strand in place (alias for generate in cwd)
  init [path]     Wire @.strand reference into project's CLAUDE.md
  status [path]   Show whether .strand is present, wired, and fresh

  Default path: current working directory

Examples:
  strand setup                      # first-time setup in cwd
  strand setup /path/to/project     # first-time setup for a specific project
  strand update                     # refresh after code changes
  strand status                     # check current state
`);
}

async function runSetup(targetArg?: string) {
  console.log("Setting up strand...\n");
  await runGenerate(targetArg);
  console.log();
  await runInit(targetArg);
  console.log("\nDone. Open Claude Code and ask about your codebase.");
}

async function runGenerate(targetArg?: string) {
  const targetPath = resolveTarget(targetArg);

  try {
    const { scanCodebase } = await import("../scanner/index.js");
    const { analyzeGraph } = await import("../analyzer/index.js");
    const { encodeToStrandFormat } = await import(
      "../encoder/strand-format-encode.js"
    );

    const outputPath = path.join(targetPath, ".strand");

    console.log(`Scanning ${targetPath}`);
    const graph = await Promise.resolve(scanCodebase(targetPath));

    const riskCount = graph.nodes.filter(
      (n) =>
        n.type !== "test" &&
        n.type !== "config" &&
        graph.edges.filter((e) => e.to === n.id).length > 3,
    ).length;

    console.log(
      `  ${graph.totalFiles} files  ${graph.totalLines.toLocaleString()} lines  ${graph.modules.length} modules  ${riskCount} high-import files`,
    );

    const analysis = analyzeGraph(graph);
    const encoded = encodeToStrandFormat(graph, analysis);
    const tokens = Math.round(encoded.length / 4);

    fs.writeFileSync(outputPath, encoded, "utf-8");
    console.log(
      `\nWrote .strand  (${encoded.length.toLocaleString()} chars  ~${tokens} tokens)`,
    );
  } catch (err) {
    handleError("generate", err);
  }
}

async function runInit(targetArg?: string) {
  const targetPath = resolveTarget(targetArg);

  try {
    const strandPath = path.join(targetPath, ".strand");
    const claudePath = path.join(targetPath, "CLAUDE.md");

    // Guard: .strand must exist and be non-empty
    if (!fs.existsSync(strandPath)) {
      console.error(`Error: .strand not found at ${strandPath}`);
      console.error(`Run 'strand generate' or 'strand setup' first.`);
      process.exit(1);
    }

    const strandSize = fs.statSync(strandPath).size;
    if (strandSize < 100) {
      console.error(
        `Warning: .strand appears malformed (${strandSize} bytes). Re-run 'strand generate'.`,
      );
      process.exit(1);
    }

    const section = `
---

## Codebase Map

Before exploring files to answer questions about structure, architecture,
dependencies, or change impact — read the .strand encoding first. Only
open individual files when you need implementation details the encoding
doesn't provide.

@.strand
`;

    if (!fs.existsSync(claudePath)) {
      // Create a minimal CLAUDE.md
      const content = `# Project Notes\n${section}`;
      fs.writeFileSync(claudePath, content, "utf-8");
      console.log(`Created CLAUDE.md and wired @.strand`);
      return;
    }

    const existing = fs.readFileSync(claudePath, "utf-8");

    // Idempotent: check for @.strand on its own line
    if (/^@\.strand$/m.test(existing)) {
      console.log(`Already wired — CLAUDE.md already references @.strand`);
      return;
    }

    fs.writeFileSync(claudePath, existing.trimEnd() + "\n" + section, "utf-8");
    console.log(`Wired — added @.strand reference to ${claudePath}`);
  } catch (err) {
    handleError("init", err);
  }
}

async function runStatus(targetArg?: string) {
  const targetPath = resolveTarget(targetArg);
  const strandPath = path.join(targetPath, ".strand");
  const claudePath = path.join(targetPath, "CLAUDE.md");
  const gitignorePath = path.join(targetPath, ".gitignore");

  console.log(`Status for: ${targetPath}\n`);

  // .strand presence and staleness
  if (!fs.existsSync(strandPath)) {
    console.log(`  .strand       ✗ not found (run 'strand setup')`);
  } else {
    const strandMtime = fs.statSync(strandPath).mtimeMs;
    const sourceMtime = newestSourceFileMtime(targetPath);
    const ageMs = Date.now() - strandMtime;
    const ageDays = Math.floor(ageMs / 86_400_000);
    const ageStr = ageDays === 0 ? "today" : `${ageDays} day${ageDays !== 1 ? "s" : ""} ago`;
    const stale = sourceMtime > strandMtime;
    const staleStr = stale ? " ⚠ may be stale (run 'strand update')" : "";
    console.log(`  .strand       ✓ present (updated ${ageStr})${staleStr}`);
  }

  // CLAUDE.md wiring
  if (!fs.existsSync(claudePath)) {
    console.log(`  CLAUDE.md     ✗ not found (run 'strand init')`);
  } else {
    const content = fs.readFileSync(claudePath, "utf-8");
    const wired = /^@\.strand$/m.test(content);
    console.log(`  CLAUDE.md     ${wired ? "✓ wired" : "✗ not wired (run 'strand init')"}`);
  }

  // .gitignore check
  if (fs.existsSync(gitignorePath)) {
    const gitignore = fs.readFileSync(gitignorePath, "utf-8");
    if (/^\.?strand$/m.test(gitignore) || /^\*\.strand$/m.test(gitignore)) {
      console.log(
        `  .gitignore    ⚠ .strand appears to be ignored — collaborators won't have the map`,
      );
    }
  }

  console.log();
}

// ─── Helpers ────────────────────────────────────────────

function resolveTarget(targetArg?: string): string {
  const targetPath = path.resolve(targetArg ?? process.cwd());

  if (!fs.existsSync(targetPath)) {
    console.error(`Error: path does not exist: ${targetPath}`);
    process.exit(1);
  }

  const stat = fs.statSync(targetPath);
  if (!stat.isDirectory()) {
    console.error(`Error: expected a directory, got a file: ${targetPath}`);
    process.exit(1);
  }

  if (!fs.existsSync(path.join(targetPath, "package.json"))) {
    console.warn(
      `Warning: no package.json found at ${targetPath} — are you in the right directory?`,
    );
  }

  return targetPath;
}

function handleError(command: string, err: unknown): never {
  if (err instanceof Error && (err as NodeJS.ErrnoException).code === "EACCES") {
    console.error(`Error: permission denied`);
    process.exit(1);
  }
  console.error(`Error: ${command} failed unexpectedly`);
  if (err instanceof Error) console.error(err.message);
  console.error(
    `\nPlease report this at https://github.com/joellopezjl96/strand/issues`,
  );
  process.exit(1);
}

function newestSourceFileMtime(targetPath: string): number {
  // Only check top-level src/ to avoid scanning everything
  const srcPath = path.join(targetPath, "src");
  if (!fs.existsSync(srcPath)) return 0;

  let newest = 0;
  function scan(dir: string) {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name === ".git") continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scan(full);
        } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
          const mtime = fs.statSync(full).mtimeMs;
          if (mtime > newest) newest = mtime;
        }
      }
    } catch {
      // skip unreadable dirs
    }
  }
  scan(srcPath);
  return newest;
}
```

**Step 2: Test the CLI**

```bash
# Help
npx tsx src/cli/index.ts --help

# Status (before setup)
npx tsx src/cli/index.ts status C:/dev/senorburritocompany

# Full setup
npx tsx src/cli/index.ts setup C:/dev/senorburritocompany

# Status (after setup)
npx tsx src/cli/index.ts status C:/dev/senorburritocompany

# Update (idempotent)
npx tsx src/cli/index.ts update C:/dev/senorburritocompany

# Init idempotency
npx tsx src/cli/index.ts init C:/dev/senorburritocompany
```

Expected outputs:
- `--help`: shows Quick start + all 5 commands
- `status` before setup: shows `✗ not found` for both .strand and CLAUDE.md
- `setup`: prints scanning stats, then "Wired — added @.strand reference to ..."
- `status` after: shows `✓ present` and `✓ wired`
- `init` again: "Already wired"

**Step 3: Test error cases**

```bash
# File path instead of directory
npx tsx src/cli/index.ts generate C:/dev/senorburritocompany/package.json

# Non-existent path
npx tsx src/cli/index.ts generate C:/dev/nonexistent
```

Expected: clear error messages, exit code 1.

**Step 4: Commit**

```bash
git add src/cli/index.ts
git commit -m "feat(cli): implement setup, update, status commands + init improvements

- strand setup: first-time command (generate + init in one step)
- strand update: intention-revealing alias for generate in cwd
- strand status: reports .strand freshness, CLAUDE.md wiring, .gitignore warnings
- init: creates CLAUDE.md if absent instead of erroring
- init: fixes idempotency check to use /^@\.strand$/m regex
- All commands: path validation, EACCES handling, missing package.json warning

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 7: Fix `package.json` for distribution

**Files:**
- Modify: `package.json`

**Step 1: Read current `package.json`**

```bash
cat package.json
```

**Step 2: Apply all distribution fixes**

Edit `package.json` to add/change:
1. Add `"files": ["dist/", "README.md"]` — prevents experiments/, docs/, src/ from being published
2. Add `"engines": { "node": ">=18" }` — top-level await + ESM requires Node 18+
3. Update `"keywords"` to include `"claude"`, `"claude-code"`, `"context-window"`
4. Move `"tsx"` from `"dependencies"` to `"devDependencies"`

The `dependencies` block after the change should only contain packages needed at runtime: `@anthropic-ai/sdk`, `sharp`, `tree-sitter`, `tree-sitter-typescript`, `typescript`.

**Step 3: Verify `tsx` still works after moving to devDependencies**

```bash
npx tsx src/cli/index.ts --help
```

Expected: help text prints (tsx is still available via npx/local node_modules in development).

**Step 4: Commit**

```bash
git add package.json
git commit -m "chore(package): fix distribution config for npm publish readiness

- Add files field (dist/, README.md) to prevent publishing src/experiments/docs
- Add engines: node >=18 (top-level await + ESM require)
- Add claude/claude-code/context-window to keywords
- Move tsx to devDependencies (runtime code uses compiled dist/)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Phase 3 — Scanner Changes

### Task 8: Add `domain` field to `StrandNode` and implement `detectDomain()`

**Files:**
- Modify: `src/scanner/index.ts`

**Context:** Currently `getModuleId()` slices the first 2 path segments, so `src/components/secrets/` and `src/components/certs/` both become `src/components`. Adding a `domain` field to each node — populated from TanStack Router route patterns, Next.js route paths, barrel files, or directory name fallback — gives all downstream consumers (TERRAIN, FLOWS, RISK) accurate semantic grouping.

**Step 1: Add `domain` field to `StrandNode` interface**

Find (lines 11-36):
```typescript
export interface StrandNode {
  id: string;
  path: string;
  type: ...
  name: string;
  lines: number;
  imports: string[];
  exports: string[];
  framework?: { ... };
  complexity: number;
  children?: string[];
}
```

Add `domain?: string;` after `complexity`:
```typescript
  complexity: number; // 0-1 normalized
  domain?: string;    // business domain (e.g. "secrets", "pki", "auth")
  children?: string[]; // child node IDs (for modules)
```

**Step 2: Add the `detectDomain` function**

Insert before `function walkDir(` (around line 148):

```typescript
/**
 * Detect the business domain for a file.
 * Priority: TanStack Router route > Next.js route path > barrel file > directory fallback.
 */
function detectDomain(
  relativePath: string,
  content: string,
  frameworkMeta: StrandNode["framework"] | null,
): string | undefined {
  // 1. TanStack Router: createFileRoute('/secrets/detail') → "secrets"
  const tanstackMatch = content.match(
    /createFileRoute\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/,
  );
  if (tanstackMatch && tanstackMatch[1]) {
    const firstSegment = tanstackMatch[1].split("/").filter(Boolean)[0];
    if (firstSegment && firstSegment !== "_authenticated") return firstSegment;
  }

  // 2. Next.js route path from framework metadata
  if (frameworkMeta?.type === "nextjs-page" || frameworkMeta?.type === "nextjs-api") {
    const routePath = frameworkMeta.metadata?.routePath as string | undefined;
    if (routePath) {
      const firstSegment = routePath.split("/").filter(Boolean)[0];
      if (firstSegment) return firstSegment.replace(/\[.*\]/, "").replace(/-/g, "_") || undefined;
    }
  }

  // 3. Barrel file: index.ts/tsx where >50% of content is re-exports → parent dir name
  const isBarrel =
    relativePath.endsWith("/index.ts") ||
    relativePath.endsWith("/index.tsx") ||
    relativePath.endsWith("/index.js") ||
    relativePath.endsWith("/index.jsx");
  if (isBarrel) {
    const reExportCount = (
      content.match(/export\s+\{[^}]+\}\s+from\s+['"]/g) || []
    ).length;
    const totalExports = (content.match(/^export\s/gm) || []).length;
    if (reExportCount > 2 && totalExports > 0 && reExportCount / totalExports > 0.5) {
      const parts = relativePath.split("/");
      // parent directory name (e.g. src/components/secrets/index.ts → "secrets")
      return parts[parts.length - 2];
    }
  }

  // 4. Fallback: second path segment (e.g. src/components → "components", src/hooks → "hooks")
  const parts = relativePath.split("/");
  if (parts.length > 2) return parts[1];
  if (parts.length === 2) return parts[0];
  return undefined;
}
```

**Step 3: Call `detectDomain` in `walkDir`**

Find the node creation block in `walkDir` (around lines 172-189):
```typescript
      const node: StrandNode = {
        id: relativePath,
        path: relativePath,
        type,
        name: entry.name,
        lines,
        imports,
        exports,
        complexity: 0,
      };

      // Add framework metadata
      const fwMeta = extractFrameworkMetadata(relativePath, content, framework);
      if (fwMeta) {
        node.framework = fwMeta;
      }

      nodes.push(node);
```

Replace with:
```typescript
      // Add framework metadata first (domain detection uses it)
      const fwMeta = extractFrameworkMetadata(relativePath, content, framework);

      const node: StrandNode = {
        id: relativePath,
        path: relativePath,
        type,
        name: entry.name,
        lines,
        imports,
        exports,
        complexity: 0,
        domain: detectDomain(relativePath, content, fwMeta),
      };

      if (fwMeta) {
        node.framework = fwMeta;
      }

      nodes.push(node);
```

**Step 4: Verify domain detection on Infisical**

```bash
npx tsx -e "
import { scanCodebase } from './src/scanner/index.js';
const g = scanCodebase('C:/dev/infisical/frontend');
// Show domain distribution
const domainCounts = new Map();
for (const n of g.nodes) {
  if (n.domain) domainCounts.set(n.domain, (domainCounts.get(n.domain) || 0) + 1);
}
const sorted = [...domainCounts.entries()].sort((a,b) => b[1]-a[1]).slice(0, 15);
console.log('Top 15 detected domains:');
sorted.forEach(([d, c]) => console.log(' ', c.toString().padStart(4), d));

// Show TanStack-detected files specifically
const tanstack = g.nodes.filter(n => n.domain && n.path.includes('routes'));
console.log('\nTanStack route domains (first 10):');
tanstack.slice(0, 10).forEach(n => console.log(' ', n.domain, '←', n.path));
"
```

Expected: domains like `secrets`, `pki`, `kms`, `ssh` appear in the list — not just `components`, `hooks`, `pages`.

**Step 5: Commit**

```bash
git add src/scanner/index.ts
git commit -m "feat(scanner): add domain field to StrandNode with detectDomain()

Detects business domains via TanStack Router createFileRoute() patterns,
Next.js route paths, barrel file analysis, and directory fallback.

For Infisical frontend, this recovers secrets/pki/kms/ssh/etc as distinct
domains instead of collapsing all to 'components' or 'hooks'.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 9: Add dead code detection to analyzer and encoder

**Files:**
- Modify: `src/analyzer/index.ts`
- Modify: `src/encoder/strand-format-encode.ts`

**Context:** Files with zero inbound edges that aren't routes/configs/tests are likely dead code. We already compute reverse adjacency in `analyzeGraph()`—dead code detection is a free O(N) pass over the nodes. Add it to `GraphAnalysis` and render a new `─── DEAD CODE ───` section in the encoder.

**Step 1: Update `GraphAnalysis` interface in `src/analyzer/index.ts`**

Find:
```typescript
export interface GraphAnalysis {
  risk: BlastResult[]; // sorted by weightedImpact desc
}
```

Replace with:
```typescript
export interface GraphAnalysis {
  risk: BlastResult[];   // sorted by amplificationRatio desc
  deadCode: string[];    // node IDs with zero inbound edges (likely unused)
}
```

**Step 2: Add dead code detection in `analyzeGraph()`**

Find:
```typescript
  // Sort by weightedImpact descending
  const risk = [...blastMap.values()].sort(
    (a, b) => b.amplificationRatio - a.amplificationRatio,
  );

  return { risk };
```

Replace with:
```typescript
  // Sort by amplificationRatio descending
  const risk = [...blastMap.values()].sort(
    (a, b) => b.amplificationRatio - a.amplificationRatio,
  );

  // Dead code: files with no inbound edges (not routes, configs, or tests)
  const SKIP_TYPES = new Set<StrandNode["type"]>([
    "route", "api-route", "config", "test", "layout", "middleware",
  ]);
  const deadCode = graph.nodes
    .filter(
      (n) =>
        !SKIP_TYPES.has(n.type) &&
        !reverseAdj.has(n.id),
    )
    .map((n) => n.id);

  return { risk, deadCode };
```

Note: the `analyzeGraph` signature must now accept `graph` as a parameter to access `graph.nodes`. Check if it already does — it does: `export function analyzeGraph(graph: StrandGraph): GraphAnalysis`.

However, `StrandNode` is not yet imported in `analyzer/index.ts`. Add the import at the top:
```typescript
import type { StrandGraph, StrandNode } from "../scanner/index.js";
```

**Step 3: Add `renderDeadCode()` to `src/encoder/strand-format-encode.ts`**

Add a new function before `// ─── Helpers ────`:

```typescript
function renderDeadCode(analysis: GraphAnalysis): string {
  if (!analysis.deadCode || analysis.deadCode.length === 0) return "";

  const cap = 10;
  const shown = analysis.deadCode.slice(0, cap);
  const remaining = analysis.deadCode.length - shown.length;

  let out = `─── DEAD CODE (${analysis.deadCode.length} unreachable files) ────────────────\n`;
  for (const fileId of shown) {
    out += `  ${fileId}\n`;
  }
  if (remaining > 0) {
    out += `  +${remaining} more\n`;
  }
  out += `\n`;
  return out;
}
```

**Step 4: Call `renderDeadCode` in `encodeToStrandFormat()`**

In the section render list, add after TEST COVERAGE:
```typescript
  // DEAD CODE — unreachable files
  if (analysis) {
    out += renderDeadCode(analysis);
  }
```

**Step 5: Verify**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

```bash
npx tsx -e "
import { scanCodebase } from './src/scanner/index.js';
import { analyzeGraph } from './src/analyzer/index.js';
import { encodeToStrandFormat } from './src/encoder/strand-format-encode.js';
const g = scanCodebase('C:/dev/senorburritocompany');
const a = analyzeGraph(g);
console.log('Dead code count:', a.deadCode.length);
console.log('First 5:', a.deadCode.slice(0, 5));
const enc = encodeToStrandFormat(g, a);
const lines = enc.split('\n');
const deadIdx = lines.findIndex(l => l.includes('DEAD CODE'));
if (deadIdx >= 0) console.log('\nDEAD CODE section:\n' + lines.slice(deadIdx, deadIdx + 8).join('\n'));
else console.log('No dead code found (expected for a well-maintained codebase)');
"
```

**Step 6: Commit**

```bash
git add src/analyzer/index.ts src/encoder/strand-format-encode.ts
git commit -m "feat(analyzer): add dead code detection to GraphAnalysis

Files with zero inbound edges (excluding routes/configs/tests) are likely
unused. Adds deadCode: string[] to GraphAnalysis and renders as a
DEAD CODE section in the .strand encoding.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 10: Fix O(N²) entry-point detection in `detectModules`

**Files:**
- Modify: `src/scanner/index.ts`

**Context:** The current `detectModules` entry-point loop is O(N²): for each node in a module group, it scans all other nodes' raw `imports` string arrays. At 3K files this is ~7M string operations; at 10K it would be ~70M. The resolved `edges` array is already available before `detectModules` runs — we can use it for O(N) lookup. We need to pass `edges` into `detectModules`.

**Step 1: Change `detectModules` to accept edges**

Find (line 481):
```typescript
function detectModules(nodes: StrandNode[], rootDir: string): ModuleBoundary[] {
```

Replace with:
```typescript
function detectModules(
  nodes: StrandNode[],
  rootDir: string,
  edges: StrandEdge[],
): ModuleBoundary[] {
```

**Step 2: Replace the O(N²) entry-point detection inside `detectModules`**

Find (lines 496-508):
```typescript
  for (const [dirPath, groupNodes] of dirGroups) {
    // Find entry points — nodes imported by files outside this module
    const entryPoints = groupNodes
      .filter((n) =>
        nodes.some(
          (other) =>
            !other.path.startsWith(dirPath) &&
            other.imports.some((imp) =>
              imp.includes(n.path.replace(/\.(ts|tsx|js|jsx)$/, "")),
            ),
        ),
      )
      .map((n) => n.id);
```

Replace with:
```typescript
  // Build a set of (from, to) pairs for cross-module edges once (O(E))
  // Key: toNodeId → true if it has at least one importer outside its module
  const crossModuleTargets = new Set<string>();
  for (const edge of edges) {
    // We'll check per-dirPath below, but pre-collect all cross-module "to" nodes
    crossModuleTargets.add(edge.to + "|" + edge.from);
  }

  for (const [dirPath, groupNodes] of dirGroups) {
    // Entry points: nodes in this module that are imported by files OUTSIDE this module
    const groupNodeIds = new Set(groupNodes.map((n) => n.id));
    const entryPoints = groupNodes
      .filter((n) =>
        edges.some(
          (e) =>
            e.to === n.id && !groupNodeIds.has(e.from),
        ),
      )
      .map((n) => n.id);
```

**Step 3: Update `scanCodebase` to pass `edges` to `detectModules`**

Find (line 100):
```typescript
  const modules = detectModules(nodes, rootDir);
```

Replace with:
```typescript
  const modules = detectModules(nodes, rootDir, edges);
```

**Step 4: Verify correctness**

```bash
npx tsx -e "
import { scanCodebase } from './src/scanner/index.js';
const g = scanCodebase('C:/dev/senorburritocompany');
console.log('Modules:', g.modules.length);
console.log('Entry points per module:');
g.modules.slice(0, 5).forEach(m => console.log(' ', m.name, '→', m.entryPoints.length, 'entry points'));
"
```

Expected: same module count as before, no crashes, entry point counts are plausible.

**Step 5: Commit**

```bash
git add src/scanner/index.ts
git commit -m "perf(scanner): fix O(N²) entry-point detection in detectModules

Old: for each module node, scan all other nodes' raw imports strings
New: pre-build edge set, check membership with O(1) lookup

At 3K files: ~7M string ops → ~3K edge checks
At 10K files: ~70M string ops → ~10K edge checks

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 11: Normalize edge weights and fix `Math.max` stack safety

**Files:**
- Modify: `src/scanner/index.ts`

**Context:** Two independent fixes:
1. `resolveEdges` sets `weight: 1` for every edge. Normalize by importer count: `1 / Math.log(1 + importerCount)` so frequently-imported utilities have lower coupling weight per edge.
2. `calculateComplexity` uses `Math.max(...nodes.map(n => n.lines))` which can throw a stack overflow for arrays > ~100K elements. Replace with `reduce`.

**Step 1: Fix `resolveEdges` to normalize edge weights**

In `resolveEdges`, after the `for (const node of nodes)` loop closes, add a post-processing pass:

Find the closing `}` of `resolveEdges` (around line 388):
```typescript
  }
}
```

Replace the entire `resolveEdges` function body with the addition of weight normalization:

Find:
```typescript
function resolveEdges(
  nodes: StrandNode[],
  edges: StrandEdge[],
  rootDir: string,
): void {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const pathAliases = detectPathAliases(rootDir);

  for (const node of nodes) {
    for (const importPath of node.imports) {
      const resolvedId = resolveImportPath(importPath, node.path, pathAliases);
      if (resolvedId) {
        const target = findNodeByImport(resolvedId, nodeMap);
        if (target) {
          const edgeType = node.type === "test" ? "tests" : "imports";
          edges.push({
            from: node.id,
            to: target.id,
            type: edgeType,
            weight: 1,
          });
        }
      }
    }
  }
}
```

Replace with:
```typescript
function resolveEdges(
  nodes: StrandNode[],
  edges: StrandEdge[],
  rootDir: string,
): void {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const pathAliases = detectPathAliases(rootDir);

  for (const node of nodes) {
    for (const importPath of node.imports) {
      const resolvedId = resolveImportPath(importPath, node.path, pathAliases);
      if (resolvedId) {
        const target = findNodeByImport(resolvedId, nodeMap);
        if (target) {
          const edgeType = node.type === "test" ? "tests" : "imports";
          edges.push({
            from: node.id,
            to: target.id,
            type: edgeType,
            weight: 1, // normalized below
          });
        }
      }
    }
  }

  // Normalize weights: files imported by many callers have lower coupling per edge.
  // weight = 1 / log(1 + importerCount) so a file with 100 importers has weight ~0.22.
  const importerCounts = new Map<string, number>();
  for (const e of edges) {
    importerCounts.set(e.to, (importerCounts.get(e.to) || 0) + 1);
  }
  for (const e of edges) {
    const count = importerCounts.get(e.to) || 1;
    e.weight = Math.round((1 / Math.log(1 + count)) * 100) / 100;
  }
}
```

**Step 2: Fix `calculateComplexity` to use `reduce`**

Find (lines 523-534):
```typescript
function calculateComplexity(nodes: StrandNode[]): void {
  if (nodes.length === 0) return;

  const maxLines = Math.max(...nodes.map((n) => n.lines));
  const maxImports = Math.max(...nodes.map((n) => n.imports.length));
  ...
```

Replace the two `Math.max` spread lines:
```typescript
  const maxLines = nodes.reduce((max, n) => (n.lines > max ? n.lines : max), 0);
  const maxImports = nodes.reduce(
    (max, n) => (n.imports.length > max ? n.imports.length : max),
    0,
  );
```

**Step 3: Verify**

```bash
npx tsc --noEmit
```

```bash
npx tsx -e "
import { scanCodebase } from './src/scanner/index.js';
const g = scanCodebase('C:/dev/senorburritocompany');
// Check weight distribution
const weights = g.edges.map(e => e.weight);
const min = Math.min(...weights);
const max = Math.max(...weights);
const avg = weights.reduce((a,b) => a+b, 0) / weights.length;
console.log('Edge weight range:', min.toFixed(2), '-', max.toFixed(2), 'avg:', avg.toFixed(2));
// Verify no more weight:1 for all edges
const allOne = weights.every(w => w === 1);
console.log('All weights still 1?', allOne, '(should be false)');
"
```

Expected: weights vary (0.2-0.9 range roughly), `allOne` is false.

**Step 4: Commit**

```bash
git add src/scanner/index.ts
git commit -m "fix(scanner): normalize edge weights and prevent Math.max stack overflow

- Edge weight = 1/log(1+importerCount): shared utilities get lower coupling
  weight per edge (a file with 100 importers: weight ~0.22 vs 1.0)
- Replace Math.max(...arr.map()) spread with reduce() to prevent stack
  overflow on large codebases (> ~100K nodes)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 12: Final verification — re-run Experiment 5

**Files:** No changes — full verification run.

**Step 1: Build the project**

```bash
npm run build
```

Expected: 0 TypeScript errors, `dist/` populated.

**Step 2: Re-run Experiment 5**

```bash
npx tsx experiments/experiment-5-generalization.ts
```

**Step 3: Check the three success criteria**

**Criterion 1:** `roles/types.ts` must rank #1 in RISK for the `.strand v2+Risk` condition.

Inspect the `.strand` output:
```bash
npx tsx -e "
import { scanCodebase } from './src/scanner/index.js';
import { analyzeGraph } from './src/analyzer/index.js';
import { encodeToStrandFormat } from './src/encoder/strand-format-encode.js';
const g = scanCodebase('C:/dev/infisical/frontend');
const a = analyzeGraph(g);
const enc = encodeToStrandFormat(g, a);
const lines = enc.split('\n');
const riskIdx = lines.findIndex(l => l.includes('RISK'));
console.log(lines.slice(riskIdx, riskIdx + 12).join('\n'));
"
```

Expected: first row shows `roles/types.ts` or similar with `[AMP]` marker.

**Criterion 2:** FLOWS section must be non-empty for Infisical.

In the output above, check that a FLOWS section appears before HOTSPOTS.

**Criterion 3:** Token cost within 15% of 27,705 (Exp 5 baseline).

Check `experiments/output/experiment-5-results.json` for total token counts.

**Step 4: Document results in `FINDINGS.md`**

Add a new section at the bottom of `FINDINGS.md`:

```markdown
## Experiment 5 Rerun: Phase 1 Improvements Validation

**Date:** 2026-02-28
**Changes from Phase 1:**
- RISK sorted by amplificationRatio (was weightedImpact)
- RISK rows: amp-first, [AMP] marker, ×11→51 notation
- Sections reordered: RISK + FLOWS first
- FLOWS SPA fallback for non-API codebases
- moduleDescription() computed from graph (was hardcoded)

### RISK Ranking Change

| Before | After | File |
|--------|-------|------|
| #5 | **#1** | src/hooks/api/roles/types.ts (amp 4.6) |
| #1 | #2 | src/components/.../GenericAppConnectionFields.tsx (amp 1.0) |

### FLOWS

Before: empty for Infisical (SPA, no API routes)
After: [document what hub files appear]

### Token Costs

[fill in from results.json]

### Q3 / Q5 Score Changes

[fill in from experiment results]
```

**Step 5: Commit**

```bash
git add FINDINGS.md
git commit -m "docs: log Experiment 5 rerun results after Phase 1 improvements

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Summary

| Task | Files | Change |
|------|-------|--------|
| 1 | `analyzer/index.ts` | Sort RISK by amplificationRatio |
| 2 | `encoder/strand-format-encode.ts` | New RISK row format + section reorder |
| 3 | `encoder/strand-format-encode.ts` | FLOWS SPA fallback |
| 4 | `encoder/strand-format-encode.ts` | Computed `moduleDescription()` |
| 5 | (experiment run) | Verify Phase 1 improvements |
| 6 | `src/cli/index.ts` | Full CLI: setup/update/status/generate/init |
| 7 | `package.json` | Distribution fixes |
| 8 | `scanner/index.ts` | `domain` field + `detectDomain()` |
| 9 | `analyzer/index.ts`, `encoder/strand-format-encode.ts` | Dead code detection |
| 10 | `scanner/index.ts` | O(N²) → O(N) in `detectModules` |
| 11 | `scanner/index.ts` | Edge weight normalization + Math.max fix |
| 12 | (experiment run) | Final verification |
