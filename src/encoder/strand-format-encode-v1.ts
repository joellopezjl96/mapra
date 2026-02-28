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

/**
 * Generate a .strand format encoding of the codebase.
 * Does NOT use the layout engine — no coordinates needed.
 */
export function encodeToStrandFormatV1(graph: StrandGraph): string {
  let out = "";

  // Header
  out += `STRAND v1 | ${graph.projectName} | ${capitalize(graph.framework)} | ${graph.totalFiles} files | ${graph.totalLines.toLocaleString()} lines\n\n`;

  // TERRAIN section — complexity heatmap
  out += renderTerrain(graph);

  // INFRASTRUCTURE section — inter-module dependency roads
  out += renderInfrastructure(graph);

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

function renderApiRoutes(graph: StrandGraph): string {
  const apiRoutes = graph.nodes
    .filter((n) => n.type === "api-route")
    .sort((a, b) => b.complexity - a.complexity);

  if (apiRoutes.length === 0) return "";

  let out = `─── API ROUTES (${apiRoutes.length}) ─────────────────────────────────\n`;

  const showCount = Math.min(apiRoutes.length, 12);
  for (let i = 0; i < showCount; i++) {
    const route = apiRoutes[i]!;
    const methods =
      (route.framework?.metadata as { methods?: string[] })?.methods?.join(
        ",",
      ) || "?";
    const routePath =
      (route.framework?.metadata as { routePath?: string })?.routePath ||
      route.path;
    const lines = `${route.lines}L`.padStart(5);
    const complexity = route.complexity.toFixed(2);

    // Annotation for key routes
    let annotation = "";
    if (route.complexity > 0.8) annotation = " ← payment+POS hub";
    else if (routePath.includes("cancel")) annotation = " ← void flow";
    else if (routePath.includes("register")) annotation = "";
    else if (routePath.includes("magic-link")) annotation = "";

    out += `${methods.padEnd(18)} ${routePath.padEnd(44)} ${lines}  ${complexity}${annotation}\n`;
  }

  if (apiRoutes.length > showCount) {
    out += `  ... +${apiRoutes.length - showCount} more routes\n`;
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

  const showCount = Math.min(pages.length, 10);
  for (let i = 0; i < showCount; i++) {
    const page = pages[i]!;
    const routePath =
      (page.framework?.metadata as { routePath?: string })?.routePath ||
      page.path;
    const client = (page.framework?.metadata as { isClientComponent?: boolean })
      ?.isClientComponent
      ? " [client]"
      : "";
    const lines = `${page.lines}L`.padStart(5);
    const complexity = page.complexity.toFixed(2);

    let annotation = "";
    if (routePath === "/") annotation = "  homepage";
    else if (routePath.includes("order/review")) annotation = "  ← payment UI";

    out += `${(routePath + client).padEnd(40)} ${lines}  ${complexity}${annotation}\n`;
  }

  if (pages.length > showCount) {
    out += `  ... +${pages.length - showCount} more pages\n`;
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

function getModuleId(nodePath: string): string {
  const parts = nodePath.split("/");
  return parts.length > 2
    ? parts.slice(0, 2).join("/")
    : (parts[0] ?? nodePath);
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
