# strnd

**Stop exploring. Start building.**

Strnd encodes your codebase's structure, risk, and complexity into a single version-controlled file — so you and your AI tools understand the whole picture before touching any code.

## What does it do?

AI coding agents spend significant time exploring codebases — listing directories, reading files to understand structure, figuring out what depends on what. In testing, a typical structural question required **45 tool calls** without strnd. With strnd: **zero**.

Strnd scans your codebase and produces a `.strand` file that captures:

- **Risk** — blast radius, cascade depth, and hidden amplifiers (files where a small change breaks many things)
- **Churn** — what's been changing and how fast
- **Hotspots** — complexity scores for files that need the most care
- **Infrastructure** — how your modules connect
- **Conventions** — patterns your codebase already follows

One file read gives your AI agent instant structural awareness.

## Quick Start

```bash
npx strnd
```

That's it. This scans your codebase, generates `.strand`, wires it into your `CLAUDE.md`, and installs git hooks to keep it fresh.

### Requirements

- Node.js >= 18
- A git repository

## What you get

Here's a real `.strand` file from a Next.js app (300 files, 53K lines):

```
STRAND v3 | myapp | Nextjs | 300 files | 53,081 lines | generated 2026-03-06
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

The RISK section is strnd's unique value — it shows **hidden amplifiers**: files with few direct importers but high cascade impact. `constants.ts` above has only 3 direct importers but affects 21 files (amp 7.0). No other tool surfaces this.

## Commands

```
strnd                        First-time setup (generate + wire + hooks)
strnd update                 Regenerate .strand after code changes
strnd status                 Check .strand freshness, hook state, wiring
```

### Setup details

`strnd setup` does four things:

1. Scans your codebase and writes `.strand`
2. Adds an `@.strand` reference to your `CLAUDE.md`
3. Installs git hooks (post-commit, post-merge, post-checkout) for auto-update
4. Adds a `prepare` script to `package.json` so teammates get hooks on `npm install`

### Other commands

```
strnd generate [path]        Scan and write .strand (without wiring CLAUDE.md)
strnd init [path]            Wire @.strand into CLAUDE.md (without regenerating)
strnd install-hooks [path]   Install git hooks manually
strnd uninstall-hooks [path] Remove strnd git hooks
strnd validate-plan <file>   Cross-reference a plan's file paths against .strand
```

## Auto-Update

After setup, `.strand` stays fresh automatically:

- **Git hooks** regenerate `.strand` silently after every commit, merge, and branch switch
- **Teammates** get hooks automatically via `npm install` (prepare script)
- **Safe** — regeneration runs in the background; if it fails, your existing `.strand` stays intact

Run `strnd status` to verify everything is working. To remove: `strnd uninstall-hooks`.

## Troubleshooting

### Shallow clones

If you cloned with `--depth`, the CHURN section will be empty or incomplete. Fix with:

```bash
git fetch --unshallow
strnd update
```

### `.strand` in `.gitignore`

`.strand` should be committed — it's how your team shares structural awareness. If `strnd status` warns about `.gitignore`, remove the `.strand` entry.

### Stale `.strand`

If `strnd status` shows "may be stale", run `strnd update`. With auto-update hooks installed, this shouldn't happen.

## How It Works

1. **Scan** — parses source files, extracting imports, exports, and module boundaries
2. **Analyze** — computes blast radius, churn velocity, dead code, and convention patterns
3. **Encode** — compresses everything into a compact `.strand` file (~1-2K tokens for most projects)
4. **Wire** — adds an `@.strand` reference to your `CLAUDE.md` so AI tools load the map automatically

## Language Support

Currently supports TypeScript and JavaScript codebases (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`). Prisma schemas are also parsed for database relationships.

## License

MIT
