# Framework Entry Points + Test File Filtering — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix two accuracy issues: dead code false positives for Next.js entry points, and test infrastructure dominating RISK/HOTSPOTS/MOST IMPORTED.

**Architecture:** Extend `classifyFile()` in the scanner to recognize more Next.js entry points (`loading.tsx`, `error.tsx`, `not-found.tsx`). Extend `classifyFile()` to catch e2e test patterns. Filter test nodes from RISK and MOST IMPORTED in the encoder. Dead code already skips classified entry point types — fixing classification fixes dead code.

**Tech Stack:** TypeScript, Vitest

---

### Task 1: Extend classifyFile to catch missing entry points and test patterns

**Files:**
- Modify: `src/scanner/index.ts:261-307` (classifyFile function)
- Test: `src/scanner/__tests__/classify.test.ts` (new)

**Step 1: Write the failing test**

Create `src/scanner/__tests__/classify.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { scanCodebase } from "../index.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

function scaffoldAndScan(files: Record<string, string>) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "strand-classify-"));
  // Create package.json so resolveTarget doesn't warn
  fs.writeFileSync(path.join(tmp, "package.json"), '{"name":"test"}');
  // Create next.config.js so framework is detected as nextjs
  fs.writeFileSync(path.join(tmp, "next.config.js"), "module.exports = {};");

  for (const [filePath, content] of Object.entries(files)) {
    const full = path.join(tmp, filePath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }

  const graph = scanCodebase(tmp);
  fs.rmSync(tmp, { recursive: true, force: true });
  return graph;
}

describe("classifyFile — Next.js entry points", () => {
  it("classifies page.tsx as route", () => {
    const graph = scaffoldAndScan({
      "src/app/dashboard/page.tsx": "export default function Page() { return <div/>; }",
    });
    const node = graph.nodes.find(n => n.path.includes("page.tsx"));
    expect(node?.type).toBe("route");
  });

  it("classifies layout.tsx as layout", () => {
    const graph = scaffoldAndScan({
      "src/app/layout.tsx": "export default function Layout({ children }) { return <div>{children}</div>; }",
    });
    const node = graph.nodes.find(n => n.path.includes("layout.tsx"));
    expect(node?.type).toBe("layout");
  });

  it("classifies loading.tsx as route", () => {
    const graph = scaffoldAndScan({
      "src/app/dashboard/loading.tsx": "export default function Loading() { return <div/>; }",
    });
    const node = graph.nodes.find(n => n.path.includes("loading.tsx"));
    expect(node?.type).toBe("route");
  });

  it("classifies error.tsx as route", () => {
    const graph = scaffoldAndScan({
      "src/app/settings/error.tsx": "'use client'; export default function Error() { return <div/>; }",
    });
    const node = graph.nodes.find(n => n.path.includes("error.tsx"));
    expect(node?.type).toBe("route");
  });

  it("classifies not-found.tsx as route", () => {
    const graph = scaffoldAndScan({
      "src/app/not-found.tsx": "export default function NotFound() { return <div/>; }",
    });
    const node = graph.nodes.find(n => n.path.includes("not-found.tsx"));
    expect(node?.type).toBe("route");
  });

  it("classifies api route.ts as api-route", () => {
    const graph = scaffoldAndScan({
      "src/app/api/users/route.ts": "export async function GET() { return Response.json({}); }",
    });
    const node = graph.nodes.find(n => n.path.includes("route.ts"));
    expect(node?.type).toBe("api-route");
  });

  it("classifies middleware.ts as middleware", () => {
    const graph = scaffoldAndScan({
      "middleware.ts": "export function middleware(req) { return req; }",
    });
    const node = graph.nodes.find(n => n.path.includes("middleware.ts"));
    expect(node?.type).toBe("middleware");
  });
});

describe("classifyFile — test patterns", () => {
  it("classifies .e2e-spec.ts as test", () => {
    const graph = scaffoldAndScan({
      "src/api/bookings.e2e-spec.ts": "describe('bookings', () => {});",
    });
    const node = graph.nodes.find(n => n.path.includes("e2e-spec"));
    expect(node?.type).toBe("test");
  });

  it("classifies .e2e.ts as test", () => {
    const graph = scaffoldAndScan({
      "src/api/bookings.e2e.ts": "describe('bookings', () => {});",
    });
    const node = graph.nodes.find(n => n.path.includes("e2e.ts"));
    expect(node?.type).toBe("test");
  });

  it("classifies files in playwright/ as test", () => {
    const graph = scaffoldAndScan({
      "playwright/fixtures/bookings.ts": "export function createBooking() {}",
    });
    const node = graph.nodes.find(n => n.path.includes("bookings.ts"));
    expect(node?.type).toBe("test");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/scanner/__tests__/classify.test.ts`
