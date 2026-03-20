# mapra

**Stop exploring. Start building.**

Mapra encodes your codebase's structure, risk, and complexity into a single version-controlled file — so you and your AI tools understand the whole picture before touching any code.

## What does it do?

AI coding agents spend significant time exploring codebases — listing directories, reading files to understand structure, figuring out what depends on what. In testing, a typical structural question required **45 tool calls** without mapra. With mapra: **zero**.

Mapra scans your codebase and produces a `.mapra` file that captures:

- **Risk** — blast radius, cascade depth, and hidden amplifiers (files where a small change breaks many things)
- **Churn** — what's been changing and how fast
- **Hotspots** — complexity scores for files that need the most care
- **Infrastructure** — how your modules connect
- **Conventions** — patterns your codebase already follows

One file read gives your AI agent instant structural awareness.

## Quick Start

```bash
npx mapra
```

That's it. This scans your codebase, generates `.mapra`, wires it into your `CLAUDE.md`, and installs git hooks to keep it fresh.

### Requirements

- Node.js >= 18
- A git repository

## What you get

Here's a real `.mapra` file from a Next.js app (300 files, 53K lines):

```
MAPRA v3 | myapp | Nextjs | 300 files | 53,081 lines | generated 2026-03-06
LEGEND: ×N=imported by N files | ×A→B=A direct, B total affected | dN=cascade depth | [AMP]=amplification>=2x

─── RISK (blast radius — modifying these cascades broadly) ─
[AMP] amp7.0  ×3→21     d3   3mod  T5   src/lib/constants.ts
  exports: ORDER_ONLINE_URL
[AMP] amp3.6  ×7→25     d4   3mod  T4   src/lib/ordering-server.ts
  exports: PeriodAvailability
  +55 more with blast radius > 1

─── CHURN (last 30 days, top movers) ─────────────────────
20 commits   +1159 -1011  src/app/api/orders/route.ts  "feat: pre-order core"
12 commits   +306 -36     src/lib/ordering.ts  "feat: pre-order foundation"

─── HOTSPOTS (complexity > 0.3) ─────────────────────────
0.79  src/batch/runner.ts       543L 13imp
0.75  src/cli/index.ts          833L  5imp
```

The RISK section is mapra's unique value — it shows **hidden amplifiers**: files with few direct importers but high cascade impact. `constants.ts` above has only 3 direct importers but affects 21 files (amp 7.0). No other tool surfaces this.

### Reading the output

The `.mapra` header includes a LEGEND that decodes the compact notation:

| Symbol | Meaning | Example |
|--------|---------|---------|
| `×N` | Imported by N files | `×3` = 3 files import this |
| `×A→B` | A direct importers, B total affected (cascade) | `×3→21` = 3 direct, 21 total |
| `[AMP]` | Hidden amplifier — amplification ratio >= 2x | Few importers but large cascade |
| `ampN` | Amplification ratio (affected / direct) | `amp7.0` = 7x amplification |
| `dN` | Cascade depth (longest chain) | `d3` = 3 hops max |
| `Nmod` | Number of modules affected | `3mod` = crosses 3 module boundaries |
| `TN` | Number of test files covering this file | `T5` = 5 test files |
| `NL` | Lines of code | `543L` = 543 lines |

## Commands

```
mapra                        First-time setup (generate + wire + hooks)
mapra update                 Regenerate .mapra after code changes
mapra status                 Check .mapra freshness, hook state, wiring
```

### Setup details

`mapra setup` does four things:

1. Scans your codebase and writes `.mapra`
2. Adds an `@.mapra` reference to your `CLAUDE.md`
3. Installs git hooks (post-commit, post-merge, post-checkout) for auto-update
4. Adds a `prepare` script to `package.json` so teammates get hooks on `npm install`

### Other commands

```
mapra generate [path]        Scan and write .mapra (without wiring CLAUDE.md)
mapra init [path]            Wire @.mapra into CLAUDE.md (without regenerating)
mapra install-hooks [path]   Install git hooks manually
mapra uninstall-hooks [path] Remove mapra git hooks
mapra validate-plan <file>   Cross-reference a plan's file paths against .mapra
```

## Auto-Update

After setup, `.mapra` stays fresh automatically:

- **Git hooks** regenerate `.mapra` silently after every commit, merge, and branch switch
- **Teammates** get hooks automatically via `npm install` (prepare script)
- **Safe** — regeneration runs in the background; if it fails, your existing `.mapra` stays intact

Run `mapra status` to verify everything is working. To remove: `mapra uninstall-hooks`.

## Troubleshooting

### Shallow clones

If you cloned with `--depth`, the CHURN section will be empty or incomplete. Fix with:

```bash
git fetch --unshallow
mapra update
```

### `.mapra` in `.gitignore`

`.mapra` should be committed — it's how your team shares structural awareness. If `mapra status` warns about `.gitignore`, remove the `.mapra` entry.

### Stale `.mapra`

If `mapra status` shows "may be stale", run `mapra update`. With auto-update hooks installed, this shouldn't happen.

## How It Works

1. **Scan** — parses source files, extracting imports, exports, and module boundaries
2. **Analyze** — computes blast radius, churn velocity, dead code, and convention patterns
3. **Encode** — compresses everything into a compact `.mapra` file (~1-2K tokens for most projects)
4. **Wire** — adds an `@.mapra` reference to your `CLAUDE.md` so AI tools load the map automatically

## Language Support

Currently supports TypeScript and JavaScript codebases (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`). Prisma schemas are also parsed for database relationships.

## License

MIT
