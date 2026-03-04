# Intra-Session Map Freshness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent `.strand` from going stale mid-session by adding supersession signals, atomic writes, failure recovery, and checkpoint validation.

**Architecture:** Add `SUPERSESSION_MESSAGE` and freshness carve-out to the existing `templates.ts` constants. Modify `runGenerate()` for atomic writes and supersession output. Extend `validate-plan` with `--checkpoints` mode that parses plan steps for architectural patterns and warns when `[CHECKPOINT]` is missing. All changes are in the `src/cli/` module.

**Tech Stack:** TypeScript, Vitest, Node.js `fs` module

---

### Task 1: Add SUPERSESSION_MESSAGE to templates.ts

**Files:**
- Modify: `src/cli/templates.ts:15-25`
- Test: `src/cli/__tests__/templates.test.ts`

**Step 1: Write the failing test for SUPERSESSION_MESSAGE**

Add to the end of `src/cli/__tests__/templates.test.ts`:

```typescript
import { SUPERSESSION_MESSAGE } from "../templates.js";

describe("SUPERSESSION_MESSAGE", () => {
  it("includes ISO timestamp and supersession text", () => {
    const msg = SUPERSESSION_MESSAGE("2026-03-02T14:22:10");
    expect(msg).toContain("2026-03-02T14:22:10");
    expect(msg).toContain("supersedes any prior .strand in context");
    expect(msg).toContain(".strand regenerated");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/cli/__tests__/templates.test.ts`
Expected: FAIL — `SUPERSESSION_MESSAGE` is not exported from `../templates.js`

**Step 3: Write minimal implementation**

Add to `src/cli/templates.ts` after line 25 (after `CLAUDE_MD_SECTION`):

```typescript
/** Message printed to stdout after strand update to signal context supersession. */
export function SUPERSESSION_MESSAGE(isoTimestamp: string): string {
  return `.strand regenerated (${isoTimestamp}) — supersedes any prior .strand in context.`;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/cli/__tests__/templates.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/cli/templates.ts src/cli/__tests__/templates.test.ts
git commit -m "feat(cli): add SUPERSESSION_MESSAGE to templates"
```

---

### Task 2: Update CLAUDE_MD_SECTION with freshness carve-out

**Files:**
- Modify: `src/cli/templates.ts:15-25`
- Test: `src/cli/__tests__/templates.test.ts`

**Step 1: Write the failing test**

Add to the existing `describe("applyStrandSection")` block in `templates.test.ts`:

```typescript
it("section content includes freshness carve-out", () => {
  expect(CLAUDE_MD_SECTION).toContain(
    "always prefer the most recently read version",
  );
  expect(CLAUDE_MD_SECTION).toContain("generated");
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/cli/__tests__/templates.test.ts`
Expected: FAIL — current `CLAUDE_MD_SECTION` does not contain freshness text

**Step 3: Update the CLAUDE_MD_SECTION constant**

Replace the existing `CLAUDE_MD_SECTION` in `src/cli/templates.ts` (lines 15-25) with:

```typescript
export const CLAUDE_MD_SECTION = `
---

## Codebase Map

Before exploring files for any task \u2014 read .strand first. The USAGE line
tells you which sections matter for your task type. Only open individual
files when you need implementation details the encoding doesn't provide.

