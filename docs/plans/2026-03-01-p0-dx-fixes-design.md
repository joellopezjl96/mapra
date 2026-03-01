# Design: P0 DX Fixes

**Date:** 2026-03-01
**Status:** Approved

## Problem

Three issues block `npx strand` from being usable by anyone who hasn't cloned the repo:

1. `sharp` is a 50MB+ native compiled dep in `dependencies`. It has platform-specific binaries and frequently fails to install on CI and non-standard environments. The strand CLI does pure text processing — it has no need for sharp.
2. `@anthropic-ai/sdk`, `tree-sitter`, and `tree-sitter-typescript` are also in `dependencies` despite being used exclusively in the `experiments/` directory, never in `src/`.
3. Running `npx strand` with no subcommand prints help and exits — the most common first use (first-time setup in a project) requires knowing to type `strand setup`.

## Design

### 1. package.json cleanup

- `sharp` — deleted from package.json entirely (not moved to devDeps). Visual experiments are archived; it is not needed anywhere in the current pipeline.
- `@anthropic-ai/sdk`, `tree-sitter`, `tree-sitter-typescript` — moved from `dependencies` to `devDependencies`. Still available for running experiments locally; excluded from `npm install --production` and `npx` installs.
- `typescript` — stays in `dependencies` (runtime compiler for `tsc`).

### 2. CLI default behavior

When `strand` is invoked with no subcommand, run `setup` (generate + init) in the current directory instead of printing help:

```
No command given — running setup (generate + init) in current directory.
Use 'strand --help' to see all commands.

Setting up strand...
...
```

`--help` / `-h` flags continue to print help and exit.

### 3. Archive visual experiments

Move to `experiments/archive/` (no file modifications):
- `experiments/visual-vs-text.ts` → `experiments/archive/visual-vs-text.ts`
- `experiments/experiment-3-formats.ts` → `experiments/archive/experiment-3-formats.ts`

These are Exp 1 and 3, which used SVG→PNG rendering. Results are logged in FINDINGS.md. The files are preserved as historical reference.

## Out of Scope

- P1 items (analysis subcommands, slash command hints, `--if-stale` flag)
- npm publish
- Experiment 8
