/**
 * .strand Format Encoder — ASCII art + structured data
 *
 * A custom format using Unicode block chars for visual heatmaps
 * and box-drawing chars for dependency flows. No coordinates —
 * spatial relationships conveyed through grouping and visual density.
 *
 * Target: < 3KB total output.
 */

import type { StrandGraph, StrandEdge } from "../scanner/index.js";
import type { GraphAnalysis } from "../analyzer/index.js";
import { getModuleId } from "../analyzer/graph-utils.js";

export interface EncodeOptions {
  /** Short git hash at generation time (omitted from header if null/undefined) */
  gitHash?: string | null | undefined;
}

/**
 * Generate a .strand format encoding of the codebase.
 * Does NOT use the layout engine — no coordinates needed.
 */
export function encodeToStrandFormat(graph: StrandGraph, analysis?: GraphAnalysis, options?: EncodeOptions): string {
  let out = "";

  // Header
  const generated = new Date().toISOString().slice(0, 19);
  const gitSuffix = options?.gitHash ? ` | git:${options.gitHash}` : "";
  out += `STRAND v3 | ${graph.projectName} | ${capitalize(graph.framework)} | ${graph.totalFiles} files | ${graph.totalLines.toLocaleString()} lines | generated ${generated}${gitSuffix}\n`;
  out += `LEGEND: ×N=imported by N files | ═/·=coupling strong/weak | ×A→B=A direct, B total affected | dN=cascade depth | [AMP]=amplification≥2x | TN=N test files | NL=lines of code | Nx=co-change count | linked/no-import=import connection\n`;
  out += `USAGE: planning→RISK,CONVENTIONS,INFRASTRUCTURE | debugging→FLOWS,CHURN,CO-CHANGE | refactoring→RISK,CHURN,CO-CHANGE | review→CONVENTIONS,RISK,CHURN | impact-analysis→RISK,CO-CHANGE\n\n`;

  // RISK first — highest signal for change-impact questions
  if (analysis) {
    out += renderRisk(graph, analysis);
  }

  // CHURN — temporal change data
  if (analysis) {
    out += renderChurn(graph, analysis);
  }

  // CONVENTIONS — detected import patterns (with violations)
  if (analysis) {
    out += renderConventions(analysis);
  }

  // CO-CHANGE — files that change together in git history
  if (analysis) {
    out += renderCoChange(graph, analysis);
  }

  // FLOWS second — relational context for navigation questions
  out += renderFlows(graph, analysis);

  // MOST IMPORTED — file-level signals
  // Note: HOTSPOTS removed — Exp 11 showed zero regression (0.71 vs 0.71 baseline),
  // and its data overlaps heavily with API ROUTES (same files, same complexity scores).
  out += renderMostImported(graph);

  // INFRASTRUCTURE — inter-module topology
  out += renderInfrastructure(graph);

  // API ROUTES + PAGES — enumeration sections
  out += renderApiRoutes(graph);
  out += renderPages(graph);

  // TEST COVERAGE — lowest signal, fine at end
  out += renderTestCoverage(graph);

  // DEAD CODE — unreachable files
  if (analysis) {
    out += renderDeadCode(analysis);
  }

  return out;
}

function renderInfrastructure(graph: StrandGraph): string {
  let out = `─── INFRASTRUCTURE ──────────────────────────────────────\n`;
  out += `Inter-module dependency roads\n\n`;

  // Aggregate edges between modules
  const moduleEdges = new Map<
    string,
    { count: number; categories: Record<string, number> }
  >();

  for (const edge of graph.edges) {
    const fromMod = getModuleId(edge.from);
    const toMod = getModuleId(edge.to);
    if (fromMod === toMod) continue;

    const key = `${fromMod}->${toMod}`;
    if (!moduleEdges.has(key)) {
      moduleEdges.set(key, { count: 0, categories: {} });
    }
    const agg = moduleEdges.get(key)!;
    agg.count++;
    const cat = classifyEdge(edge.from, edge.to);
    agg.categories[cat] = (agg.categories[cat] || 0) + 1;
  }

  // Sort by count, show top edges
  const sorted = [...moduleEdges.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10);

  for (const [key, data] of sorted) {
    const [from, to] = key.split("->") as [string, string];
    const fromName = from.split("/").pop() ?? from;
    const toName = to.split("/").pop() ?? to;

    // Visual line style based on coupling strength
    const line =
      data.count >= 10 ? "═══════" : data.count >= 5 ? "───────" : "·······";
    const connector = "╢";

    const categories = Object.entries(data.categories)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, count]) => `${cat}:${count}`)
      .join(" ");

    out += `${fromName.padEnd(12)} ${line}${connector} ${toName.padEnd(14)} ×${data.count.toString().padStart(2)}  ${categories}\n`;
  }

  out += `\n`;
  return out;
}

