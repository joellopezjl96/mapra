import { describe, it, expect } from "vitest";
import { encodeToStrandFormat } from "../strand-format-encode.js";
import type { StrandGraph, StrandNode, StrandEdge } from "../../scanner/index.js";
import type { GraphAnalysis } from "../../analyzer/index.js";
import type { BlastResult } from "../../analyzer/blast-radius.js";

function makeNode(id: string, overrides?: Partial<StrandNode>): StrandNode {
  return {
    id,
    path: id,
    type: "utility",
    name: id.split("/").pop()!,
    lines: 100,
    imports: [],
    exports: ["default"],
    complexity: 0.5,
    ...overrides,
  };
}

function makeRisk(nodeId: string, amp: number, direct: number, affected: number, modules?: string[]): BlastResult {
  return {
    nodeId,
    directImporters: direct,
    affectedCount: affected,
    weightedImpact: amp * 0.1,
    modulesAffected: modules?.length ?? 1,
    affectedModuleNames: modules ?? [],
    maxDepth: 3,
    amplificationRatio: amp,
  };
}

function makeGraph(nodes: StrandNode[], edges: StrandEdge[] = []): StrandGraph {
  return {
    projectName: "test",
    projectType: "test",
    framework: "typescript",
    totalFiles: nodes.length,
    totalLines: nodes.length * 100,
    nodes,
    edges,
    modules: [],
  };
}

function makeAnalysis(risk: BlastResult[]): GraphAnalysis {
  return {
    risk,
    deadCode: [],
    churn: new Map(),
    conventions: [],
    coChanges: [],
  };
}

