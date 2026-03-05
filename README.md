# strand

**Stop exploring. Start building.**

Strand encodes your codebase's structure, risk, and complexity into a single version-controlled file — so you and your AI tools understand the whole picture before touching any code.

## What does strand do?

Find the right files faster and understand the impact of changes. Strand scans your codebase and produces a `.strand` file that captures:

- **Structure** — modules, domains, and how they connect
- **Risk** — blast radius, cascade depth, and amplification hotspots
- **Complexity** — per-module heatmaps from minimal to high
- **Churn** — what's been changing and how fast
- **Conventions** — patterns your codebase already follows

One file read gives you (or your AI agent) instant structural awareness — no more burning dozens of tool calls exploring directory trees.

## Quick Start

```bash
npx strand
```

This runs first-time setup: scans your codebase and wires the `.strand` reference into your `CLAUDE.md`.

## Commands

```
strand                        Run setup in current directory (first-time setup)
strand update                 Regenerate .strand after codebase changes
strand setup [path]           Run generate then init
strand generate [path]        Scan codebase and write .strand to project root
strand init [path]            Wire @.strand reference into project's CLAUDE.md
strand status [path]          Show whether .strand is present, wired, and fresh
strand validate-plan <plan>   Cross-reference plan file paths against .strand data
strand batch <config.json>    Run batch experiment comparing encoding conditions
```

## How It Works

1. **Scan** — strand uses tree-sitter to parse your source files, extracting imports, exports, and module boundaries
2. **Analyze** — computes blast radius, churn velocity, dead code, and convention patterns
3. **Encode** — compresses everything into a compact `.strand` file (~1-2K tokens for most projects)
4. **Wire** — adds an `@.strand` reference to your `CLAUDE.md` so AI tools load the map automatically

## Why?

AI coding agents spend significant time and tokens exploring codebases — listing directories, reading files to understand structure, figuring out what depends on what. Strand eliminates that exploration phase entirely. One file read and the agent knows the shape of your project, where the risk zones are, and what conventions to follow.

## License

MIT
