# Intra-Session Map Freshness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep `.strand` trustworthy during active implementation sessions by emitting a supersession signal on regeneration and updating the trust directive with a mid-session carve-out.

**Architecture:** Two changes to `src/cli/index.ts`. Strings extracted to `src/cli/templates.ts` so they are testable without running CLI commands. Tests verify the exact content of each string before it touches filesystem or stdout.

**Tech Stack:** TypeScript, Node.js, vitest

---

## Context

This implements the design at `docs/plans/2026-03-02-intra-session-map-freshness-design.md`.

Three things change:

1. `strand update` / `strand generate` prints a supersession signal after writing `.strand` so an agent mid-session knows the fresh version overrides the session-start version in context.
2. The CLAUDE.md section that `strand init` writes gains a mid-session carve-out: "prefer the most recently read .strand."
3. The `[CHECKPOINT]` step convention is documented in this plan — no code change required.

Only `src/cli/index.ts` and a new `src/cli/templates.ts` are touched. No scanner, encoder, or analyzer changes.

---

### Task 1: Extract CLI string templates

**Why first:** The supersession message and CLAUDE.md section are currently inline strings inside non-exported functions. Extracting them to a separate module makes them unit-testable without subprocess overhead.

**Files:**
- Create: `src/cli/templates.ts`

**Step 1: Write the failing test**

Create `src/cli/__tests__/templates.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { SUPERSESSION_MESSAGE, CLAUDE_MD_SECTION } from "../templates.js";

describe("SUPERSESSION_MESSAGE", () => {
  it("contains a timestamp placeholder token", () => {
    // The message is a function that takes an ISO timestamp
    const msg = SUPERSESSION_MESSAGE("2026-03-02T14:22:10");
    expect(msg).toContain("2026-03-02T14:22:10");
  });

  it("contains the word 'supersedes'", () => {
    const msg = SUPERSESSION_MESSAGE("2026-03-02T14:22:10");
    expect(msg).toContain("supersedes");
  });

  it("mentions 'prior .strand in context'", () => {
    const msg = SUPERSESSION_MESSAGE("2026-03-02T14:22:10");
    expect(msg).toContain("prior .strand in context");
  });
});

describe("CLAUDE_MD_SECTION", () => {
  it("contains the @.strand reference", () => {
    expect(CLAUDE_MD_SECTION).toContain("@.strand");
  });

  it("contains the mid-session carve-out", () => {
    expect(CLAUDE_MD_SECTION).toContain("most recently read .strand");
  });

  it("contains the original trust directive", () => {
    expect(CLAUDE_MD_SECTION).toContain("ground truth");
  });
});
```

**Step 2: Run test to confirm it fails**

```bash
npm test -- src/cli/__tests__/templates.test.ts
```

Expected: FAIL — `../templates.js` not found.

**Step 3: Create `src/cli/templates.ts`**

```typescript
/**
 * String templates used by CLI commands.
 * Extracted here so they can be unit-tested without filesystem or subprocess setup.
 */

/**
 * Printed after strand update/generate completes.
 * Gives agents a clear signal that this regeneration supersedes any prior
 * .strand content loaded earlier in the conversation context.
 */
export function SUPERSESSION_MESSAGE(isoTimestamp: string): string {
  return `.strand regenerated (${isoTimestamp}) — supersedes any prior .strand in context.`;
}

/**
 * The section appended to CLAUDE.md by `strand init`.
 * Includes the trust directive with mid-session carve-out.
 */
export const CLAUDE_MD_SECTION = `
---

## Codebase Map

Before exploring files to answer questions about structure, architecture,
dependencies, or change impact — read the .strand encoding first. Only
open individual files when you need implementation details the encoding
doesn't provide.

Treat .strand data as ground truth for structural facts (blast radius,
complexity, import counts, test coverage). If you have run \`strand update\`
during this session and read the new file, that version supersedes the
session-start version. Prefer the most recently read .strand in all decisions.

@.strand
`;
```

**Step 4: Run test to confirm it passes**

```bash
npm test -- src/cli/__tests__/templates.test.ts
```

Expected: PASS — all 6 assertions green.

**Step 5: Commit**

```bash
git add src/cli/templates.ts src/cli/__tests__/templates.test.ts
git commit -m "feat: extract CLI string templates for testability"
```

---

### Task 2: Wire supersession signal into runGenerate

**Files:**
- Modify: `src/cli/index.ts` — `runGenerate()` at line 107

**Step 1: Write the failing test**

There is no existing test for CLI output. The templates test from Task 1 already validates the message format. The only remaining risk is that `runGenerate()` never calls `SUPERSESSION_MESSAGE`. Add a test for the integration point.

Add to `src/cli/__tests__/templates.test.ts`:

```typescript
import { SUPERSESSION_MESSAGE } from "../templates.js";