describe("RISK module deduplication", () => {
  it("deduplicates entries from same module", () => {
    // 4 nodes in packages/prisma/* (amp 2000+), 4 in other modules (amp 50-100)
    const nodes = [
      makeNode("packages/prisma/ext-a.ts"),
      makeNode("packages/prisma/ext-b.ts"),
      makeNode("packages/prisma/ext-c.ts"),
      makeNode("packages/prisma/ext-d.ts"),
      makeNode("packages/trpc/errorFormatter.ts"),
      makeNode("packages/lib/auth.ts"),
      makeNode("packages/features/booking.ts"),
      makeNode("apps/web/middleware.ts"),
    ];

    const risk = [
      makeRisk("packages/prisma/ext-a.ts", 2305, 5, 2305),
      makeRisk("packages/prisma/ext-b.ts", 2300, 5, 2300),
      makeRisk("packages/prisma/ext-c.ts", 2200, 5, 2200),
      makeRisk("packages/prisma/ext-d.ts", 2100, 5, 2100),
      makeRisk("packages/trpc/errorFormatter.ts", 68, 1, 68),
      makeRisk("packages/lib/auth.ts", 55, 3, 55),
      makeRisk("packages/features/booking.ts", 40, 2, 40),
      makeRisk("apps/web/middleware.ts", 30, 1, 30),
    ];

    const graph = makeGraph(nodes);
    const analysis = makeAnalysis(risk);
    const output = encodeToStrandFormat(graph, analysis);

    // Should show 1 Prisma entry + all 4 others = 5 entries
    expect(output).toContain("packages/prisma/ext-a.ts");
    expect(output).toContain("packages/trpc/errorFormatter.ts");
    expect(output).toContain("packages/lib/auth.ts");
    expect(output).toContain("packages/features/booking.ts");
    expect(output).toContain("apps/web/middleware.ts");

    // Should NOT show the duplicate prisma entries as top-level RISK lines
    // (they appear in the +N similar line instead)
    const riskSection = output.split("─── RISK")[1]!.split("─── ")[0]!;
    const prismaLines = riskSection.split("\n").filter(l =>
      l.includes("packages/prisma/ext-") && !l.includes("+") && !l.includes("similar"),
    );
    expect(prismaLines).toHaveLength(1);
  });

  it("shows +N similar line", () => {
    const nodes = [
      makeNode("packages/prisma/ext-a.ts"),
      makeNode("packages/prisma/ext-b.ts"),
      makeNode("packages/prisma/ext-c.ts"),
      makeNode("packages/prisma/ext-d.ts"),
      makeNode("packages/trpc/errorFormatter.ts"),
    ];

    const risk = [
      makeRisk("packages/prisma/ext-a.ts", 2305, 5, 2305),
      makeRisk("packages/prisma/ext-b.ts", 2300, 5, 2300),
      makeRisk("packages/prisma/ext-c.ts", 2200, 5, 2200),
      makeRisk("packages/prisma/ext-d.ts", 2100, 5, 2100),
      makeRisk("packages/trpc/errorFormatter.ts", 68, 1, 68),
    ];

    const graph = makeGraph(nodes);
    const analysis = makeAnalysis(risk);
    const output = encodeToStrandFormat(graph, analysis);

    expect(output).toContain("+3 similar in packages/prisma");
  });

  it("small codebase unchanged — all entries from different modules", () => {
    const nodes = [
      makeNode("src/lib/ordering.ts"),
      makeNode("src/app/page.tsx"),
      makeNode("src/components/button.tsx"),
    ];

    const risk = [
      makeRisk("src/lib/ordering.ts", 3, 2, 6),
      makeRisk("src/app/page.tsx", 2, 1, 2),
      makeRisk("src/components/button.tsx", 1.5, 1, 1),
    ];

    const graph = makeGraph(nodes);
    const analysis = makeAnalysis(risk);
    const output = encodeToStrandFormat(graph, analysis);

    // All entries shown, no +similar lines
    expect(output).toContain("src/lib/ordering.ts");
    expect(output).toContain("src/app/page.tsx");
    expect(output).toContain("src/components/button.tsx");
    expect(output).not.toContain("similar in");
  });

  it("remaining count excludes collapsed entries", () => {
    // >8 modules, some with dupes — test that +N more count is correct
    const nodes: StrandNode[] = [];
    const risk: BlastResult[] = [];

    // 3 entries in packages/prisma (will collapse to 1, +2 similar)
    for (let i = 0; i < 3; i++) {
      const id = `packages/prisma/ext-${i}.ts`;
      nodes.push(makeNode(id));
      risk.push(makeRisk(id, 2000 - i, 5, 2000 - i));
    }

    // 10 entries in different modules
    // Tier 1: prisma (1 slot) + mod0-mod3 (4 slots) = 5 Tier 1 slots
    // Tier 2: mod4-mod6 (3 slots)
    // Remaining: 13 total - 8 shown - 2 collapsed = 3
    for (let i = 0; i < 10; i++) {
      const id = `packages/mod${i}/file.ts`;
      nodes.push(makeNode(id));
      risk.push(makeRisk(id, 100 - i, 2, 100 - i));
    }

    const graph = makeGraph(nodes);
    const analysis = makeAnalysis(risk);
    const output = encodeToStrandFormat(graph, analysis);

    expect(output).toContain("+2 similar in packages/prisma");
    expect(output).toContain("+3 more with blast radius > 1");
  });
});

