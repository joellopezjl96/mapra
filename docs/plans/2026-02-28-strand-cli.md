# strand CLI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the `strand` CLI so that `strand generate` produces a `.strand` file in any project root, and `strand init` wires it into that project's CLAUDE.md via `@.strand`.

**Architecture:** Two commands in `src/cli/index.ts` — `generate` (scan + analyze + encode → write `.strand`) and `init` (append a `## Codebase Map\n@.strand` section to the target project's CLAUDE.md). The CLI is the public surface; all encoding logic stays in the existing encoder/analyzer modules. The `.strand` file is plain UTF-8 text, committed alongside the project it describes. CLAUDE.md consumes it via Claude Code's `@filename` import syntax, which inlines the file content at session start.

**Tech Stack:** TypeScript (nodenext modules), Node.js `fs`/`path`/`process`, tsx for dev execution, tsc for production build. No new dependencies.

---

### Why `@.strand` in CLAUDE.md works

Claude Code supports `@filename` references in CLAUDE.md — the file's content is inlined automatically at session start. This means:
- `.strand` holds the encoding (generated artifact, updated when codebase changes)
- CLAUDE.md holds the instruction + reference (`@.strand`) — one line, never changes
- Auto-compact survivors: the `context-reinjection.cjs` hook re-injects CLAUDE.md contents on compaction, so `.strand` persists through long sessions

---

### Task 1: Create `src/cli/index.ts` — argument parsing skeleton

**Files:**
- Create: `src/cli/index.ts`

**Step 1: Write the file**

```typescript
#!/usr/bin/env node
/**
 * strand CLI
 *
 * Usage:
 *   strand generate [path]   Scan codebase at [path] (default: cwd) and write .strand
 *   strand init [path]       Add @.strand reference to [path]/CLAUDE.md
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const [, , command, ...args] = process.argv;

if (!command || command === "--help" || command === "-h") {
  printHelp();
  process.exit(0);
}

switch (command) {
  case "generate":
    await runGenerate(args[0]);
    break;
  case "init":
    await runInit(args[0]);
    break;
  default:
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exit(1);
}

function printHelp() {
  console.log(`
strand — codebase cartography for AI

Commands:
  generate [path]   Scan codebase and write .strand to project root
                    Default path: current working directory

  init [path]       Add @.strand reference to CLAUDE.md
                    Default path: current working directory

Examples:
  strand generate                  # scan cwd
  strand generate /path/to/project # scan specific project
  strand init                      # wire .strand into cwd/CLAUDE.md
`);
}

async function runGenerate(targetArg?: string) {
  // stub — implemented in Task 2
  console.log("generate:", targetArg ?? process.cwd());
}

async function runInit(targetArg?: string) {
  // stub — implemented in Task 3
  console.log("init:", targetArg ?? process.cwd());
}
```

**Step 2: Verify it parses correctly**

```bash
npx tsx src/cli/index.ts --help
npx tsx src/cli/index.ts generate
npx tsx src/cli/index.ts generate /some/path
npx tsx src/cli/index.ts unknowncmd
```

Expected: help text prints, generate/init print their target path, unknowncmd exits 1.

**Step 3: Commit**

```bash
git add src/cli/index.ts
git commit -m "feat(cli): add CLI skeleton with generate/init commands"
```

---

### Task 2: Implement `runGenerate`

**Files:**
- Modify: `src/cli/index.ts`

**Step 1: Replace the `runGenerate` stub**

```typescript
async function runGenerate(targetArg?: string) {
  const { scanCodebase } = await import("../scanner/index.js");
  const { analyzeGraph } = await import("../analyzer/index.js");
  const { encodeToStrandFormat } = await import("../encoder/strand-format-encode.js");

  const targetPath = path.resolve(targetArg ?? process.cwd());

  if (!fs.existsSync(targetPath)) {
    console.error(`Error: path does not exist: ${targetPath}`);
    process.exit(1);
  }

  const outputPath = path.join(targetPath, ".strand");

  console.log(`Scanning ${targetPath}...`);
  const graph = await scanCodebase(targetPath);
  console.log(`  ${graph.totalFiles} files  ${graph.totalLines.toLocaleString()} lines  ${graph.modules.length} modules`);

  console.log(`Analyzing...`);
  const analysis = analyzeGraph(graph);
  console.log(`  ${analysis.risk.length} files with blast radius > 1`);

  console.log(`Encoding...`);
  const encoded = encodeToStrandFormat(graph, analysis);
  const tokens = Math.round(encoded.length / 4);
  console.log(`  ${encoded.length} chars  ~${tokens} tokens`);

  fs.writeFileSync(outputPath, encoded, "utf-8");
  console.log(`\nWrote ${outputPath}`);
}
```

**Step 2: Test against SenorBurritoCompany**

```bash
npx tsx src/cli/index.ts generate "C:/dev/senorburritocompany"
```

Expected output:
```
Scanning C:/dev/senorburritocompany...
  289 files  50,001 lines  27 modules
Analyzing...
  57 files with blast radius > 1
Encoding...
  ~11066 chars  ~2767 tokens

Wrote C:/dev/senorburritocompany/.strand
```

**Step 3: Verify the file**

```bash
head -5 "C:/dev/senorburritocompany/.strand"
```

Expected: First line is `STRAND v2 | senorburritocompany | Nextjs | 289 files | 50,001 lines`

**Step 4: Commit**

```bash
git add src/cli/index.ts
git commit -m "feat(cli): implement generate command"
```

---

### Task 3: Implement `runInit`

**Files:**
- Modify: `src/cli/index.ts`

**What init does:**
1. Checks that `.strand` exists in target path (generate must run first)
2. Reads target project's `CLAUDE.md`
3. Checks if `@.strand` is already present (idempotent)
4. Appends the codebase map section if not present
5. Writes updated CLAUDE.md

**Step 1: Replace the `runInit` stub**

```typescript
async function runInit(targetArg?: string) {
  const targetPath = path.resolve(targetArg ?? process.cwd());
  const strandPath = path.join(targetPath, ".strand");
  const claudePath = path.join(targetPath, "CLAUDE.md");

  // Guard: .strand must exist
  if (!fs.existsSync(strandPath)) {
    console.error(`Error: .strand not found at ${strandPath}`);
    console.error(`Run 'strand generate' first.`);
    process.exit(1);
  }

  // Guard: CLAUDE.md must exist
  if (!fs.existsSync(claudePath)) {
    console.error(`Error: CLAUDE.md not found at ${claudePath}`);
    console.error(`Create a CLAUDE.md first, then run 'strand init'.`);
    process.exit(1);
  }

  const existing = fs.readFileSync(claudePath, "utf-8");

  // Idempotent: skip if already wired
  if (existing.includes("@.strand")) {
    console.log(`Already wired — CLAUDE.md already references @.strand`);
    process.exit(0);
  }

  const section = `
---

## Codebase Map

Before exploring files to answer questions about structure, architecture, dependencies,
or change impact — read the .strand encoding first. Only open individual files when you
need implementation details the encoding doesn't provide.

@.strand
`;

  fs.writeFileSync(claudePath, existing.trimEnd() + "\n" + section, "utf-8");
  console.log(`Wired — added @.strand reference to ${claudePath}`);
}
```

**Step 2: Test against SenorBurritoCompany**

```bash
npx tsx src/cli/index.ts init "C:/dev/senorburritocompany"
```

Expected:
```
Wired — added @.strand reference to C:/dev/senorburritocompany/CLAUDE.md
```

**Step 3: Verify the CLAUDE.md diff**

```bash
tail -15 "C:/dev/senorburritocompany/CLAUDE.md"
```

Expected: last lines contain `## Codebase Map`, the usage instruction, and `@.strand`.

**Step 4: Run init again to verify idempotency**

```bash
npx tsx src/cli/index.ts init "C:/dev/senorburritocompany"
```

Expected: `Already wired — CLAUDE.md already references @.strand`

**Step 5: Commit**

```bash
git add src/cli/index.ts
git commit -m "feat(cli): implement init command"
```

---

### Task 4: Build with tsc and verify the compiled binary

**Files:**
- No new files — just verify the build

**Step 1: Run the build**

```bash
npm run build
```

Expected: exits 0, `dist/cli/index.js` exists.

**Step 2: Verify the bin works via node**

```bash
node dist/cli/index.js --help
```

Expected: same help text as the tsx version.

**Step 3: Add shebang to compiled output check**

The TypeScript source has `#!/usr/bin/env node` but `tsc` strips it. Verify `dist/cli/index.js` starts with the shebang:

```bash
head -1 dist/cli/index.js
```

If missing (tsc strips shebangs), add a `prepublish` script or patch manually. If present, no action needed.

> **Note:** tsc does NOT preserve shebangs. The fix is to either:
> a) Use a build step that prepends it: `echo '#!/usr/bin/env node' | cat - dist/cli/index.js > tmp && mv tmp dist/cli/index.js`
> b) Or strip the shebang from the TS source and document that `npx strand` handles it via npm bin wiring (preferred — npm bin scripts don't need shebangs)
>
> Use option (b): remove the shebang from `src/cli/index.ts`. npm's `bin` wiring executes the file with node directly.

**Step 4: Commit**

```bash
git add dist/
git commit -m "build: compile CLI to dist/"
```

---

### Task 5: Update `.gitignore` and document `.strand` commit convention

**Files:**
- Modify: `.gitignore` (strand project)
- No change to target project `.gitignore` — `.strand` should be committed there

**Decision: `.strand` files are committed in target projects**

`.strand` is like `package-lock.json` — a derived artifact that travels with the repo so every collaborator and every Claude Code session has the map without running `strand generate`. Teams regenerate it after significant codebase changes (major refactors, new modules).

**Step 1: Add `experiments/output/*.strand` to strand's own `.gitignore`**

These are experiment artifacts, not the shipped format:

```bash
echo "experiments/output/*.strand" >> .gitignore
```

But keep `senorburritocompany.strand` since it's our test output — actually, add all `.strand` in experiments/output to gitignore and rely on the target project to commit its own `.strand`.

**Step 2: Verify `.gitignore`**

```bash
cat .gitignore
```

Expected: `experiments/output/*.strand` present.

**Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: gitignore experiment .strand outputs"
```

---

### Task 6: Verify end-to-end in SenorBurritoCompany

Full workflow test:

**Step 1: Generate**
```bash
node dist/cli/index.js generate "C:/dev/senorburritocompany"
```

**Step 2: Init**
```bash
node dist/cli/index.js init "C:/dev/senorburritocompany"
```

**Step 3: Open a new Claude Code session in SenorBurritoCompany and ask:**
```
If we were to refactor the codebase, where would we start?
```

**What to observe:**
- Does Claude answer from the encoding without tool calls?
- How many tool calls does it make vs the 45-tool baseline (Session 1)?
- Does it cite specific RISK/FLOWS data in its answer?

**Step 4: Log findings in strand's FINDINGS.md**

Add Experiment 6 entry comparing Session 1 (45 tools, 70.8k tokens) to this session.

---

## Open Questions

1. **`strand update`** — should there be a command that regenerates `.strand` in place (shorthand for `strand generate` in the current project)? Probably yes, but YAGNI until the basic commands work.
2. **Version stamping** — should `.strand` include a format version header so old encodings can be detected? The current header already has `STRAND v2` — probably sufficient.
3. **npm publish** — out of scope for this plan. The CLI is usable via `npx tsx` or local `node dist/cli/index.js` for now.