describe("SUPERSESSION_MESSAGE format", () => {
  it("produces ISO-8601 compatible output when given a real timestamp", () => {
    const ts = new Date().toISOString().slice(0, 19);
    const msg = SUPERSESSION_MESSAGE(ts);
    // Verify the full line matches the expected shape
    expect(msg).toMatch(/^\.strand regenerated \(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\) — supersedes any prior \.strand in context\.$/)
  });
});
```

**Step 2: Run test to confirm it passes immediately**

```bash
npm test -- src/cli/__tests__/templates.test.ts
```

Expected: PASS — this tests the format, not the wiring. Wiring happens next.

**Step 3: Update `runGenerate()` in `src/cli/index.ts`**

Import the template at the top of the file (after existing imports):

```typescript
import { SUPERSESSION_MESSAGE } from "./templates.js";
```

In `runGenerate()`, after the existing `console.log` that writes the file size (line 137–139), add:

```typescript
    fs.writeFileSync(outputPath, encoded, "utf-8");
    console.log(
      `\nWrote .strand  (${encoded.length.toLocaleString()} chars  ~${tokens} tokens)`,
    );
    console.log(SUPERSESSION_MESSAGE(new Date().toISOString().slice(0, 19)));
```

The full updated block (lines 136–140 after change):

```typescript
    fs.writeFileSync(outputPath, encoded, "utf-8");
    console.log(
      `\nWrote .strand  (${encoded.length.toLocaleString()} chars  ~${tokens} tokens)`,
    );
    console.log(SUPERSESSION_MESSAGE(new Date().toISOString().slice(0, 19)));
```

**Step 4: Smoke-test manually**

```bash
npx tsx src/cli/index.ts update
```

Expected output includes:
```
Wrote .strand  (XXXX chars  ~YYY tokens)
.strand regenerated (2026-03-02T14:22:10) — supersedes any prior .strand in context.
```

**Step 5: Run full test suite**

```bash
npm test
```

Expected: all existing tests still pass.

**Step 6: Commit**

```bash
git add src/cli/index.ts
git commit -m "feat: emit supersession signal after strand update/generate"
```

---

### Task 3: Wire updated trust directive into runInit

**Files:**
- Modify: `src/cli/index.ts` — `runInit()` at line 145

**Step 1: Write the failing test**

The trust directive is now in `CLAUDE_MD_SECTION` (Task 1). We need to verify that `runInit()` actually uses `CLAUDE_MD_SECTION` instead of its own hardcoded section.

Add to `src/cli/__tests__/templates.test.ts`:

```typescript
it("CLAUDE_MD_SECTION does not contain the old trust directive (without carve-out)", () => {
  // Old directive had no mention of mid-session handling
  // New directive must have the carve-out
  expect(CLAUDE_MD_SECTION).not.toMatch(/^Treat \.strand data as ground truth/m);
  // Instead it must be in the body with the carve-out appended
  expect(CLAUDE_MD_SECTION).toContain("most recently read .strand");
});
```

**Step 2: Run test to confirm it passes**

```bash
npm test -- src/cli/__tests__/templates.test.ts
```

Expected: PASS — `CLAUDE_MD_SECTION` already has the carve-out from Task 1.

**Step 3: Update `runInit()` in `src/cli/index.ts`**

`runInit()` currently builds `section` as a local template literal at line 167–178. Replace it with the imported constant.

Remove lines 167–178 (the local `section` definition):

```typescript
    const section = `
---

## Codebase Map

Before exploring files to answer questions about structure, architecture,
dependencies, or change impact — read the .strand encoding first. Only
open individual files when you need implementation details the encoding
doesn't provide.

@.strand
`;
```

Replace with:

```typescript
    const section = CLAUDE_MD_SECTION;
```

The `SUPERSESSION_MESSAGE` import added in Task 2 already covers both. No additional import needed — `CLAUDE_MD_SECTION` is already exported from `./templates.js`.

**Step 4: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

**Step 5: Smoke-test `strand init` with a fresh temp dir**

```bash
mkdir /tmp/test-strand-init && cp .strand /tmp/test-strand-init/ && npx tsx src/cli/index.ts init /tmp/test-strand-init && cat /tmp/test-strand-init/CLAUDE.md
```

Expected: CLAUDE.md contains both `@.strand` and "most recently read .strand".

**Step 6: Commit**

```bash
git add src/cli/index.ts
git commit -m "feat: update trust directive with mid-session carve-out in strand init"
```

---

### Task 4: Regenerate .strand and verify output

The CLI itself just changed. Regenerate the project's own `.strand` so it reflects the new files.

**Step 1: Regenerate**

```bash
npx tsx src/cli/index.ts update
```

**Step 2: Verify supersession signal appears**

The last line of output should read:
```
.strand regenerated (YYYY-MM-DDTHH:MM:SS) — supersedes any prior .strand in context.
```

**Step 3: Commit**

```bash
git add .strand
git commit -m "chore: regenerate .strand after intra-session freshness changes"
```

---

## The [CHECKPOINT] Convention (No Code Change)

Implementation plans that include architectural restructuring steps must include an explicit `strand update` step at each boundary where the map will be used for consequential decisions.

**Required when a step:**
- Creates a new file that will be imported by multiple modules
- Deletes or merges existing files
- Restructures domain boundaries
- Changes a file with blast radius > 10

**Format:**

```markdown
### Step N+1: Refresh map [CHECKPOINT]
Run `strand update`, then read the new `.strand`.
The fresh map supersedes the session-start version.
Verify blast radius for `<file>` before continuing.
```

This convention is enforced through plan authorship, not code. Future plan templates should include a reminder at the top: "Add [CHECKPOINT] steps after any architectural restructuring."

---

## Done When

- [ ] `npm test` passes with all new tests green
- [ ] `npx tsx src/cli/index.ts update` prints the supersession signal as its last line
- [ ] `npx tsx src/cli/index.ts init` writes a CLAUDE.md containing "most recently read .strand"
- [ ] `.strand` regenerated and committed