describe("RISK tiered selection", () => {
  it("surfaces mid-level amplifiers in Tier 2 when monorepo has 10+ modules", () => {
    // 5 high-amp modules (amp 500+) fill Tier 1
    // 5 mid-amp modules (amp 30-100) — top 3 should appear in Tier 2
    const nodes: StrandNode[] = [];
    const risk: BlastResult[] = [];

    for (let i = 0; i < 5; i++) {
      const id = `packages/infra${i}/core.ts`;
      nodes.push(makeNode(id));
      risk.push(makeRisk(id, 1000 - i * 100, 5, 1000 - i * 100));
    }
    for (let i = 0; i < 5; i++) {
      const id = `packages/feature${i}/index.ts`;
      nodes.push(makeNode(id));
      risk.push(makeRisk(id, 80 - i * 10, 3, 80 - i * 10));
    }

    const graph = makeGraph(nodes);
    const analysis = makeAnalysis(risk);
    const output = encodeToStrandFormat(graph, analysis);

    // Tier 1: top 5 infrastructure entries
    expect(output).toContain("packages/infra0/core.ts");
    expect(output).toContain("packages/infra4/core.ts");

    // Tier 2: top 3 mid-level entries
    expect(output).toContain("packages/feature0/index.ts");
    expect(output).toContain("packages/feature1/index.ts");
    expect(output).toContain("packages/feature2/index.ts");

    // feature3 and feature4 NOT shown (only 3 Tier 2 slots)
    const riskSection = output.split("─── RISK")[1]!.split("─── ")[0]!;
    expect(riskSection).not.toContain("packages/feature3/index.ts");
    expect(riskSection).not.toContain("packages/feature4/index.ts");
  });

  it("small codebase with <8 modules fills normally (no tier split)", () => {
    const nodes = [
      makeNode("src/lib/a.ts"),
      makeNode("src/lib/b.ts"),
      makeNode("src/app/c.ts"),
    ];
    const risk = [
      makeRisk("src/lib/a.ts", 5, 2, 10),
      makeRisk("src/lib/b.ts", 3, 1, 3),
      makeRisk("src/app/c.ts", 2, 1, 2),
    ];

    const graph = makeGraph(nodes);
    const analysis = makeAnalysis(risk);
    const output = encodeToStrandFormat(graph, analysis);

    // All 3 shown, no tier logic needed
    expect(output).toContain("src/lib/a.ts");
    // src/lib/b.ts is same module as a.ts — collapsed
    expect(output).toContain("src/app/c.ts");
  });

  it("adds blank line separator between Tier 1 and Tier 2", () => {
    const nodes: StrandNode[] = [];
    const risk: BlastResult[] = [];

    // 5 high-amp in different modules
    for (let i = 0; i < 5; i++) {
      const id = `packages/mod${i}/file.ts`;
      nodes.push(makeNode(id));
      risk.push(makeRisk(id, 500 - i * 50, 3, 500 - i * 50));
    }
    // 3 mid-amp in different modules
    for (let i = 0; i < 3; i++) {
      const id = `packages/feat${i}/file.ts`;
      nodes.push(makeNode(id));
      risk.push(makeRisk(id, 50 - i * 10, 2, 50 - i * 10));
    }

    const graph = makeGraph(nodes);
    const analysis = makeAnalysis(risk);
    const output = encodeToStrandFormat(graph, analysis);

    // Should have a blank line separating tiers
    const riskSection = output.split("─── RISK")[1]!.split("─── ")[0]!;
    const lines = riskSection.split("\n");

    // Find blank lines that separate entry blocks (not the trailing one)
    const entryLines = lines.filter(l => l.includes("amp"));
    expect(entryLines.length).toBe(8); // 5 + 3
  });

  it("remaining count is correct with tiered selection", () => {
    const nodes: StrandNode[] = [];
    const risk: BlastResult[] = [];

    // 6 high-amp modules → 5 fill Tier 1, 1 goes to Tier 2 pool
    for (let i = 0; i < 6; i++) {
      const id = `packages/hi${i}/file.ts`;
      nodes.push(makeNode(id));
      risk.push(makeRisk(id, 500 - i * 50, 3, 500 - i * 50));
    }
    // 5 mid-amp modules → 3 fill Tier 2, 2 remaining
    for (let i = 0; i < 5; i++) {
      const id = `packages/lo${i}/file.ts`;
      nodes.push(makeNode(id));
      risk.push(makeRisk(id, 50 - i * 5, 2, 50 - i * 5));
    }

    const graph = makeGraph(nodes);
    const analysis = makeAnalysis(risk);
    const output = encodeToStrandFormat(graph, analysis);

    // Total: 11 entries, 11 unique modules
    // Tier 1: 5 shown
    // Tier 2: 3 shown (hi5, lo0, lo1)
    // Remaining: 11 - 5 - 3 = 3
    expect(output).toContain("+3 more with blast radius > 1");
  });
});
