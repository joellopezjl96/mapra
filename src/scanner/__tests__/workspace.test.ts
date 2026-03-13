import { describe, it, expect, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { detectWorkspaceAliases, resolveWorkspaceImport, type WorkspaceContext } from "../workspace.js";

function makeTmp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `strand-ws-${prefix}-`));
}

function writeJson(dir: string, file: string, data: unknown): void {
  fs.writeFileSync(path.join(dir, file), JSON.stringify(data, null, 2));
}

describe("detectWorkspaceAliases", () => {
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

  // --- npm/yarn discovery ---

  it("discovers npm workspaces with array format", () => {
    const root = tmp("npm");
    writeJson(root, "package.json", {
      name: "monorepo",
      workspaces: ["packages/*"],
    });
    fs.mkdirSync(path.join(root, "packages", "ui"), { recursive: true });
    writeJson(path.join(root, "packages", "ui"), "package.json", {
      name: "@mono/ui",
      main: "src/index.ts",
    });
    fs.mkdirSync(path.join(root, "packages", "lib"), { recursive: true });
    writeJson(path.join(root, "packages", "lib"), "package.json", {
      name: "@mono/lib",
    });

    const ctx = detectWorkspaceAliases(root);

    expect(ctx.packages.size).toBe(2);
    expect(ctx.packages.get("@mono/ui")?.dir).toBe("packages/ui");
    expect(ctx.packages.get("@mono/ui")?.entryPoint).toBe("src/index.ts");
    expect(ctx.packages.get("@mono/lib")?.dir).toBe("packages/lib");
    expect(ctx.packages.get("@mono/lib")?.entryPoint).toBeUndefined();
    expect(ctx.rootOffset).toBe("");
  });

  it("discovers yarn classic workspaces with object format", () => {
    const root = tmp("yarn");
    writeJson(root, "package.json", {
      name: "monorepo",
      workspaces: { packages: ["packages/*"] },
    });
    fs.mkdirSync(path.join(root, "packages", "core"), { recursive: true });
    writeJson(path.join(root, "packages", "core"), "package.json", {
      name: "@mono/core",
    });

    const ctx = detectWorkspaceAliases(root);

    expect(ctx.packages.size).toBe(1);
    expect(ctx.packages.get("@mono/core")?.dir).toBe("packages/core");
  });

  it("discovers pnpm workspaces from pnpm-workspace.yaml", () => {
    const root = tmp("pnpm");
    writeJson(root, "package.json", { name: "monorepo" });
    fs.writeFileSync(
      path.join(root, "pnpm-workspace.yaml"),
      "packages:\n  - 'packages/*'\n  - 'apps/*'\n",
    );
    fs.mkdirSync(path.join(root, "packages", "shared"), { recursive: true });
    writeJson(path.join(root, "packages", "shared"), "package.json", {
      name: "@mono/shared",
    });
    fs.mkdirSync(path.join(root, "apps", "web"), { recursive: true });
    writeJson(path.join(root, "apps", "web"), "package.json", {
      name: "@mono/web",
    });

    const ctx = detectWorkspaceAliases(root);

    expect(ctx.packages.size).toBe(2);
    expect(ctx.packages.get("@mono/shared")?.dir).toBe("packages/shared");
    expect(ctx.packages.get("@mono/web")?.dir).toBe("apps/web");
  });

  it("pnpm parser strips inline comments", () => {
    const root = tmp("pnpm-comments");
    writeJson(root, "package.json", { name: "monorepo" });
    fs.writeFileSync(
      path.join(root, "pnpm-workspace.yaml"),
      "packages:\n  - 'packages/*' # main packages\n",
    );
    fs.mkdirSync(path.join(root, "packages", "a"), { recursive: true });
    writeJson(path.join(root, "packages", "a"), "package.json", {
      name: "@mono/a",
    });

    const ctx = detectWorkspaceAliases(root);

    expect(ctx.packages.size).toBe(1);
    expect(ctx.packages.get("@mono/a")?.dir).toBe("packages/a");
  });

  it("returns empty context when no workspace config found", () => {
    const root = tmp("none");
    writeJson(root, "package.json", { name: "plain-project" });

    const ctx = detectWorkspaceAliases(root);

    expect(ctx.packages.size).toBe(0);
    expect(ctx.rootOffset).toBe("");
  });

  // --- Walk-up ---

  it("walks up to find monorepo root from nested scan root", () => {
    const root = tmp("walkup");
    writeJson(root, "package.json", {
      name: "monorepo",
      workspaces: ["packages/*"],
    });
    fs.mkdirSync(path.join(root, "packages", "app"), { recursive: true });
    writeJson(path.join(root, "packages", "app"), "package.json", {
      name: "@mono/app",
    });

    const ctx = detectWorkspaceAliases(path.join(root, "packages", "app"));

    expect(ctx.packages.size).toBe(1);
    expect(ctx.rootOffset).toBe("packages/app");
  });

  it("stops walk-up at .git boundary", () => {
    const root = tmp("git");
    // Outer monorepo with workspaces — should NOT be found
    writeJson(root, "package.json", {
      name: "outer",
      workspaces: ["inner/packages/*"],
    });
    // Inner repo with .git — walk-up stops here
    const inner = path.join(root, "inner");
    fs.mkdirSync(path.join(inner, ".git"), { recursive: true });
    writeJson(inner, "package.json", { name: "inner-project" });

    const ctx = detectWorkspaceAliases(inner);

    expect(ctx.packages.size).toBe(0);
  });

  it("stops walk-up at max depth (5 levels)", () => {
    const root = tmp("depth");
    writeJson(root, "package.json", {
      name: "monorepo",
      workspaces: ["packages/*"],
    });
    // 6 levels deep — exceeds max 5
    const deep = path.join(root, "a", "b", "c", "d", "e", "f");
    fs.mkdirSync(deep, { recursive: true });

    const ctx = detectWorkspaceAliases(deep);

    expect(ctx.packages.size).toBe(0);
  });

  it("finds workspace at exactly 5 levels up", () => {
    const root = tmp("depth5");
    writeJson(root, "package.json", {
      name: "monorepo",
      workspaces: ["packages/*"],
    });
    fs.mkdirSync(path.join(root, "packages", "x"), { recursive: true });
    writeJson(path.join(root, "packages", "x"), "package.json", {
      name: "@mono/x",
    });
    // 5 levels deep — exactly at max
    const deep = path.join(root, "a", "b", "c", "d", "e");
    fs.mkdirSync(deep, { recursive: true });

    const ctx = detectWorkspaceAliases(deep);

    expect(ctx.packages.size).toBe(1);
  });

  // --- Glob expansion ---

  it("handles explicit paths (no wildcard)", () => {
    const root = tmp("explicit");
    writeJson(root, "package.json", {
      name: "monorepo",
      workspaces: ["apps/web", "packages/shared"],
    });
    fs.mkdirSync(path.join(root, "apps", "web"), { recursive: true });
    writeJson(path.join(root, "apps", "web"), "package.json", {
      name: "@mono/web",
    });
    fs.mkdirSync(path.join(root, "packages", "shared"), { recursive: true });
    writeJson(path.join(root, "packages", "shared"), "package.json", {
      name: "@mono/shared",
    });

    const ctx = detectWorkspaceAliases(root);

    expect(ctx.packages.size).toBe(2);
    expect(ctx.packages.get("@mono/web")?.dir).toBe("apps/web");
    expect(ctx.packages.get("@mono/shared")?.dir).toBe("packages/shared");
  });

  it("handles recursive wildcards (only dirs with package.json)", () => {
    const root = tmp("recursive");
    writeJson(root, "package.json", {
      name: "monorepo",
      workspaces: ["packages/**"],
    });
    // Has package.json — included
    fs.mkdirSync(path.join(root, "packages", "a", "nested"), { recursive: true });
    writeJson(path.join(root, "packages", "a"), "package.json", {
      name: "@mono/a",
    });
    // Nested also has package.json — also included
    writeJson(path.join(root, "packages", "a", "nested"), "package.json", {
      name: "@mono/a-nested",
    });
    // No package.json — not included
    fs.mkdirSync(path.join(root, "packages", "b"), { recursive: true });

    const ctx = detectWorkspaceAliases(root);

    expect(ctx.packages.size).toBe(2);
    expect(ctx.packages.has("@mono/a")).toBe(true);
    expect(ctx.packages.has("@mono/a-nested")).toBe(true);
  });

  it("applies negation patterns as post-filter", () => {
    const root = tmp("negation");
    writeJson(root, "package.json", {
      name: "monorepo",
      workspaces: ["packages/*", "!packages/internal"],
    });
    fs.mkdirSync(path.join(root, "packages", "public"), { recursive: true });
    writeJson(path.join(root, "packages", "public"), "package.json", {
      name: "@mono/public",
    });
    fs.mkdirSync(path.join(root, "packages", "internal"), { recursive: true });
    writeJson(path.join(root, "packages", "internal"), "package.json", {
      name: "@mono/internal",
    });

    const ctx = detectWorkspaceAliases(root);

    expect(ctx.packages.size).toBe(1);
    expect(ctx.packages.has("@mono/public")).toBe(true);
    expect(ctx.packages.has("@mono/internal")).toBe(false);
  });

  it("skips glob-matched directories without package.json", () => {
    const root = tmp("no-pkg");
    writeJson(root, "package.json", {
      name: "monorepo",
      workspaces: ["packages/*"],
    });
    fs.mkdirSync(path.join(root, "packages", "has-pkg"), { recursive: true });
    writeJson(path.join(root, "packages", "has-pkg"), "package.json", {
      name: "@mono/has-pkg",
    });
    fs.mkdirSync(path.join(root, "packages", "no-pkg"), { recursive: true });

    const ctx = detectWorkspaceAliases(root);

    expect(ctx.packages.size).toBe(1);
    expect(ctx.packages.has("@mono/has-pkg")).toBe(true);
  });

  // --- Entry point extraction ---

  it("extracts entry point from exports['.']", () => {
    const root = tmp("exports-dot");
    writeJson(root, "package.json", {
      name: "monorepo",
      workspaces: ["packages/*"],
    });
    fs.mkdirSync(path.join(root, "packages", "ui"), { recursive: true });
    writeJson(path.join(root, "packages", "ui"), "package.json", {
      name: "@mono/ui",
      exports: { ".": "./src/index.ts" },
    });

    const ctx = detectWorkspaceAliases(root);

    expect(ctx.packages.get("@mono/ui")?.entryPoint).toBe("src/index.ts");
  });

  it("unwraps nested conditional exports (import preferred)", () => {
    const root = tmp("cond-exports");
    writeJson(root, "package.json", {
      name: "monorepo",
      workspaces: ["packages/*"],
    });
    fs.mkdirSync(path.join(root, "packages", "ui"), { recursive: true });
    writeJson(path.join(root, "packages", "ui"), "package.json", {
      name: "@mono/ui",
      exports: {
        ".": {
          types: "./dist/index.d.ts",
          import: { default: "./esm/index.js" },
          require: "./cjs/index.js",
        },
      },
    });

    const ctx = detectWorkspaceAliases(root);

    // Should prefer import → then unwrap to default → "esm/index.js"
    expect(ctx.packages.get("@mono/ui")?.entryPoint).toBe("esm/index.js");
  });

  it("falls back to main when no exports", () => {
    const root = tmp("main-only");
    writeJson(root, "package.json", {
      name: "monorepo",
      workspaces: ["packages/*"],
    });
    fs.mkdirSync(path.join(root, "packages", "lib"), { recursive: true });
    writeJson(path.join(root, "packages", "lib"), "package.json", {
      name: "@mono/lib",
      main: "./dist/index.js",
    });

    const ctx = detectWorkspaceAliases(root);

    expect(ctx.packages.get("@mono/lib")?.entryPoint).toBe("dist/index.js");
  });

  // --- Error handling ---

  it("skips workspace package with missing name", () => {
    const root = tmp("no-name");
    writeJson(root, "package.json", {
      name: "monorepo",
      workspaces: ["packages/*"],
    });
    fs.mkdirSync(path.join(root, "packages", "good"), { recursive: true });
    writeJson(path.join(root, "packages", "good"), "package.json", {
      name: "@mono/good",
    });
    fs.mkdirSync(path.join(root, "packages", "bad"), { recursive: true });
    writeJson(path.join(root, "packages", "bad"), "package.json", {
      version: "1.0.0",
    });

    const ctx = detectWorkspaceAliases(root);

    expect(ctx.packages.size).toBe(1);
    expect(ctx.packages.has("@mono/good")).toBe(true);
  });

  it("keeps first on duplicate workspace name", () => {
    const root = tmp("dup");
    writeJson(root, "package.json", {
      name: "monorepo",
      workspaces: ["packages/*", "libs/*"],
    });
    fs.mkdirSync(path.join(root, "packages", "ui"), { recursive: true });
    writeJson(path.join(root, "packages", "ui"), "package.json", {
      name: "@mono/ui",
    });
    fs.mkdirSync(path.join(root, "libs", "ui-dup"), { recursive: true });
    writeJson(path.join(root, "libs", "ui-dup"), "package.json", {
      name: "@mono/ui",
    });

    const ctx = detectWorkspaceAliases(root);

    expect(ctx.packages.size).toBe(1);
    expect(ctx.packages.get("@mono/ui")?.dir).toBe("packages/ui");
  });

  it("skips workspace with malformed package.json", () => {
    const root = tmp("malformed");
    writeJson(root, "package.json", {
      name: "monorepo",
      workspaces: ["packages/*"],
    });
    fs.mkdirSync(path.join(root, "packages", "good"), { recursive: true });
    writeJson(path.join(root, "packages", "good"), "package.json", {
      name: "@mono/good",
    });
    fs.mkdirSync(path.join(root, "packages", "bad"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "packages", "bad", "package.json"),
      "{invalid json",
    );

    const ctx = detectWorkspaceAliases(root);

    expect(ctx.packages.size).toBe(1);
    expect(ctx.packages.has("@mono/good")).toBe(true);
  });
});

