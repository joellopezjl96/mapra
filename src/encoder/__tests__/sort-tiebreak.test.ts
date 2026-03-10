import { describe, it, expect } from "vitest";
import { encodeToStrandFormat } from "../strand-format-encode.js";
import type { StrandGraph } from "../../scanner/index.js";

/**
 * Build a minimal graph with the given nodes.
 * Each node gets the provided type, complexity, and lines.
 */
function makeGraph(
  nodes: Array<{
    id: string;
    type: string;
    complexity: number;
    lines: number;
    routePath?: string;
    methods?: string[];
  }>,
): StrandGraph {
  return {
    projectName: "test",
    projectType: "app",
    framework: "nextjs",
    totalFiles: nodes.length,
    totalLines: nodes.reduce((sum, n) => sum + n.lines, 0),
    modules: [],
    nodes: nodes.map((n) => ({
      id: n.id,
      path: n.id,
      type: n.type as any,
      name: n.id.split("/").pop()!,
      lines: n.lines,
      imports: [],
      exports: [],
      complexity: n.complexity,
      framework:
        n.type === "api-route"
          ? {
              type: "nextjs-api",
              metadata: {
                methods: n.methods ?? ["GET"],
                routePath: n.routePath ?? n.id,
              },
            }
          : n.type === "route"
            ? {
                type: "nextjs-page",
                metadata: {
                  routePath: n.routePath ?? n.id,
                },
              }
            : undefined,
    })),
    edges: [],
  };
}

/**
 * Extract a section from the encoded output by header keyword.
 * Returns all lines between the section header and the next section header (or end).
 */
function extractSection(output: string, keyword: string): string[] {
  const lines = output.split("\n");
  const startIdx = lines.findIndex((l) => l.includes(keyword));
  if (startIdx === -1) return [];
  const result: string[] = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i]!.startsWith("───")) break;
    result.push(lines[i]!);
  }
  return result;
}

describe("tie-breaking sort by lines descending", () => {
  it("API ROUTES with same complexity are sorted by lines descending", () => {
    const graph = makeGraph([
      {
        id: "src/app/api/small/route.ts",
        type: "api-route",
        complexity: 1.0,
        lines: 50,
        routePath: "/api/small",
        methods: ["GET"],
      },
      {
        id: "src/app/api/large/route.ts",
        type: "api-route",
        complexity: 1.0,
        lines: 300,
        routePath: "/api/large",
        methods: ["POST"],
      },
      {
        id: "src/app/api/medium/route.ts",
        type: "api-route",
        complexity: 1.0,
        lines: 150,
        routePath: "/api/medium",
        methods: ["GET"],
      },
    ]);

    const output = encodeToStrandFormat(graph);
    const section = extractSection(output, "API ROUTES");

    // Filter to data lines only (non-empty)
    const dataLines = section.filter((l) => l.trim().length > 0);
    expect(dataLines).toHaveLength(3);

    // The order should be: large (300L), medium (150L), small (50L)
    expect(dataLines[0]).toContain("/api/large");
    expect(dataLines[1]).toContain("/api/medium");
    expect(dataLines[2]).toContain("/api/small");
  });

  it("PAGES with same complexity are sorted by lines descending", () => {
    const graph = makeGraph([
      {
        id: "src/app/tiny/page.tsx",
        type: "route",
        complexity: 0.8,
        lines: 20,
        routePath: "/tiny",
      },
      {
        id: "src/app/huge/page.tsx",
        type: "route",
        complexity: 0.8,
        lines: 500,
        routePath: "/huge",
      },
      {
        id: "src/app/mid/page.tsx",
        type: "route",
        complexity: 0.8,
        lines: 200,
        routePath: "/mid",
      },
    ]);

    const output = encodeToStrandFormat(graph);
    const section = extractSection(output, "PAGES");

    const dataLines = section.filter((l) => l.trim().length > 0);
    expect(dataLines).toHaveLength(3);

    // The order should be: huge (500L), mid (200L), tiny (20L)
    expect(dataLines[0]).toContain("/huge");
    expect(dataLines[1]).toContain("/mid");
    expect(dataLines[2]).toContain("/tiny");
  });

  it("different complexity still sorts by complexity first", () => {
    const graph = makeGraph([
      {
        id: "src/app/api/complex-small/route.ts",
        type: "api-route",
        complexity: 0.9,
        lines: 50,
        routePath: "/api/complex-small",
        methods: ["GET"],
      },
      {
        id: "src/app/api/simple-large/route.ts",
        type: "api-route",
        complexity: 0.3,
        lines: 500,
        routePath: "/api/simple-large",
        methods: ["GET"],
      },
    ]);

    const output = encodeToStrandFormat(graph);
    const section = extractSection(output, "API ROUTES");
    const dataLines = section.filter((l) => l.trim().length > 0);

    // Higher complexity comes first, regardless of lines
    expect(dataLines[0]).toContain("/api/complex-small");
    expect(dataLines[1]).toContain("/api/simple-large");
  });
});
