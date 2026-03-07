# strnd

**Stop exploring. Start building.**

Strnd encodes your codebase's structure, risk, and complexity into a single version-controlled file — so you and your AI tools understand the whole picture before touching any code.

## What does strnd do?

Find the right files faster and understand the impact of changes. Strnd scans your codebase and produces a `.strand` file that captures:

- **Structure** — modules, domains, and how they connect
- **Risk** — blast radius, cascade depth, and amplification hotspots
- **Complexity** — per-module heatmaps from minimal to high
- **Churn** — what's been changing and how fast
- **Conventions** — patterns your codebase already follows

One file read gives you (or your AI agent) instant structural awareness — no more burning dozens of tool calls exploring directory trees.

## Quick Start

```bash
npx strnd
```

This runs first-time setup: scans your codebase and wires the `.strand` reference into your `CLAUDE.md`.

## Commands

```
strnd                        Run setup in current directory (first-time setup)
strnd update                 Regenerate .strand after codebase changes
strnd setup [path]           Generate .strand, wire CLAUDE.md, install auto-update hooks
strnd generate [path]        Scan codebase and write .strand to project root
strnd init [path]            Wire @.strand reference into project's CLAUDE.md
strnd status [path]          Show whether .strand is present, wired, and fresh
strnd install-hooks [path]   Install git hooks for auto-update
strnd uninstall-hooks [path] Remove strnd git hooks
strnd validate-plan <plan>   Cross-reference plan file paths against .strand data
strnd batch <config.json>    Run batch experiment comparing encoding conditions
```

## Auto-Update

After running `npx strnd`, your `.strand` file stays fresh automatically:

- **Git hooks** (post-commit, post-merge, post-checkout) regenerate `.strand` in the background after every commit, merge, and branch switch
- **Teammates** get hooks automatically — `npm install` triggers the `prepare` script which installs hooks
- **Zero friction** — regeneration is silent and runs in the background; if it fails, your existing `.strand` stays intact

Run `strnd status` to verify hooks are installed. To remove: `strnd uninstall-hooks`.

## How It Works

1. **Scan** — strnd parses your source files, extracting imports, exports, and module boundaries
2. **Analyze** — computes blast radius, churn velocity, dead code, and convention patterns
3. **Encode** — compresses everything into a compact `.strand` file (~1-2K tokens for most projects)
4. **Wire** — adds an `@.strand` reference to your `CLAUDE.md` so AI tools load the map automatically

## Why?

AI coding agents spend significant time and tokens exploring codebases — listing directories, reading files to understand structure, figuring out what depends on what. Strnd eliminates that exploration phase entirely. One file read and the agent knows the shape of your project, where the risk zones are, and what conventions to follow.

## License

MIT
