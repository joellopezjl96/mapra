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

/**
 * Generate a .strand format encoding of the codebase.
 * Does NOT use the layout engine — no coordinates needed.
 */
export function encodeToStrandFormat(graph: StrandGraph, analysis?: GraphAnalysis): string {
  let out = "";

  // Header
  out += `STRAND v2 | ${graph.projectName} | ${capitalize(graph.framework)} | ${graph.totalFiles} files | ${graph.totalLines.toLocaleString()} lines\n`;
  out += `LEGEND: ×N=imported by N files | █▓░·=complexity high→low | ═/·=coupling strong/weak | ×A→B=A direct, B total affected | dN=cascade depth | [AMP]=amplification≥2x | NL=lines of code\n\n`;

  // RISK first — highest signal for change-impact questions
  if (analysis) {
    out += renderRisk(analysis);
  }

  // FLOWS second — relational context for navigation questions
  out += renderFlows(graph, analysis);

  // HOTSPOTS + MOST IMPORTED — file-level signals
  out += renderHotspots(graph);
  out += renderMostImported(graph);

  // DOMAINS — semantic feature domain inventory
  out += renderDomains(graph);

  // TERRAIN — orientation heatmap
  out += renderTerrain(graph);

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

function renderDomains(graph: StrandGraph): string {
  const counts = new Map<string, number>();
  for (const node of graph.nodes) {
    const d = node.domain ?? "unknown";
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }

  // Drop generic filesystem buckets that aren't domains
  const EXCLUDE = new Set(["pages", "hooks", "components", "lib", "utils", "types",
                            "config", "layouts", "views", "helpers", "context"]);

  const domains = [...counts.entries()]
    .filter(([name]) => !EXCLUDE.has(name))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 24);

  if (domains.length === 0) return "";

  const lines = ["─── DOMAINS " + "─".repeat(40), "Feature domains by file count\n"];
  for (const [name, count] of domains) {
    lines.push(`${name.padEnd(28)} ${String(count).padStart(4)} files`);
  }
  lines.push("");
  return lines.join("\n") + "\n";
}

function renderTerrain(graph: StrandGraph): string {
  let out = `─── TERRAIN ─────────────────────────────────────────────\n`;
  out += `Module complexity heatmap (█=high ▓=mid ░=low ·=minimal)\n\n`;

  // Sort modules by total lines (most significant first)
  const modules = graph.modules
    .filter((m) => m.nodeCount > 0)
    .sort((a, b) => b.totalLines - a.totalLines);

  // Calculate avg complexity per module
  const moduleComplexities = new Map<string, number>();
  for (const mod of modules) {
    const modNodes = graph.nodes.filter((n) => {
      const parts = n.path.split("/");
      const key = parts.length > 2 ? parts.slice(0, 2).join("/") : parts[0];
      return key === mod.id;
    });
    const avg =
      modNodes.length > 0
        ? modNodes.reduce((sum, n) => sum + n.complexity, 0) / modNodes.length
        : 0;
    moduleComplexities.set(mod.id, avg);
  }

  const BAR_WIDTH = 10;
  for (const mod of modules) {
    const complexity = moduleComplexities.get(mod.id) ?? 0;
    const bar = complexityBar(complexity, BAR_WIDTH);
    const name = mod.name.padEnd(14);
    const cStr = complexity.toFixed(2);
    const files = `${mod.nodeCount} files`.padStart(9);
    const lines = `${mod.totalLines.toLocaleString()}L`.padStart(8);

    // Brief description based on path
    const desc = moduleDescription(mod.path, graph);
    out += `${bar}  ${name} ${cStr} ${files} ${lines}  ${desc}\n`;
  }

  out += `\n`;
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

function renderHotspots(graph: StrandGraph): string {
  const complex = graph.nodes
    .filter(
      (n) => n.type !== "test" && n.type !== "config" && n.complexity > 0.3,
    )
    .sort((a, b) => b.complexity - a.complexity)
    .slice(0, 10);

  if (complex.length === 0) return "";

  let out = `─── HOTSPOTS (complexity > 0.3) ─────────────────────────\n`;

  for (const node of complex) {
    const methods =
      node.type === "api-route"
        ? ((node.framework?.metadata as { methods?: string[] })?.methods?.join(
            ",",
          ) ?? "")
        : "";
    const client =
      node.type === "route" &&
      (node.framework?.metadata as { isClientComponent?: boolean })
        ?.isClientComponent
        ? "[client]"
        : "";
    const suffix = [methods, client].filter(Boolean).join(" ");

    out += `${node.complexity.toFixed(2)}  ${node.path.padEnd(52)} ${String(node.lines).padStart(4)}L ${String(node.imports.length).padStart(2)}imp ${suffix}\n`;
  }

  out += `\n`;
  return out;
}

function renderMostImported(graph: StrandGraph): string {
  const edgeCounts = new Map<string, number>();
  for (const edge of graph.edges) {
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
    .sort((a, b) => b.complexity - a.complexity);

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
  return `─── DEAD CODE: ${analysis.deadCode.length} unreachable files ─────────────────\n`;
}

// ─── Helpers ────────────────────────────────────────────

/**
 * Generate a 10-char complexity bar using Unicode block chars.
 * █ = high (0.7-1.0), ▓ = mid (0.4-0.7), ░ = low (0.15-0.4), · = minimal (0-0.15)
 */
function complexityBar(complexity: number, width: number): string {
  const filled = Math.round(complexity * width);
  let bar = "";

  for (let i = 0; i < width; i++) {
    if (i < filled) {
      // Determine char based on position relative to complexity
      const posRatio = (i + 1) / width;
      if (posRatio <= complexity * 0.5) bar += "█";
      else if (posRatio <= complexity * 0.75) bar += "▓";
      else bar += "░";
    } else {
      bar += "·";
    }
  }

  // Ensure at least the first char reflects the minimum complexity
  if (complexity > 0.01 && filled === 0) {
    bar = "·" + bar.slice(1);
  }

  return bar;
}

function classifyEdge(fromPath: string, toPath: string): string {
  const combined = fromPath + " " + toPath;
  if (/auth|session|login|magic-link|trusted-device|verify/.test(combined))
    return "auth";
  if (/payment|authorize|order|cart|price|tip/.test(combined)) return "payment";
  if (/test|spec|__tests__/.test(combined)) return "test";
  if (/component|page|layout|\.tsx$/.test(combined)) return "rendering";
  return "data";
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

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
