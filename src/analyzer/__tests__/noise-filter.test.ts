import { describe, it, expect } from "vitest";
import { isNoiseFile, analyzeGraph } from "../index.js";

describe("isNoiseFile", () => {
  it("matches .generated.ts files", () => {
    expect(isNoiseFile("packages/app-store/apps.metadata.generated.ts")).toBe(true);
  });

  it("matches .generated.tsx files", () => {
    expect(isNoiseFile("src/components/Icons.generated.tsx")).toBe(true);
  });

  it("matches .d.ts declaration files", () => {
    expect(isNoiseFile("src/types/global.d.ts")).toBe(true);
  });

  it("matches .d.ts in nested paths", () => {
    expect(isNoiseFile("experiments/experiment-4-strand-v2.d.ts")).toBe(true);
  });

  it("does NOT match regular .ts files", () => {
    expect(isNoiseFile("src/scanner/index.ts")).toBe(false);
  });

  it("does NOT match .tsx files", () => {
    expect(isNoiseFile("src/components/Button.tsx")).toBe(false);
  });

  it("does NOT match files with 'generated' in directory name", () => {
    expect(isNoiseFile("src/generated/utils.ts")).toBe(false);
  });

  it("does NOT match files with 'declarations' in name", () => {
    expect(isNoiseFile("src/lib/declarations.ts")).toBe(false);
  });
});

describe("dead code filtering of noise files", () => {
  it("excludes .generated.ts and .d.ts from dead code list", () => {
    const graph = {
      projectName: "test",
      projectType: "app",
      framework: "typescript",
      totalFiles: 4,
      totalLines: 400,
      modules: [],
      nodes: [
        {
          id: "src/lib/utils.ts",
          path: "src/lib/utils.ts",
          type: "utility",
          name: "utils.ts",
          lines: 100,
          imports: [],
          exports: ["helper"],
          complexity: 0.5,
        },
        {
          id: "src/types/global.d.ts",
          path: "src/types/global.d.ts",
          type: "utility",
          name: "global.d.ts",
          lines: 50,
          imports: [],
          exports: [],
          complexity: 0.1,
        },
        {
          id: "src/components/Icons.generated.tsx",
          path: "src/components/Icons.generated.tsx",
          type: "component",
          name: "Icons.generated.tsx",
          lines: 200,
          imports: [],
          exports: ["IconSet"],
          complexity: 0.3,
        },
        {
          id: "src/app/page.tsx",
          path: "src/app/page.tsx",
          type: "route",
          name: "page.tsx",
          lines: 50,
          imports: ["src/lib/utils.ts"],
          exports: ["default"],
          complexity: 0.2,
        },
      ],
      edges: [
        { from: "src/app/page.tsx", to: "src/lib/utils.ts", type: "imports", weight: 1 },
      ],
    };

    const analysis = analyzeGraph(graph as any);

    // utils.ts is imported by page.tsx — NOT dead code
    expect(analysis.deadCode).not.toContain("src/lib/utils.ts");
    // page.tsx is a route — excluded by SKIP_TYPES
    expect(analysis.deadCode).not.toContain("src/app/page.tsx");
    // .d.ts should be filtered by isNoiseFile
    expect(analysis.deadCode).not.toContain("src/types/global.d.ts");
    // .generated.tsx should be filtered by isNoiseFile
    expect(analysis.deadCode).not.toContain("src/components/Icons.generated.tsx");
  });
});
