import { describe, it, expect } from "vitest";
import { detectConventions, type Convention } from "../conventions.js";
import type { StrandNode, StrandEdge } from "../../scanner/index.js";

describe("detectConventions", () => {
  it("detects a convention when 60%+ of a type import the same file", () => {
    // 3 of 4 API routes import sentry.ts (75%)
    const nodes: StrandNode[] = [
      { id: "src/sentry.ts", path: "src/sentry.ts", type: "utility", name: "sentry.ts", lines: 50, imports: [], exports: ["captureException"], complexity: 0.1 },
      { id: "src/api/a/route.ts", path: "src/api/a/route.ts", type: "api-route", name: "route.ts", lines: 30, imports: ["src/sentry.ts"], exports: ["GET"], complexity: 0.2 },
      { id: "src/api/b/route.ts", path: "src/api/b/route.ts", type: "api-route", name: "route.ts", lines: 30, imports: ["src/sentry.ts"], exports: ["POST"], complexity: 0.2 },
      { id: "src/api/c/route.ts", path: "src/api/c/route.ts", type: "api-route", name: "route.ts", lines: 30, imports: ["src/sentry.ts"], exports: ["GET"], complexity: 0.2 },
      { id: "src/api/d/route.ts", path: "src/api/d/route.ts", type: "api-route", name: "route.ts", lines: 30, imports: [], exports: ["DELETE"], complexity: 0.2 },
    ];

    const edges: StrandEdge[] = [
      { from: "src/api/a/route.ts", to: "src/sentry.ts", type: "imports", weight: 1 },
      { from: "src/api/b/route.ts", to: "src/sentry.ts", type: "imports", weight: 1 },
      { from: "src/api/c/route.ts", to: "src/sentry.ts", type: "imports", weight: 1 },
    ];

    const conventions = detectConventions(nodes, edges);

    expect(conventions.length).toBeGreaterThanOrEqual(1);
    const sentry = conventions.find((c) => c.anchorFile === "src/sentry.ts");
    expect(sentry).toBeDefined();
    expect(sentry!.consumerType).toBe("api-route");
    expect(sentry!.adoption).toBe(3);
    expect(sentry!.total).toBe(4);
    expect(sentry!.coverage).toBeCloseTo(0.75);
    expect(sentry!.anchorExports).toContain("captureException");
  });

  it("populates violators for conventions with >= 70% adoption", () => {
    // 3 of 4 API routes import sentry.ts (75% >= 70% threshold)
    const nodes: StrandNode[] = [
      { id: "src/sentry.ts", path: "src/sentry.ts", type: "utility", name: "sentry.ts", lines: 50, imports: [], exports: ["captureException"], complexity: 0.1 },
      { id: "src/api/a/route.ts", path: "src/api/a/route.ts", type: "api-route", name: "route.ts", lines: 30, imports: ["src/sentry.ts"], exports: ["GET"], complexity: 0.2 },
      { id: "src/api/b/route.ts", path: "src/api/b/route.ts", type: "api-route", name: "route.ts", lines: 30, imports: ["src/sentry.ts"], exports: ["POST"], complexity: 0.2 },
      { id: "src/api/c/route.ts", path: "src/api/c/route.ts", type: "api-route", name: "route.ts", lines: 30, imports: ["src/sentry.ts"], exports: ["GET"], complexity: 0.2 },
      { id: "src/api/d/route.ts", path: "src/api/d/route.ts", type: "api-route", name: "route.ts", lines: 30, imports: [], exports: ["DELETE"], complexity: 0.2 },
    ];

    const edges: StrandEdge[] = [
      { from: "src/api/a/route.ts", to: "src/sentry.ts", type: "imports", weight: 1 },
      { from: "src/api/b/route.ts", to: "src/sentry.ts", type: "imports", weight: 1 },
      { from: "src/api/c/route.ts", to: "src/sentry.ts", type: "imports", weight: 1 },
    ];

    const conventions = detectConventions(nodes, edges);
    const sentry = conventions.find((c) => c.anchorFile === "src/sentry.ts");
    expect(sentry).toBeDefined();
    expect(sentry!.violators).toEqual(["src/api/d/route.ts"]);
  });

  it("does not populate violators for conventions below 70% adoption", () => {
    // 3 of 5 API routes import sentry.ts (60%, below 70% violation threshold)
    const nodes: StrandNode[] = [
      { id: "src/sentry.ts", path: "src/sentry.ts", type: "utility", name: "sentry.ts", lines: 50, imports: [], exports: ["captureException"], complexity: 0.1 },
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `src/api/${i}/route.ts`,
        path: `src/api/${i}/route.ts`,
        type: "api-route" as const,
        name: "route.ts",
        lines: 30,
        imports: i < 3 ? ["src/sentry.ts"] : [],
        exports: ["GET"],
        complexity: 0.2,
      })),
    ];

    const edges: StrandEdge[] = Array.from({ length: 3 }, (_, i) => ({
      from: `src/api/${i}/route.ts`,
      to: "src/sentry.ts",
      type: "imports" as const,
      weight: 1,
    }));

    const conventions = detectConventions(nodes, edges);
    const sentry = conventions.find((c) => c.anchorFile === "src/sentry.ts");
    expect(sentry).toBeDefined();
    expect(sentry!.violators).toEqual([]);
  });

  it("ignores patterns below 60% threshold", () => {
    // 2 of 5 routes import auth.ts (40%) — not a convention
    const nodes: StrandNode[] = [
      { id: "src/auth.ts", path: "src/auth.ts", type: "utility", name: "auth.ts", lines: 50, imports: [], exports: ["checkAuth"], complexity: 0.1 },
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `src/api/${i}/route.ts`,
        path: `src/api/${i}/route.ts`,
        type: "api-route" as const,
        name: "route.ts",
        lines: 30,
        imports: i < 2 ? ["src/auth.ts"] : [],
        exports: ["GET"],
        complexity: 0.2,
      })),
    ];

    const edges: StrandEdge[] = [
      { from: "src/api/0/route.ts", to: "src/auth.ts", type: "imports", weight: 1 },
      { from: "src/api/1/route.ts", to: "src/auth.ts", type: "imports", weight: 1 },
    ];

    const conventions = detectConventions(nodes, edges);
    const auth = conventions.find((c) => c.anchorFile === "src/auth.ts");
    expect(auth).toBeUndefined();
  });

  it("requires at least 3 files of a type to detect conventions", () => {
    // 2 of 2 routes import something (100%) but only 2 files — too few
    const nodes: StrandNode[] = [
      { id: "src/lib.ts", path: "src/lib.ts", type: "utility", name: "lib.ts", lines: 50, imports: [], exports: ["helper"], complexity: 0.1 },
      { id: "src/api/a/route.ts", path: "src/api/a/route.ts", type: "api-route", name: "route.ts", lines: 30, imports: ["src/lib.ts"], exports: ["GET"], complexity: 0.2 },
      { id: "src/api/b/route.ts", path: "src/api/b/route.ts", type: "api-route", name: "route.ts", lines: 30, imports: ["src/lib.ts"], exports: ["POST"], complexity: 0.2 },
    ];

    const edges: StrandEdge[] = [
      { from: "src/api/a/route.ts", to: "src/lib.ts", type: "imports", weight: 1 },
      { from: "src/api/b/route.ts", to: "src/lib.ts", type: "imports", weight: 1 },
    ];

    const conventions = detectConventions(nodes, edges);
    expect(conventions.length).toBe(0);
  });
});