Expected: FAIL — `loading.tsx`, `error.tsx`, `not-found.tsx` classified as "component", e2e/playwright files classified as "utility"

**Step 3: Extend classifyFile**

In `src/scanner/index.ts`, update the `classifyFile` function:

```typescript
function classifyFile(
  relativePath: string,
  content: string,
  framework: FrameworkInfo,
): StrandNode["type"] {
  const normalized = relativePath.replace(/\\/g, "/");

  // Test files
  if (
    /\.(test|spec|e2e-spec|e2e)\.(ts|tsx|js|jsx)$/.test(normalized) ||
    normalized.includes("__tests__/") ||
    normalized.includes("/playwright/") ||
    /^playwright\//.test(normalized)
  ) {
    return "test";
  }

  // Config files
  if (
    /\.(config|rc)\.(ts|js|mjs|cjs)$/.test(normalized) ||
    normalized === "tsconfig.json"
  ) {
    return "config";
  }

  // Prisma schema
  if (normalized.endsWith(".prisma")) return "schema";

  // Next.js specific
  if (framework.name === "nextjs") {
    if (/\/api\/.*route\.(ts|js)$/.test(normalized)) return "api-route";
    if (/\/page\.(tsx|jsx|ts|js)$/.test(normalized)) return "route";
    if (/\/layout\.(tsx|jsx|ts|js)$/.test(normalized)) return "layout";
    if (/\/(loading|error|not-found)\.(tsx|jsx|ts|js)$/.test(normalized)) return "route";
    if (/middleware\.(ts|js)$/.test(normalized)) return "middleware";
  }

  // React components (files with JSX exports)
  if (/\.(tsx|jsx)$/.test(normalized) && !normalized.includes("__tests__")) {
    if (
      content.includes("export default function") ||
      content.includes("export function") ||
      content.includes("export const")
    ) {
      return "component";
    }
  }

  return "utility";
}
```

Changes:
1. Added `.e2e-spec.` and `.e2e.` to test file regex
2. Added `/playwright/` and `^playwright/` directory detection for test files
3. Added `loading`, `error`, `not-found` as Next.js route entry points

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/scanner/__tests__/classify.test.ts`
Expected: All PASS

**Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All 118+ tests PASS

**Step 6: Commit**

```bash
git add src/scanner/index.ts src/scanner/__tests__/classify.test.ts
git commit -m "fix(scanner): classify Next.js entry points + e2e/playwright as test

loading.tsx, error.tsx, not-found.tsx now classified as route (entry points).
.e2e-spec.ts, .e2e.ts, and files under playwright/ now classified as test.
Fixes dead code false positives for framework entry points."
```

---

### Task 2: Filter test files from RISK and MOST IMPORTED

**Files:**
- Modify: `src/encoder/strand-format-encode.ts:120-170` (renderRisk)
- Modify: `src/encoder/strand-format-encode.ts:310-330` (renderMostImported)
- Test: `src/encoder/__tests__/test-filter.test.ts` (new)

**Step 1: Write the failing test**

Create `src/encoder/__tests__/test-filter.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { encodeToStrandFormat } from "../strand-format-encode.js";
import type { StrandGraph } from "../../scanner/index.js";
import type { GraphAnalysis } from "../../analyzer/index.js";

function makeGraph(nodes: Array<{ id: string; type: string }>): StrandGraph {
  return {
    projectName: "test",
    projectType: "app",
    framework: "nextjs",
    totalFiles: nodes.length,
    totalLines: 1000,
    modules: [],
    nodes: nodes.map(n => ({
      id: n.id,
      path: n.id,
      type: n.type as any,
      name: n.id.split("/").pop()!,
      lines: 100,
      imports: [],
      exports: ["foo"],
      complexity: 0.5,
    })),
    edges: [
      // Make production file imported by 5 things
      ...Array.from({ length: 5 }, (_, i) => ({
        from: `src/importer-${i}.ts`,
        to: "src/lib/production.ts",
        type: "imports" as const,
        weight: 1,
      })),
      // Make test file imported by 10 things
      ...Array.from({ length: 10 }, (_, i) => ({
        from: `test/importer-${i}.ts`,
        to: "playwright/fixtures.ts",
        type: "imports" as const,
        weight: 1,
      })),
    ],
  };
}

