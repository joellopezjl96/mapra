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
