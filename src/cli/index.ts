#!/usr/bin/env node
/**
 * strand CLI
 *
 * Commands:
 *   strand setup [path]    Generate .strand and wire CLAUDE.md (first-time setup)
 *   strand generate [path] Scan codebase and write .strand file
 *   strand update [path]   Regenerate .strand in place (alias for generate in cwd)
 *   strand init [path]     Wire .strand into project's CLAUDE.md
 *   strand status [path]   Show current strand setup state
 *   strand validate-plan <plan.md> [--since YYYY-MM-DD]  Cross-reference plan against .strand
 *   strand batch <config.json> [--resume]  Run batch experiment from config
 */

import * as fs from "fs";
import * as path from "path";
import { applyStrandSection, SUPERSESSION_MESSAGE, type StrandAction } from "./templates.js";

const [, , command, ...args] = process.argv;

if (command === "--help" || command === "-h") {
  printHelp();
  process.exit(0);
}

if (!command) {
  console.log(
    "No command given — running setup (generate + init) in current directory.",
  );
  console.log("Use 'strand --help' to see all commands.\n");
  await runSetup(undefined);
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
    try {
      await runGenerate(args[0] ?? process.cwd(), true);
    } catch (err) {
      console.error(
        `strand update failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      console.error(
        "Continuing with stale .strand. Complete your refactor and retry.",
      );
    }
    break;
  case "init":
    await runInit(args[0]);
    break;
  case "status":
    await runStatus(args[0]);
    break;
  case "validate-plan": {
    // Handle: strand validate-plan plan.md --since 2026-02-25
    const sinceIdx = args.indexOf("--since");
    const since = sinceIdx >= 0 ? args[sinceIdx + 1] : undefined;
    const planFile = args.find((a) => !a.startsWith("--") && a !== since);
    await runValidatePlan(planFile, since);
    break;
  }
  case "batch": {
    const configFile = args.find((a) => !a.startsWith("--"));
    const resume = args.includes("--resume");
    await runBatchCommand(configFile, resume);
    break;
  }
  default:
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exit(1);
}

function printHelp() {
  console.log(`
strand — codebase cartography for AI

Quick start:
  strand                        Run setup in current directory (first-time setup)
  strand update                 Regenerate .strand after codebase changes

Commands:
  setup [path]    Run generate then init (recommended for first-time setup)
  generate [path] Scan codebase and write .strand to project root
  update [path]   Regenerate .strand in place (alias for generate in cwd)
  init [path]     Wire @.strand reference into project's CLAUDE.md
  status [path]   Show whether .strand is present, wired, and fresh
  validate-plan <plan.md> [--since YYYY-MM-DD]
                  Cross-reference plan file paths against .strand data
  batch <config.json> [--resume]
                  Run batch experiment comparing encoding conditions

  Default path: current working directory

Examples:
  strand setup                      # first-time setup in cwd
  strand setup /path/to/project     # first-time setup for a specific project
  strand update                     # refresh after code changes
  strand status                     # check current state
  strand batch experiments/configs/strand-v3-effectiveness.json
`);
}

async function runSetup(targetArg?: string) {
  console.log("Setting up strand...\n");
  await runGenerate(targetArg);
  console.log();
  await runInit(targetArg);
  console.log("\nDone. Open Claude Code and ask about your codebase.");
}

async function runGenerate(targetArg?: string, softFail = false) {
  const targetPath = resolveTarget(targetArg);

  try {
    const { scanCodebase } = await import("../scanner/index.js");
    const { analyzeGraph } = await import("../analyzer/index.js");
    const { encodeToStrandFormat } =
      await import("../encoder/strand-format-encode.js");

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

    const analysis = analyzeGraph(graph, targetPath);
    const encoded = encodeToStrandFormat(graph, analysis);
    const tokens = Math.round(encoded.length / 4);

    const tmpPath = outputPath + ".tmp";
    fs.writeFileSync(tmpPath, encoded, "utf-8");
    try {
      fs.renameSync(tmpPath, outputPath);
    } catch {
      // Windows: rename can fail if another process holds a read handle.
      // Fall back to direct write.
      fs.writeFileSync(outputPath, encoded, "utf-8");
      try { fs.unlinkSync(tmpPath); } catch { /* ignore cleanup failure */ }
    }

    const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "");
    console.log(
      `\nWrote .strand  (${encoded.length.toLocaleString()} chars  ~${tokens} tokens)`,
    );
    console.log(SUPERSESSION_MESSAGE(timestamp));
  } catch (err) {
    if (softFail) throw err;
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

    const existingContent = fs.existsSync(claudePath)
      ? fs.readFileSync(claudePath, "utf-8")
      : null;

    const { content, action } = applyStrandSection(existingContent);

    if (action === "up-to-date") {
      console.log(`Already up to date — CLAUDE.md has current strand section`);
      return;
    }

    fs.writeFileSync(claudePath, content, "utf-8");

    const messages: Record<Exclude<StrandAction, "up-to-date">, string> = {
      created: `Created CLAUDE.md and wired @.strand`,
      upgraded: `Upgraded strand section in CLAUDE.md`,
      "legacy-upgraded": `Upgraded CLAUDE.md — added section markers for future updates`,
      appended: `Wired — added @.strand reference to ${claudePath}`,
    };
    console.log(messages[action]);
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
    const ageStr =
      ageDays === 0 ? "today" : `${ageDays} day${ageDays !== 1 ? "s" : ""} ago`;
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
    console.log(
      `  CLAUDE.md     ${wired ? "✓ wired" : "✗ not wired (run 'strand init')"}`,
    );
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

async function runValidatePlan(planArg?: string, sinceDate?: string) {
  if (!planArg) {
    console.error("Usage: strand validate-plan <plan.md> [--since YYYY-MM-DD]");
    process.exit(1);
  }

  const planPath = path.resolve(planArg);
  if (!fs.existsSync(planPath)) {
    console.error(`Error: plan file not found: ${planPath}`);
    process.exit(1);
  }

  // Find project root (walk up to find .strand)
  let projectRoot = path.dirname(planPath);
  while (projectRoot !== path.dirname(projectRoot)) {
    if (fs.existsSync(path.join(projectRoot, ".strand"))) break;
    projectRoot = path.dirname(projectRoot);
  }

  const strandPath = path.join(projectRoot, ".strand");
  if (!fs.existsSync(strandPath)) {
    console.error("Error: no .strand file found. Run 'strand generate' first.");
    process.exit(1);
  }

  // Staleness check: warn if .strand is older than newest source file
  const strandMtime = fs.statSync(strandPath).mtimeMs;
  const sourceMtime = newestSourceFileMtime(projectRoot);
  if (sourceMtime > strandMtime) {
    const ageDays = Math.floor((Date.now() - strandMtime) / 86_400_000);
    console.warn(
      `Warning: .strand is ${ageDays > 0 ? `${ageDays}d` : "<1d"} old and source files have changed since.`,
    );
    console.warn(
      `Run 'strand generate' first for accurate churn and risk data.\n`,
    );
  }

  const { extractFilePaths } = await import("./plan-parser.js");
  const { scanCodebase } = await import("../scanner/index.js");
  const { analyzeGraph } = await import("../analyzer/index.js");

  const planContent = fs.readFileSync(planPath, "utf-8");
  const planPaths = extractFilePaths(planContent);

  console.log(
    `Plan references ${planPaths.length} files. Validating against current codebase...\n`,
  );

  if (planPaths.length === 0) {
    console.log("No file paths found in plan. Nothing to validate.");
    return;
  }

  // Scan and analyze
  const graph = scanCodebase(projectRoot);
  const analysis = analyzeGraph(graph, projectRoot);

  // Build lookup maps
  const riskMap = new Map(analysis.risk.map((r) => [r.nodeId, r]));
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  const testCounts = new Map<string, number>();
  for (const edge of graph.edges) {
    if (edge.type === "tests") {
      testCounts.set(edge.to, (testCounts.get(edge.to) ?? 0) + 1);
    }
  }

  // Parse --since date
  const since = sinceDate ? new Date(sinceDate) : undefined;

  // Categorize plan files
  const stale: Array<{
    path: string;
    churn?: import("../analyzer/churn.js").ChurnResult | undefined;
    risk?: import("../analyzer/blast-radius.js").BlastResult | undefined;
  }> = [];
  const highCascade: Array<{
    path: string;
    risk: import("../analyzer/blast-radius.js").BlastResult;
    node?: import("../scanner/index.js").StrandNode;
    tests: number;
  }> = [];
  const notFound: string[] = [];

  for (const filePath of planPaths) {
    const node = nodeMap.get(filePath);
    const risk = riskMap.get(filePath);
    const churn = analysis.churn.get(filePath);

    if (!node) {
      notFound.push(filePath);
      continue;
    }

    // Stale: has churn data (modified recently)
    if (churn && churn.commits30d > 0) {
      if (!since || new Date(churn.lastCommitDate) >= since) {
        stale.push({ path: filePath, churn, risk });
      }
    }

    // High cascade: amplification >= 2.0
    if (risk && risk.amplificationRatio >= 2.0) {
      highCascade.push({
        path: filePath,
        risk,
        node,
        tests: testCounts.get(filePath) ?? 0,
      });
    }
  }

  // Report: STALE
  if (stale.length > 0) {
    console.log(
      `STALE (modified${since ? ` since ${since.toISOString().slice(0, 10)}` : " in last 30 days"}):`,
    );
    for (const s of stale) {
      console.log(`  ${s.path}`);
      if (s.churn) {
        console.log(
          `    ${s.churn.commits30d} commits, +${s.churn.linesAdded30d} -${s.churn.linesRemoved30d} lines`,
        );
        console.log(
          `    Last: "${s.churn.lastCommitMsg}" (${s.churn.lastCommitDate.slice(0, 10)})`,
        );
      }
      if (s.risk) {
        const amp = s.risk.amplificationRatio >= 2.0 ? "[AMP] " : "";
        console.log(
          `    RISK: ${amp}amp${s.risk.amplificationRatio.toFixed(1)} ×${s.risk.directImporters}→${s.risk.affectedCount} d${s.risk.maxDepth}`,
        );
      }
    }
    console.log();
  }

  // Report: HIGH CASCADE
  if (highCascade.length > 0) {
    console.log("HIGH CASCADE (amplification >= 2.0):");
    for (const h of highCascade) {
      console.log(`  ${h.path}`);
      console.log(
        `    RISK: [AMP] amp${h.risk.amplificationRatio.toFixed(1)} ×${h.risk.directImporters}→${h.risk.affectedCount} d${h.risk.maxDepth}`,
      );
      if (h.node?.exports && h.node.exports.length > 0) {
        const shown = h.node.exports.filter((e) => e !== "default").slice(0, 5);
        if (shown.length > 0) console.log(`    exports: ${shown.join(", ")}`);
      }
      console.log(`    Tests: ${h.tests} file${h.tests !== 1 ? "s" : ""}`);
    }
    console.log();
  }

  // Report: MISSING CONVENTIONS
  if (analysis.conventions.length > 0) {
    const missing: string[] = [];
    for (const conv of analysis.conventions) {
      // Check if plan adds new files of this consumer type
      const newFilesOfType = notFound.filter((p) => {
        // Rough type detection from path
        if (
          conv.consumerType === "api-route" &&
          /\/api\/.*route\.(ts|js)$/.test(p)
        )
          return true;
        if (conv.consumerType === "route" && /\/page\.(tsx|jsx)$/.test(p))
          return true;
        return false;
      });

      if (newFilesOfType.length > 0) {
        const label =
          conv.anchorExports.slice(0, 2).join(", ") ||
          conv.anchorFile
            .split("/")
            .pop()
            ?.replace(/\.\w+$/, "") ||
          "?";
        missing.push(
          `Plan adds ${conv.consumerType} but may not import ${label} from ${conv.anchorFile} (${conv.adoption}/${conv.total} ${conv.consumerType}s use it)`,
        );
      }
    }

    if (missing.length > 0) {
      console.log("MISSING CONVENTIONS:");
      for (const m of missing) {
        console.log(`  ${m}`);
      }
      console.log();
    }
  }

  // Report: DEAD CODE REFERENCED
  const deadCodeSet = new Set(analysis.deadCode);
  const deadRefs = planPaths.filter((p) => deadCodeSet.has(p));
  if (deadRefs.length > 0) {
    console.log("DEAD CODE REFERENCED (plan modifies unreachable files):");
    for (const d of deadRefs) {
      console.log(`  ${d}`);
    }
    console.log();
  }

  // Report: NOT FOUND (new files the plan will create)
  if (notFound.length > 0) {
    console.log(
      `NEW FILES (${notFound.length} paths not in current codebase):`,
    );
    for (const p of notFound) {
      console.log(`  ${p}`);
    }
    console.log();
  }

  // Summary
  console.log(
    `SUMMARY: ${stale.length} stale, ${highCascade.length} high-cascade, ${deadRefs.length} dead-code, ${notFound.length} new files`,
  );
}

async function runBatchCommand(configArg?: string, resume?: boolean) {
  if (!configArg) {
    console.error("Usage: strand batch <config.json> [--resume]");
    process.exit(1);
  }

  const configPath = path.resolve(configArg);
  if (!fs.existsSync(configPath)) {
    console.error(`Error: config file not found: ${configPath}`);
    process.exit(1);
  }

  if (!process.env["ANTHROPIC_API_KEY"]) {
    console.error("Error: ANTHROPIC_API_KEY environment variable is required");
    console.error("  Set it: ANTHROPIC_API_KEY=sk-... strand batch <config>");
    process.exit(1);
  }

  try {
    const { runBatch } = await import("../batch/runner.js");
    await runBatch(configPath, { resume });
  } catch (err) {
    handleError("batch", err);
  }
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
  if (
    err instanceof Error &&
    (err as NodeJS.ErrnoException).code === "EACCES"
  ) {
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