function makeAnalysis(): GraphAnalysis {
  return {
    risk: [
      {
        nodeId: "playwright/fixtures.ts",
        directImporters: 10,
        affectedCount: 50,
        amplificationRatio: 5.0,
        maxDepth: 3,
        modulesAffected: 1,
      },
      {
        nodeId: "src/lib/production.ts",
        directImporters: 5,
        affectedCount: 20,
        amplificationRatio: 4.0,
        maxDepth: 2,
        modulesAffected: 2,
      },
    ],
    deadCode: [],
    churn: new Map(),
    conventions: [],
  };
}

describe("test file filtering in encoder", () => {
  const graph = makeGraph([
    { id: "src/lib/production.ts", type: "utility" },
    { id: "playwright/fixtures.ts", type: "test" },
  ]);
  const analysis = makeAnalysis();

  it("RISK excludes test files", () => {
    const output = encodeToStrandFormat(graph, analysis);
    expect(output).toContain("src/lib/production.ts");
    expect(output).not.toContain("playwright/fixtures.ts");
  });

  it("MOST IMPORTED excludes test files", () => {
    const output = encodeToStrandFormat(graph, analysis);
    // The test file has 10 importers but should not appear
    const mostImportedSection = output.split("MOST IMPORTED")[1]?.split("───")[0] ?? "";
    expect(mostImportedSection).not.toContain("playwright/fixtures.ts");
    expect(mostImportedSection).toContain("src/lib/production.ts");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/encoder/__tests__/test-filter.test.ts`
Expected: FAIL — `playwright/fixtures.ts` appears in RISK and MOST IMPORTED

**Step 3: Add test file filtering to renderRisk and renderMostImported**

In `src/encoder/strand-format-encode.ts`, update `renderRisk`:

```typescript
function renderRisk(graph: StrandGraph, analysis: GraphAnalysis): string {
  // Filter out test files from risk
  const testNodeIds = new Set(
    graph.nodes.filter(n => n.type === "test").map(n => n.id),
  );
  const filtered = analysis.risk.filter(r => !testNodeIds.has(r.nodeId));
  const top = filtered.slice(0, 8);
  if (top.length === 0) return "";
```

Update `renderMostImported`:

```typescript
function renderMostImported(graph: StrandGraph): string {
  const testNodeIds = new Set(
    graph.nodes.filter(n => n.type === "test").map(n => n.id),
  );
  const edgeCounts = new Map<string, number>();
  for (const edge of graph.edges) {
    if (testNodeIds.has(edge.to)) continue;
    edgeCounts.set(edge.to, (edgeCounts.get(edge.to) || 0) + 1);
  }
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/encoder/__tests__/test-filter.test.ts`
Expected: All PASS

**Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add src/encoder/strand-format-encode.ts src/encoder/__tests__/test-filter.test.ts
git commit -m "fix(encoder): filter test files from RISK and MOST IMPORTED

Test infrastructure (playwright helpers, e2e specs) was dominating
RISK with amp 91-94, burying production risks. Now filters nodes
with type=test from RISK and MOST IMPORTED sections."
```

---

### Task 3: Verify on cal.com

**Files:** None (verification only)

**Step 1: Regenerate cal.com .strand**

Run: `npx tsx src/cli/index.ts generate C:/dev/cal.com`

**Step 2: Inspect RISK section**

Verify:
- Top RISK entries are production files (not Playwright helpers)
- `RegularBookingService.ts` or similar production files appear
- No `playwright/` paths in RISK

**Step 3: Inspect DEAD CODE section**

Verify:
- `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx` files no longer appear
- Dead code count is significantly lower than 4,369

**Step 4: Inspect MOST IMPORTED**

Verify:
- `playwright/lib/fixtures.ts` (x86) no longer appears
- Top entries are production files

**Step 5: Run dead code analysis to count improvements**

Compare before/after dead code counts. Expected: ~500+ fewer false positives.

**Step 6: Commit updated findings**

```bash
git commit -m "docs: update cal.com findings after entry point + test filter fix"
```

---

## Task Dependency Graph

```
Task 1 (scanner classify) ──→ Task 2 (encoder filter) ──→ Task 3 (verify on cal.com)
```

Task 2 depends on Task 1 because the encoder filters by `node.type === "test"`, which requires the scanner to classify correctly first.
