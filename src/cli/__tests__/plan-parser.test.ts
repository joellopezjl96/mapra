import { describe, it, expect } from "vitest";
import { extractFilePaths } from "../plan-parser.js";

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
