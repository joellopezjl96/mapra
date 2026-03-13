import { describe, it, expect, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { scanCodebase } from "../index.js";

function makeTmp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `strand-ws-int-${prefix}-`));
}

function writeFile(root: string, filePath: string, content: string): void {
  const full = path.join(root, filePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function writeJson(root: string, filePath: string, data: unknown): void {
  writeFile(root, filePath, JSON.stringify(data, null, 2));
}

describe("workspace integration — scanCodebase with monorepo", () => {
  const tmps: string[] = [];

  function tmp(prefix: string): string {
    const dir = makeTmp(prefix);
    tmps.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const t of tmps) fs.rmSync(t, { recursive: true, force: true });
    tmps.length = 0;
  });

  it("creates edges between workspace packages via alias imports", () => {
    const root = tmp("edges");

    // Root package.json with workspaces
    writeJson(root, "package.json", {
      name: "monorepo",
      workspaces: ["packages/*"],
    });

    // Package A: imports from package B via workspace alias
    writeJson(root, "packages/app/package.json", {
      name: "@mono/app",
    });
    writeFile(
      root,
      "packages/app/index.ts",
      'import { greet } from "@mono/lib/greet";\nconsole.log(greet());\n',
    );

    // Package B: provides the greet function
    writeJson(root, "packages/lib/package.json", {
      name: "@mono/lib",
    });
    writeFile(
      root,
      "packages/lib/greet.ts",
      'export function greet() { return "hello"; }\n',
    );

    const graph = scanCodebase(root);

    // Should have an edge from packages/app/index.ts → packages/lib/greet.ts
    const crossEdge = graph.edges.find(
      (e) =>
        e.from === "packages/app/index.ts" && e.to === "packages/lib/greet.ts",
    );
    expect(crossEdge).toBeDefined();
    expect(crossEdge!.type).toBe("imports");
  });

  it("resolves bare workspace imports to entry point", () => {
    const root = tmp("bare");

    writeJson(root, "package.json", {
      name: "monorepo",
      workspaces: ["packages/*"],
    });

    writeJson(root, "packages/app/package.json", { name: "@mono/app" });
    writeFile(
      root,
      "packages/app/index.ts",
      'import { utils } from "@mono/lib";\n',
    );

    writeJson(root, "packages/lib/package.json", {
      name: "@mono/lib",
      main: "./src/index.ts",
    });
    writeFile(
      root,
      "packages/lib/src/index.ts",
      'export const utils = {};\n',
    );

    const graph = scanCodebase(root);

    const edge = graph.edges.find(
      (e) =>
        e.from === "packages/app/index.ts" &&
        e.to === "packages/lib/src/index.ts",
    );
    expect(edge).toBeDefined();
  });

  it("uses src/ fallback when direct subpath has no matching file", () => {
    const root = tmp("src-fallback");

    writeJson(root, "package.json", {
      name: "monorepo",
      workspaces: ["packages/*"],
    });

    writeJson(root, "packages/app/package.json", { name: "@mono/app" });
    writeFile(
      root,
      "packages/app/index.ts",
      'import { mock } from "@mono/testing/lib/mock";\n',
    );

    // The file lives at src/lib/mock.ts, not lib/mock.ts
    writeJson(root, "packages/testing/package.json", { name: "@mono/testing" });
    writeFile(
      root,
      "packages/testing/src/lib/mock.ts",
      'export function mock() { return {}; }\n',
    );

    const graph = scanCodebase(root);

    const edge = graph.edges.find(
      (e) =>
        e.from === "packages/app/index.ts" &&
        e.to === "packages/testing/src/lib/mock.ts",
    );
    expect(edge).toBeDefined();
  });

  it("does not create edges for non-monorepo projects (zero perf cost)", () => {
    const root = tmp("non-mono");

    writeJson(root, "package.json", {
      name: "simple-project",
      dependencies: { lodash: "4.0.0" },
    });
    writeFile(
      root,
      "src/index.ts",
      'import { chunk } from "lodash";\nexport const x = chunk;\n',
    );

    const graph = scanCodebase(root);

    // No edges — lodash is external, not a workspace package
    expect(graph.edges.length).toBe(0);
  });
});
