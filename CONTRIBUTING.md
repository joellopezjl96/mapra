# Contributing to mapra

## Quick Start

```bash
git clone https://github.com/joellopezjl96/mapra.git
cd mapra
npm install
npm test
```

## Architecture

mapra has four modules that form a pipeline:

```
Scanner → Analyzer → Encoder → CLI
```

1. **Scanner** (`src/scanner/index.ts`) — walks source files, extracts imports/exports, builds a `StrandGraph` of nodes and edges
2. **Analyzer** (`src/analyzer/`) — computes blast radius, churn, dead code, conventions, and co-change from the graph
3. **Encoder** (`src/encoder/strand-format-encode.ts`) — renders the graph + analysis into the `.mapra` text format
4. **CLI** (`src/cli/index.ts`) — `mapra` command: generate, init, update, status, install-hooks

## Running Tests

```bash
npm test            # run once
npm run test:watch  # watch mode
```

Tests use Vitest with temporary directories for filesystem fixtures.

## Adding a New Section

To add a new section to `.mapra` output:

1. Add computation to `src/analyzer/index.ts` (or a new file in `src/analyzer/`)
2. Add the result field to `GraphAnalysis` interface
3. Add a `renderYourSection()` function in `src/encoder/strand-format-encode.ts`
4. Call it from `encodeToStrandFormat()`
5. Update the LEGEND in the header if new notation is introduced
6. Write tests for both the analyzer and encoder

## Coding Standards

- Small, composable functions with clear inputs and outputs
- Test-first: RED → GREEN → REFACTOR
- Never claim "done" without evidence (test output, build success)
- Read existing code before modifying it

See `CLAUDE.md` for full standards.
