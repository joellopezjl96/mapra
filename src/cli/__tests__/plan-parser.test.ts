import { describe, it, expect } from "vitest";
import { extractFilePaths, detectMissingCheckpoints } from "../plan-parser.js";

describe("extractFilePaths", () => {
  it("extracts paths from inline backticks", () => {
    const md = "Modify `src/lib/ordering.ts` and create `src/lib/cart/types.ts`.";
    const paths = extractFilePaths(md);
    expect(paths).toContain("src/lib/ordering.ts");
    expect(paths).toContain("src/lib/cart/types.ts");
  });

  it("extracts paths from code blocks", () => {
    const md = [
      "```typescript",
      "// File: src/app/api/orders/route.ts",
      "export async function POST() {}",
      "```",
    ].join("\n");
    const paths = extractFilePaths(md);
    expect(paths).toContain("src/app/api/orders/route.ts");
  });

  it("extracts paths from task file lists", () => {
    const md = [
      "**Files:**",
      "- Modify: `src/lib/auth.ts:45-60`",
      "- Create: `src/lib/new-file.ts`",
      "- Test: `src/__tests__/auth.test.ts`",
    ].join("\n");
    const paths = extractFilePaths(md);
    expect(paths).toContain("src/lib/auth.ts");
    expect(paths).toContain("src/lib/new-file.ts");
    expect(paths).toContain("src/__tests__/auth.test.ts");
  });

  it("deduplicates paths", () => {
    const md = "Edit `src/a.ts` then `src/a.ts` again.";
    const paths = extractFilePaths(md);
    expect(paths.filter((p) => p === "src/a.ts").length).toBe(1);
  });

  it("strips line number suffixes", () => {
    const md = "See `src/lib/ordering.ts:123-145` for context.";
    const paths = extractFilePaths(md);
    expect(paths).toContain("src/lib/ordering.ts");
    expect(paths).not.toContain("src/lib/ordering.ts:123-145");
  });

  it("ignores non-path backtick content", () => {
    const md = "Run `npm test` and check `PENDING` status.";
    const paths = extractFilePaths(md);
    expect(paths.length).toBe(0);
  });
});

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
Run \`strnd update\` then read the new \`.strand\`.

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