function renderRisk(graph: StrandGraph, analysis: GraphAnalysis): string {
  // Filter out test files from risk — test infra inflates blast radius
  const testNodeIds = new Set(
    graph.nodes.filter(n => n.type === "test").map(n => n.id),
  );
  const filtered = analysis.risk.filter(r => !testNodeIds.has(r.nodeId));
  const top = filtered.slice(0, 8);
  if (top.length === 0) return "";

  // Build node lookup and test edge counts
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  const testCounts = new Map<string, number>();
  for (const edge of graph.edges) {
    if (edge.type === "tests") {
      testCounts.set(edge.to, (testCounts.get(edge.to) ?? 0) + 1);
    }
  }

  let out = `─── RISK (blast radius — modifying these cascades broadly) ─\n`;

  for (const r of top) {
    const isAmplified = r.amplificationRatio >= 2.0;
    const marker = isAmplified ? "[AMP]" : "     ";
    const amp = `amp${r.amplificationRatio.toFixed(1)}`.padEnd(7);
    const flow = `×${r.directImporters}→${r.affectedCount}`.padEnd(9);
    const depth = `d${r.maxDepth}`.padEnd(4);
    const mods = `${r.modulesAffected}mod`.padEnd(5);
    const tests = `T${testCounts.get(r.nodeId) ?? 0}`.padEnd(4);

    out += `${marker} ${amp} ${flow} ${depth} ${mods} ${tests} ${r.nodeId}\n`;

    // Cascade targets — which modules get hit
    if (r.affectedModuleNames && r.affectedModuleNames.length > 0) {
      const sourceModule = getModuleId(r.nodeId);
      const otherModules = r.affectedModuleNames.filter(m => m !== sourceModule);
      if (otherModules.length > 0) {
        const shown = otherModules.slice(0, 5);
        const suffix = otherModules.length > 5 ? `, +${otherModules.length - 5} more` : "";
        out += `  cascades to: ${shown.join(", ")}${suffix}\n`;
      }
    }

    // Export symbols (max 5, skip if empty)
    const node = nodeMap.get(r.nodeId);
    const exports = node?.exports?.filter((e) => e !== "default") ?? [];
    if (exports.length > 0) {
      const shown = exports.slice(0, 5);
      const suffix = exports.length > 5 ? `, +${exports.length - 5} more` : "";
      out += `  exports: ${shown.join(", ")}${suffix}\n`;
    }
  }

  const remaining = filtered.length - top.length;
  if (remaining > 0) {
    out += `  +${remaining} more with blast radius > 1\n`;
  }

  out += `\n`;
  return out;
}

function renderChurn(graph: StrandGraph, analysis: GraphAnalysis): string {
  if (!analysis.churn || analysis.churn.size === 0) return "";

  // Only show files that exist in the scanner graph (filters out .md, lock files, .strand, etc.)
  const graphNodeIds = new Set(graph.nodes.map(n => n.id));

  // Get files with >= 3 commits (high churn)
  const highChurn = [...analysis.churn.values()]
    .filter((c) => c.commits30d >= 3 && graphNodeIds.has(c.nodeId))
    .sort((a, b) => b.commits30d - a.commits30d)
    .slice(0, 10);

  if (highChurn.length === 0) return "";

  let out = `─── CHURN (last 30 days, top movers) ─────────────────────\n`;

  for (const c of highChurn) {
    const commits = `${c.commits30d} commits`.padEnd(12);
    const delta = `+${c.linesAdded30d} -${c.linesRemoved30d}`.padEnd(12);
    const msg = c.lastCommitMsg.length > 50
      ? c.lastCommitMsg.slice(0, 47) + "..."
      : c.lastCommitMsg;
    out += `${commits} ${delta} ${c.nodeId}  "${msg}"\n`;
  }

  out += `\n`;
  return out;
}

function renderConventions(analysis: GraphAnalysis): string {
  if (!analysis.conventions || analysis.conventions.length === 0) return "";

  // Cap at 8 conventions
  const top = analysis.conventions.slice(0, 8);

  let out = `─── CONVENTIONS ─────────────────────────────────────────\n`;

  for (const c of top) {
    const exports = c.anchorExports.slice(0, 3).join(", ");
    const label = exports || c.anchorFile.split("/").pop()?.replace(/\.(ts|tsx|js|jsx)$/, "") || "?";
    const coverage = `${c.adoption}/${c.total} ${c.consumerType}`;

    out += `${label.padEnd(32)} ${coverage.padEnd(16)} ${c.anchorFile}\n`;

    // Show violators for strong conventions (>= 70% adoption)
    if (c.violators && c.violators.length > 0 && c.coverage >= 0.7) {
      const shown = c.violators.slice(0, 5);
      const suffix = c.violators.length > 5 ? `, +${c.violators.length - 5} more` : "";
      const shortNames = shown.map((v) => v.split("/").pop()?.replace(/\.(ts|tsx|js|jsx)$/, "") || v);
      out += `  exceptions: ${shortNames.join(", ")}${suffix}\n`;
    }
  }

  out += `\n`;
  return out;
}