If .strand has been regenerated during this session, always prefer the
most recently read version. Compare the \`generated\` timestamp in the
header line to identify which is newest.

@.strand
`;
```

**Step 4: Run ALL template tests (not just the new one)**

Run: `npx vitest run src/cli/__tests__/templates.test.ts`
Expected: ALL PASS — the `applyStrandSection()` upgrade detection should trigger `"upgraded"` action for existing CLAUDE.md files with the old section content. Verify the existing Case B2 test still passes (content differs → upgraded).

**Step 5: Commit**

```bash
git add src/cli/templates.ts src/cli/__tests__/templates.test.ts
git commit -m "feat(cli): add freshness carve-out to CLAUDE_MD_SECTION"
```

---

### Task 3: Atomic write + supersession signal in runGenerate [CHECKPOINT]

**Files:**
- Modify: `src/cli/index.ts:109-145`

**Step 1: Replace direct writeFileSync with atomic write-to-tmp-then-rename**

In `src/cli/index.ts`, replace lines 138-141 in `runGenerate()`:

```typescript
// Old:
fs.writeFileSync(outputPath, encoded, "utf-8");
console.log(
  `\nWrote .strand  (${encoded.length.toLocaleString()} chars  ~${tokens} tokens)`,
);
```

With:

```typescript
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
```

**Step 2: Add the import**

At the top of `src/cli/index.ts` (line 17), update the existing import:

```typescript
import { applyStrandSection, SUPERSESSION_MESSAGE, type StrandAction } from "./templates.js";
```

**Step 3: Run the existing test suite to verify nothing breaks**

Run: `npx vitest run`
Expected: ALL PASS

**Step 4: Manual smoke test**

Run: `npx tsx src/cli/index.ts update`
Expected output should include:
```
Wrote .strand  (X chars  ~Y tokens)
.strand regenerated (2026-03-03T...) — supersedes any prior .strand in context.
```

**Step 5: Commit**

```bash
git add src/cli/index.ts
git commit -m "feat(cli): atomic write + supersession signal in strand update"
```

---

### Task 4: strand update failure recovery

**Files:**
- Modify: `src/cli/index.ts:42-44` (update case)
- Modify: `src/cli/index.ts:515-529` (handleError)

**Step 1: Change the update case to catch errors gracefully**

Replace the `case "update"` block (lines 42-44) with:

```typescript
case "update":
  try {
    await runGenerate(args[0] ?? process.cwd());
  } catch (err) {
    console.error(
      `strand update failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    console.error(
      "Continuing with stale .strand. Complete your refactor and retry.",
    );
    // Do NOT process.exit — let the calling agent session survive.
  }
  break;
```

Note: `runGenerate()` already has its own try/catch that calls `handleError()` which does `process.exit(1)`. We need to prevent that exit when called from the `update` path. The simplest approach: add a `softFail` parameter to `runGenerate`.

**Step 2: Add softFail parameter to runGenerate**

Modify the `runGenerate` signature and error handling:

```typescript
async function runGenerate(targetArg?: string, softFail = false) {
```

And replace the catch block (lines 142-144):

```typescript
  } catch (err) {
    if (softFail) throw err;
    handleError("generate", err);
  }
```

**Step 3: Update the update case to pass softFail**

```typescript
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
```

**Step 4: Run tests**

Run: `npx vitest run`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/cli/index.ts
git commit -m "fix(cli): strand update returns on failure instead of process.exit"
```

---

### Task 5: Add checkpoint detection to plan-parser

**Files:**
- Modify: `src/cli/plan-parser.ts`
- Test: `src/cli/__tests__/plan-parser.test.ts`

**Step 1: Write the failing tests**

Add to `src/cli/__tests__/plan-parser.test.ts`:

```typescript
import { extractFilePaths, detectMissingCheckpoints } from "../plan-parser.js";

describe("detectMissingCheckpoints", () => {
  it("warns when step creates files without a following checkpoint", () => {
    const plan = `
### Step 1: Create auth module
Create: \`src/auth-core.ts\`
Create: \`src/auth-utils.ts\`

### Step 2: Wire importers
Modify: \`src/app.ts\`
`;
    const warnings = detectMissingCheckpoints(plan);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("Step 1");
    expect(warnings[0]).toContain("src/auth-core.ts");
  });

  it("no warning when checkpoint follows creation step", () => {
    const plan = `
### Step 1: Create auth module
Create: \`src/auth-core.ts\`

### Step 2: Refresh map [CHECKPOINT]
Run \`strand update\` then read the new \`.strand\`.

### Step 3: Wire importers
Modify: \`src/app.ts\`
`;
    const warnings = detectMissingCheckpoints(plan);
    expect(warnings.length).toBe(0);
  });

  it("warns when step deletes files without checkpoint", () => {
    const plan = `
### Step 1: Remove legacy module
Delete \`src/old-auth.ts\`.

### Step 2: Update tests
Modify: \`tests/auth.test.ts\`
`;
    const warnings = detectMissingCheckpoints(plan);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("Step 1");
  });

  it("warns when step splits or merges files", () => {
    const plan = `
### Step 3: Split utils
Split \`src/utils.ts\` into \`src/string-utils.ts\` and \`src/date-utils.ts\`.

### Step 4: Update imports
Modify: \`src/app.ts\`
`;
    const warnings = detectMissingCheckpoints(plan);
    expect(warnings.length).toBe(1);
  });

  it("returns empty array for plans with no architectural steps", () => {
    const plan = `
### Step 1: Fix typo
Modify: \`src/app.ts:42\`

### Step 2: Run tests
Run: \`npx vitest run\`
`;
    const warnings = detectMissingCheckpoints(plan);
    expect(warnings.length).toBe(0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/cli/__tests__/plan-parser.test.ts`
Expected: FAIL — `detectMissingCheckpoints` is not exported

**Step 3: Implement detectMissingCheckpoints**

Add to `src/cli/plan-parser.ts`:

```typescript
/** Patterns that indicate architectural changes needing a checkpoint. */
const ARCH_PATTERNS = [
  /\bCreate:\s*`/i,
  /\bcreate\b.*\b(?:new file|module)\b/i,
  /\bSplit\b.*\binto\b/i,
  /\bDelete\b.*`[^`]+`/i,
  /\bRemove\b.*`[^`]+`/i,
  /\bMerge\b.*\binto\b/i,
  /\bMove\b.*\bto\b/i,
];

const STEP_HEADING = /^###\s+(?:Step\s+\d+|Task\s+\d+)[:\s]/im;

/**
 * Detects plan steps that make architectural changes (file creation,
 * deletion, splits, merges, moves) without a [CHECKPOINT] step following
 * within the next 2 steps.
 *
 * Returns an array of warning strings, one per missing checkpoint.
 */
export function detectMissingCheckpoints(markdown: string): string[] {
  // Split into steps by ### headings
  const stepRegex = /^###\s+.+$/gm;
  const stepPositions: Array<{ heading: string; start: number }> = [];
  let match;
  while ((match = stepRegex.exec(markdown)) !== null) {
    stepPositions.push({ heading: match[0], start: match.index });
  }

  if (stepPositions.length === 0) return [];

  // Build step bodies
  const steps = stepPositions.map((pos, i) => {
    const end =
      i + 1 < stepPositions.length
        ? stepPositions[i + 1]!.start
        : markdown.length;
    return {
      heading: pos.heading,
      body: markdown.slice(pos.start + pos.heading.length, end),
    };
  });

  const warnings: string[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    const fullText = step.heading + step.body;

    // Check if this step has architectural patterns
    const isArchitectural = ARCH_PATTERNS.some((p) => p.test(fullText));
    if (!isArchitectural) continue;

    // Look ahead up to 2 steps for a [CHECKPOINT]
    let hasCheckpoint = false;
    for (let j = i + 1; j <= Math.min(i + 2, steps.length - 1); j++) {
      if (/\[CHECKPOINT\]/i.test(steps[j]!.heading)) {
        hasCheckpoint = true;
        break;
      }
    }

    if (!hasCheckpoint) {
      // Extract created file paths for the warning message
      const files: string[] = [];
      const backtickPaths = fullText.match(/`([^`]*\/[^`]+)`/g) ?? [];
      for (const bp of backtickPaths) {
        files.push(bp.replace(/`/g, ""));
      }
      const fileList = files.length > 0 ? ` (${files.join(", ")})` : "";
      const label = step.heading.replace(/^###\s+/, "").trim();
      warnings.push(
        `${label} creates/deletes/moves files${fileList} but no [CHECKPOINT] follows within 2 steps.`,
      );
    }
  }

  return warnings;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/cli/__tests__/plan-parser.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/cli/plan-parser.ts src/cli/__tests__/plan-parser.test.ts
git commit -m "feat(cli): add detectMissingCheckpoints to plan-parser"
```

---

### Task 6: Wire --checkpoints flag into validate-plan [CHECKPOINT]

**Files:**
- Modify: `src/cli/index.ts:51-58` (validate-plan case)
- Modify: `src/cli/index.ts:241-461` (runValidatePlan function)

**Step 1: Add --checkpoints flag parsing to the validate-plan case**

Replace lines 51-58:

```typescript
case "validate-plan": {
  const sinceIdx = args.indexOf("--since");
  const since = sinceIdx >= 0 ? args[sinceIdx + 1] : undefined;
  const checkpoints = args.includes("--checkpoints");
  const planFile = args.find(
    (a) => !a.startsWith("--") && a !== since,
  );
  await runValidatePlan(planFile, since, checkpoints);
  break;
}
```

**Step 2: Update runValidatePlan signature and add checkpoint report**

Add `checkpoints` parameter to `runValidatePlan`:

```typescript
async function runValidatePlan(
  planArg?: string,
  sinceDate?: string,
  checkpoints = false,
) {
```

Add checkpoint detection after the existing SUMMARY line (after line ~461), before the closing `}`:

```typescript
  // Checkpoint validation (always run, but only with --checkpoints flag
  // or when architectural patterns are detected)
  if (checkpoints) {
    const { detectMissingCheckpoints } = await import("./plan-parser.js");
    const cpWarnings = detectMissingCheckpoints(planContent);
    if (cpWarnings.length > 0) {
      console.log("\nMISSING CHECKPOINTS:");
      for (const w of cpWarnings) {
        console.log(`  \u26A0 ${w}`);
      }
      console.log(
        `\n  Add [CHECKPOINT] steps after architectural changes: run \`strand update\`,`,
      );
      console.log(
        `  then use the Read tool or \`cat .strand\` to load fresh data into context.`,
      );
    } else {
      console.log("\nCHECKPOINTS: all architectural steps have checkpoints.");
    }
  }
```

**Step 3: Update the help text**

Find the `printHelp()` function and update the validate-plan line to mention `--checkpoints`:

```
strand validate-plan <plan.md> [--since YYYY-MM-DD] [--checkpoints]
```

**Step 4: Run tests**

Run: `npx vitest run`
Expected: ALL PASS

**Step 5: Manual smoke test**

Run: `npx tsx src/cli/index.ts validate-plan docs/plans/2026-03-03-intra-session-freshness-implementation.md --checkpoints`
Expected: Should show MISSING CHECKPOINTS warnings for tasks that create files without [CHECKPOINT] steps, and show clean results for tasks that have them.

**Step 6: Commit**

```bash
git add src/cli/index.ts
git commit -m "feat(cli): add --checkpoints flag to validate-plan"
```

---

### Task 7: Regenerate .strand and verify

**Files:**
- Regenerate: `.strand`
- Verify: `CLAUDE.md`

**Step 1: Run strand update**

Run: `npx tsx src/cli/index.ts update`
Expected: Should show the supersession signal in output.

**Step 2: Run strand init to propagate CLAUDE_MD_SECTION update**

Run: `npx tsx src/cli/index.ts init`
Expected: Should show "upgraded" action since `CLAUDE_MD_SECTION` content changed.

**Step 3: Verify CLAUDE.md has the freshness carve-out**

Read `CLAUDE.md` and confirm it contains:
- `"always prefer the most recently read version"`
- `"generated"` timestamp reference
- Section markers (`<!-- strand:start -->` and `<!-- strand:end -->`) preserved

**Step 4: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add .strand CLAUDE.md
git commit -m "chore: regenerate .strand and upgrade CLAUDE.md with freshness carve-out"
```

---

### Task 8: Validate this plan against itself

**Step 1: Run validate-plan with --checkpoints on this plan**

Run: `npx tsx src/cli/index.ts validate-plan docs/plans/2026-03-03-intra-session-freshness-implementation.md --checkpoints`

Expected: Clean output with checkpoint warnings only for tasks that intentionally omit them (Tasks 1, 2, 4 are template/test-only — no architectural changes that need checkpoints).

**Step 2: Commit the plan**

```bash
git add docs/plans/2026-03-03-intra-session-freshness-implementation.md
git commit -m "docs: add intra-session freshness implementation plan"
```
