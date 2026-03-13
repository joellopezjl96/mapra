import { describe, it, expect } from "vitest";
import { analyzeGraph } from "../index.js";
import type { StrandGraph, StrandNode, StrandEdge } from "../../scanner/index.js";

function makeNode(id: string, type: StrandNode["type"] = "utility"): StrandNode {
  return {
    id,
    path: id,
    type,
    name: id.split("/").pop()!,
    lines: 50,
    imports: [],
    exports: ["default"],
    complexity: 0.3,
  };
}

function makeGraph(nodes: StrandNode[], edges: StrandEdge[] = []): StrandGraph {
  return {
    projectName: "test",
    projectType: "test",
    framework: "typescript",
    totalFiles: nodes.length,
    totalLines: nodes.length * 50,
    nodes,
    edges,
    modules: [],
  };
}

describe("dead code — DI entry point exclusion", () => {
  it("excludes *.service.ts from dead code even with zero inbound edges", () => {
    const graph = makeGraph([
      makeNode("src/bookings/bookings.service.ts"),
      makeNode("src/utils/helpers.ts"),
    ]);

    const analysis = analyzeGraph(graph);

    expect(analysis.deadCode).not.toContain("src/bookings/bookings.service.ts");
    expect(analysis.deadCode).toContain("src/utils/helpers.ts");
  });

  it("excludes *.repository.ts from dead code", () => {
    const graph = makeGraph([
      makeNode("src/bookings/bookings.repository.ts"),
    ]);

    const analysis = analyzeGraph(graph);
    expect(analysis.deadCode).not.toContain("src/bookings/bookings.repository.ts");
  });

  it("excludes *.resolver.ts from dead code", () => {
    const graph = makeGraph([
      makeNode("src/graphql/users.resolver.ts"),
    ]);

    const analysis = analyzeGraph(graph);
    expect(analysis.deadCode).not.toContain("src/graphql/users.resolver.ts");
  });

  it("excludes *.gateway.ts from dead code", () => {
    const graph = makeGraph([
      makeNode("src/events/events.gateway.ts"),
    ]);

    const analysis = analyzeGraph(graph);
    expect(analysis.deadCode).not.toContain("src/events/events.gateway.ts");
  });

  it("excludes *.subscriber.ts from dead code", () => {
    const graph = makeGraph([
      makeNode("src/events/order-created.subscriber.ts"),
    ]);

    const analysis = analyzeGraph(graph);
    expect(analysis.deadCode).not.toContain("src/events/order-created.subscriber.ts");
  });

  it("still flags genuinely dead utility files", () => {
    const graph = makeGraph([
      makeNode("src/unused-helper.ts"),
      makeNode("src/bookings/bookings.service.ts"),
    ]);

    const analysis = analyzeGraph(graph);
    expect(analysis.deadCode).toContain("src/unused-helper.ts");
    expect(analysis.deadCode).not.toContain("src/bookings/bookings.service.ts");
  });

  it("does not affect files already excluded by SKIP_TYPES", () => {
    const graph = makeGraph([
      makeNode("src/app/page.tsx", "route"),
      makeNode("src/bookings/bookings.controller.ts", "route"),
    ]);

    const analysis = analyzeGraph(graph);
    expect(analysis.deadCode).not.toContain("src/app/page.tsx");
    expect(analysis.deadCode).not.toContain("src/bookings/bookings.controller.ts");
  });
});