function renderCoChange(graph: StrandGraph, analysis: GraphAnalysis): string {
  if (!analysis.coChanges || analysis.coChanges.length === 0) return "";

  // Only show pairs where BOTH files exist in the scanner graph
  const graphNodeIds = new Set(graph.nodes.map(n => n.id));
  const filtered = analysis.coChanges.filter(
    pair => graphNodeIds.has(pair.fileA) && graphNodeIds.has(pair.fileB),
  );

  if (filtered.length === 0) return "";

  let out = `─── CO-CHANGE (files that change together) ───────────────\n`;

  for (const pair of filtered) {
    const shortA = shortenCoChangePath(pair.fileA);
    const shortB = shortenCoChangePath(pair.fileB);
    const freq = `${pair.coChangeCount}×`;
    const conf = `${Math.round(pair.confidence * 100)}%`;
    const link = pair.importConnected ? "linked" : "no-import";

    out += `${freq.padEnd(5)} ${shortA} ↔ ${shortB}  (${conf} ${link})\n`;
  }

  out += `\n`;
  return out;
}

function renderApiRoutes(graph: StrandGraph): string {
  const apiRoutes = graph.nodes
    .filter((n) => n.type === "api-route")
    .sort((a, b) => b.complexity - a.complexity || b.lines - a.lines);

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

function renderPages(graph: StrandGraph): string {
  const pages = graph.nodes
    .filter((n) => n.type === "route")
    .sort((a, b) => b.complexity - a.complexity || b.lines - a.lines);

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

function renderMostImported(graph: StrandGraph): string {
  // Filter out test files from most imported
  const testNodeIds = new Set(
    graph.nodes.filter(n => n.type === "test").map(n => n.id),
  );
  const edgeCounts = new Map<string, number>();
  for (const edge of graph.edges) {
    if (testNodeIds.has(edge.from)) continue;
    if (testNodeIds.has(edge.to)) continue;
    edgeCounts.set(edge.to, (edgeCounts.get(edge.to) || 0) + 1);
  }

  const mostImported = [...edgeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  if (mostImported.length === 0) return "";

  let out = `─── MOST IMPORTED ───────────────────────────────────────\n`;

  for (const [fileId, count] of mostImported) {
    out += `×${count}  ${fileId}\n`;
  }

  out += `\n`;
  return out;
}

function renderTestCoverage(graph: StrandGraph): string {
  const testNodes = graph.nodes.filter((n) => n.type === "test");
  const testEdges = graph.edges.filter((e) => e.type === "tests");
  const testedFiles = new Set(testEdges.map((e) => e.to));
  const testableFiles = graph.nodes.filter(
    (n) => n.type !== "test" && n.type !== "config",
  );
  const coveragePercent =
    testableFiles.length > 0
      ? ((testedFiles.size / testableFiles.length) * 100).toFixed(1)
      : "0";

  let out = `─── TEST COVERAGE ───────────────────────────────────────\n`;
  out += `${testNodes.length} test files | ${testedFiles.size}/${testableFiles.length} testable files with direct test edges (${coveragePercent}%)\n`;

  return out;
}

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

/**
 * Auto-detect business flows by finding API route entry points and their
 * cross-sub-module dependencies. Renders as hub-and-spoke: each entry point
 * lists its direct dependencies, classified by domain.
 *
 * This design handles star patterns (one hub importing many leaves) correctly,
 * which is the actual topology of business logic in Next.js API routes.
 */
function renderFlows(graph: StrandGraph, analysis?: GraphAnalysis): string {
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
    .sort((a, b) => b.complexity - a.complexity || b.lines - a.lines);

  // SPA fallback: no API routes — use top hub files by amplification ratio
  if (entryPoints.length === 0) {
    if (!analysis || analysis.risk.length === 0) return "";
    return renderFlowsFromHubs(graph, analysis, adj);
  }

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

function renderDeadCode(analysis: GraphAnalysis): string {
  if (!analysis.deadCode || analysis.deadCode.length === 0) return "";
  const total = analysis.deadCode.length;
  let out = `─── DEAD CODE (${total} unreachable files) ─────────────────\n`;
  const shown = analysis.deadCode.slice(0, 15);
  for (const file of shown) {
    out += `${file}\n`;
  }
  if (total > shown.length) {
    out += `+${total - shown.length} more\n`;
  }
  return out;
}

// ─── Helpers ────────────────────────────────────────────

function classifyEdge(fromPath: string, toPath: string): string {
  const combined = fromPath + " " + toPath;
  if (/auth|session|login|magic-link|trusted-device|verify/.test(combined))
    return "auth";
  if (/payment|authorize|order|cart|price|tip/.test(combined)) return "payment";
  if (/test|spec|__tests__/.test(combined)) return "test";
  if (/component|page|layout|\.tsx$/.test(combined)) return "rendering";
  return "data";
}

/**
 * Shorten a file path for CO-CHANGE display.
 * Uses last 2 path segments (parent/filename) to avoid ambiguity
 * when multiple files share the same basename (e.g., route.ts).
 */
function shortenCoChangePath(filePath: string): string {
  const parts = filePath.split("/");
  return parts.length >= 2
    ? parts.slice(-2).join("/")
    : parts[0] ?? filePath;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