function makeCtx(
  packages: Record<string, { dir: string; entryPoint?: string }>,
  rootOffset = "",
): WorkspaceContext {
  const map = new Map<string, { dir: string; entryPoint?: string }>();
  for (const [name, pkg] of Object.entries(packages)) map.set(name, pkg);
  return { packages: map, rootOffset };
}

describe("resolveWorkspaceImport", () => {
  // --- Basic resolution ---

  it("resolves scoped package with subpath", () => {
    const ctx = makeCtx({ "@scope/lib": { dir: "packages/lib" } });
    const hasNode = () => true;

    expect(resolveWorkspaceImport("@scope/lib/auth", ctx, hasNode)).toBe(
      "packages/lib/auth",
    );
  });

  it("resolves deep nested subpath", () => {
    const ctx = makeCtx({ "@scope/lib": { dir: "packages/lib" } });
    const hasNode = () => true;

    expect(resolveWorkspaceImport("@scope/lib/hooks/useAuth", ctx, hasNode)).toBe(
      "packages/lib/hooks/useAuth",
    );
  });

  it("resolves bare import to entry point", () => {
    const ctx = makeCtx({
      "@scope/ui": { dir: "packages/ui", entryPoint: "src/index.ts" },
    });
    const hasNode = () => true;

    expect(resolveWorkspaceImport("@scope/ui", ctx, hasNode)).toBe(
      "packages/ui/src/index.ts",
    );
  });

  it("resolves bare import with no entry point to index", () => {
    const ctx = makeCtx({ "@scope/lib": { dir: "packages/lib" } });
    const hasNode = () => true;

    expect(resolveWorkspaceImport("@scope/lib", ctx, hasNode)).toBe(
      "packages/lib/index",
    );
  });

  it("returns null for unknown package", () => {
    const ctx = makeCtx({ "@scope/lib": { dir: "packages/lib" } });
    const hasNode = () => true;

    expect(resolveWorkspaceImport("@other/pkg/foo", ctx, hasNode)).toBeNull();
  });

  // --- Boundary safety and longest match ---

  it("does not match package prefix that is a partial name", () => {
    const ctx = makeCtx({
      "@scope/app-store": { dir: "packages/app-store" },
      "@scope/app-store-cli": { dir: "packages/app-store-cli" },
    });
    const hasNode = () => true;

    expect(resolveWorkspaceImport("@scope/app-store-cli/run", ctx, hasNode)).toBe(
      "packages/app-store-cli/run",
    );
  });

  it("uses longest matching package name", () => {
    const ctx = makeCtx({
      "@scope/lib": { dir: "packages/lib" },
      "@scope/lib-extra": { dir: "packages/lib-extra" },
    });
    const hasNode = () => true;

    expect(resolveWorkspaceImport("@scope/lib-extra/utils", ctx, hasNode)).toBe(
      "packages/lib-extra/utils",
    );
  });

  // --- rootOffset adjustment ---

  it("returns path as-is when rootOffset is empty", () => {
    const ctx = makeCtx(
      { "@scope/lib": { dir: "packages/lib" } },
      "",
    );
    const hasNode = () => true;

    expect(resolveWorkspaceImport("@scope/lib/auth", ctx, hasNode)).toBe(
      "packages/lib/auth",
    );
  });

  it("strips rootOffset prefix from resolved path", () => {
    const ctx = makeCtx(
      { "@scope/lib": { dir: "apps/web/lib" } },
      "apps/web",
    );
    const hasNode = () => true;

    expect(resolveWorkspaceImport("@scope/lib/auth", ctx, hasNode)).toBe(
      "lib/auth",
    );
  });

  it("returns null when resolved path is outside scan root", () => {
    const ctx = makeCtx(
      { "@scope/other": { dir: "packages/other" } },
      "apps/web",
    );
    const hasNode = () => true;

    // packages/other/foo does NOT start with "apps/web/"
    expect(resolveWorkspaceImport("@scope/other/foo", ctx, hasNode)).toBeNull();
  });

  // --- src/ fallback ---

  it("falls back to src/ prefix when primary path has no node", () => {
    const ctx = makeCtx({ "@scope/testing": { dir: "packages/testing" } });
    const nodes = new Set(["packages/testing/src/lib/mock"]);
    const hasNode = (id: string) => nodes.has(id);

    // Primary: packages/testing/lib/mock — not in nodes
    // Fallback: packages/testing/src/lib/mock — in nodes
    expect(resolveWorkspaceImport("@scope/testing/lib/mock", ctx, hasNode)).toBe(
      "packages/testing/src/lib/mock",
    );
  });

  it("does not trigger src/ fallback when primary path has a node", () => {
    const ctx = makeCtx({ "@scope/lib": { dir: "packages/lib" } });
    const nodes = new Set(["packages/lib/hooks/useLocale"]);
    const hasNode = (id: string) => nodes.has(id);

    expect(resolveWorkspaceImport("@scope/lib/hooks/useLocale", ctx, hasNode)).toBe(
      "packages/lib/hooks/useLocale",
    );
  });

  it("does not apply src/ fallback to bare imports", () => {
    const ctx = makeCtx({ "@scope/lib": { dir: "packages/lib" } });
    // hasNode returns false for everything — src/ fallback should NOT fire for bare
    const hasNode = () => false;

    expect(resolveWorkspaceImport("@scope/lib", ctx, hasNode)).toBe(
      "packages/lib/index",
    );
  });

  it("returns primary path when neither primary nor src/ fallback has a node", () => {
    const ctx = makeCtx({ "@scope/lib": { dir: "packages/lib" } });
    const hasNode = () => false;

    // Neither packages/lib/foo nor packages/lib/src/foo has a node
    // Should still return primary path (let caller handle)
    expect(resolveWorkspaceImport("@scope/lib/foo", ctx, hasNode)).toBe(
      "packages/lib/foo",
    );
  });
});
