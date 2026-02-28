/**
 * Strand Scanner — reads a codebase and builds a structural graph
 *
 * Extracts: modules, files, imports, exports, routes, components,
 * framework conventions, and complexity metrics.
 */

import * as fs from "fs";
import * as path from "path";

export interface StrandNode {
  id: string;
  path: string;
  type:
    | "module"
    | "file"
    | "route"
    | "api-route"
    | "component"
    | "layout"
    | "middleware"
    | "schema"
    | "test"
    | "config"
    | "utility";
  name: string;
  lines: number;
  imports: string[]; // IDs of nodes this imports from
  exports: string[]; // exported symbol names
  framework?: {
    type: string; // "nextjs-page", "nextjs-api", "react-component", "prisma-schema", etc.
    metadata: Record<string, unknown>;
  };
  complexity: number; // 0-1 normalized
  children?: string[]; // child node IDs (for modules)
}

export interface StrandEdge {
  from: string;
  to: string;
  type: "imports" | "renders" | "calls" | "tests" | "extends";
  weight: number; // 0-1, how strong the coupling is
}

export interface StrandGraph {
  projectName: string;
  projectType: string;
  framework: string;
  totalFiles: number;
  totalLines: number;
  nodes: StrandNode[];
  edges: StrandEdge[];
  modules: ModuleBoundary[];
}

export interface ModuleBoundary {
  id: string;
  name: string;
  path: string;
  nodeCount: number;
  totalLines: number;
  entryPoints: string[]; // node IDs that are accessed from outside
}

const IGNORE_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  ".claude",
  ".worktrees",
  ".vercel",
  "coverage",
  "__pycache__",
]);

const IGNORE_FILES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  ".DS_Store",
  "thumbs.db",
]);

export function scanCodebase(rootDir: string): StrandGraph {
  const nodes: StrandNode[] = [];
  const edges: StrandEdge[] = [];

  // Detect framework
  const framework = detectFramework(rootDir);
  const projectName = path.basename(rootDir);

  // Walk the file tree
  walkDir(rootDir, rootDir, nodes, framework);

  // Resolve imports into edges
  resolveEdges(nodes, edges, rootDir);

  // Detect module boundaries
  const modules = detectModules(nodes, rootDir);

  // Calculate complexity
  calculateComplexity(nodes);

  return {
    projectName,
    projectType: framework.type,
    framework: framework.name,
    totalFiles: nodes.filter((n) => n.type !== "module").length,
    totalLines: nodes.reduce((sum, n) => sum + n.lines, 0),
    nodes,
    edges,
    modules,
  };
}

interface FrameworkInfo {
  name: string;
  type: string;
  srcDir: string;
}

function detectFramework(rootDir: string): FrameworkInfo {
  const packageJsonPath = path.join(rootDir, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    return { name: "unknown", type: "unknown", srcDir: "" };
  }

  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
  const deps = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
  };

  if (deps["next"]) {
    const srcDir = fs.existsSync(path.join(rootDir, "src")) ? "src" : "";
    return { name: "nextjs", type: "Next.js", srcDir };
  }
  if (deps["express"]) return { name: "express", type: "Express", srcDir: "" };
  if (deps["react"]) return { name: "react", type: "React", srcDir: "src" };
  if (deps["vue"]) return { name: "vue", type: "Vue", srcDir: "src" };
  if (deps["svelte"])
    return { name: "svelte", type: "SvelteKit", srcDir: "src" };

  return { name: "typescript", type: "TypeScript", srcDir: "src" };
}

function walkDir(
  dir: string,
  rootDir: string,
  nodes: StrandNode[],
  framework: FrameworkInfo,
): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    if (IGNORE_FILES.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(rootDir, fullPath).replace(/\\/g, "/");

    if (entry.isDirectory()) {
      walkDir(fullPath, rootDir, nodes, framework);
    } else if (isSourceFile(entry.name)) {
      const content = fs.readFileSync(fullPath, "utf-8");
      const lines = content.split("\n").length;
      const imports = extractImports(content);
      const exports = extractExports(content);
      const type = classifyFile(relativePath, content, framework);

      const node: StrandNode = {
        id: relativePath,
        path: relativePath,
        type,
        name: entry.name,
        lines,
        imports,
        exports,
        complexity: 0,
      };

      // Add framework metadata
      const fwMeta = extractFrameworkMetadata(relativePath, content, framework);
      if (fwMeta) {
        node.framework = fwMeta;
      }

      nodes.push(node);
    }
  }
}

function isSourceFile(name: string): boolean {
  return /\.(ts|tsx|js|jsx|mjs|cjs|py|rs|go|java|rb|prisma)$/.test(name);
}

function classifyFile(
  relativePath: string,
  content: string,
  framework: FrameworkInfo,
): StrandNode["type"] {
  const normalized = relativePath.replace(/\\/g, "/");

  // Test files
  if (
    /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(normalized) ||
    normalized.includes("__tests__/")
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

function extractImports(content: string): string[] {
  const imports: string[] = [];
  const importRegex =
    /(?:import\s+.*?from\s+['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\))/g;
  let match;

  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1] || match[2];
    if (importPath && !importPath.startsWith("node_modules")) {
      imports.push(importPath);
    }
  }

  return imports;
}

function extractExports(content: string): string[] {
  const exports: string[] = [];
  const exportRegex =
    /export\s+(?:default\s+)?(?:function|const|class|type|interface|enum)\s+(\w+)/g;
  let match;

  while ((match = exportRegex.exec(content)) !== null) {
    if (match[1]) exports.push(match[1]);
  }

  return exports;
}

function extractFrameworkMetadata(
  relativePath: string,
  content: string,
  framework: FrameworkInfo,
): StrandNode["framework"] | null {
  if (framework.name === "nextjs") {
    // API routes — extract HTTP methods
    if (/\/api\/.*route\.(ts|js)$/.test(relativePath)) {
      const methods: string[] = [];
      if (/export\s+(?:async\s+)?function\s+GET/.test(content))
        methods.push("GET");
      if (/export\s+(?:async\s+)?function\s+POST/.test(content))
        methods.push("POST");
      if (/export\s+(?:async\s+)?function\s+PUT/.test(content))
        methods.push("PUT");
      if (/export\s+(?:async\s+)?function\s+PATCH/.test(content))
        methods.push("PATCH");
      if (/export\s+(?:async\s+)?function\s+DELETE/.test(content))
        methods.push("DELETE");

      // Extract route path from file path
      const routePath = relativePath
        .replace(/^src\/app/, "")
        .replace(/\/route\.(ts|js)$/, "")
        .replace(/\\/g, "/");

      return {
        type: "nextjs-api",
        metadata: { methods, routePath },
      };
    }

    // Pages — extract route
    if (/\/page\.(tsx|jsx|ts|js)$/.test(relativePath)) {
      const routePath = relativePath
        .replace(/^src\/app/, "")
        .replace(/\/page\.(tsx|jsx|ts|js)$/, "")
        .replace(/\\/g, "/");

      const isClientComponent =
        content.includes("'use client'") || content.includes('"use client"');

      return {
        type: "nextjs-page",
        metadata: {
          routePath: routePath || "/",
          isClientComponent,
        },
      };
    }

    // Layouts
    if (/\/layout\.(tsx|jsx|ts|js)$/.test(relativePath)) {
      return {
        type: "nextjs-layout",
        metadata: {
          isRootLayout: relativePath.includes("app/layout"),
        },
      };
    }

    // Client components
    if (content.includes("'use client'") || content.includes('"use client"')) {
      return {
        type: "react-client-component",
        metadata: {},
      };
    }
  }

  // Prisma schema
  if (relativePath.endsWith(".prisma")) {
    const models: string[] = [];
    const modelRegex = /model\s+(\w+)\s*\{/g;
    let match;
    while ((match = modelRegex.exec(content)) !== null) {
      if (match[1]) models.push(match[1]);
    }
    return {
      type: "prisma-schema",
      metadata: { models },
    };
  }

  return null;
}

function resolveEdges(
  nodes: StrandNode[],
  edges: StrandEdge[],
  rootDir: string,
): void {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const pathAliases = detectPathAliases(rootDir);

  for (const node of nodes) {
    for (const importPath of node.imports) {
      const resolvedId = resolveImportPath(importPath, node.path, pathAliases);
      if (resolvedId) {
        // Find the actual node (try with various extensions)
        const target = findNodeByImport(resolvedId, nodeMap);
        if (target) {
          const edgeType = node.type === "test" ? "tests" : "imports";
          edges.push({
            from: node.id,
            to: target.id,
            type: edgeType,
            weight: 1,
          });
        }
      }
    }
  }
}

function detectPathAliases(rootDir: string): Map<string, string> {
  const aliases = new Map<string, string>();
  const tsconfigPath = path.join(rootDir, "tsconfig.json");

  if (fs.existsSync(tsconfigPath)) {
    try {
      // Simple JSON parse — doesn't handle comments, but works for most cases
      const content = fs
        .readFileSync(tsconfigPath, "utf-8")
        .replace(/\/\/.*$/gm, "")
        .replace(/\/\*[\s\S]*?\*\//g, "");
      const tsconfig = JSON.parse(content);
      const paths = tsconfig.compilerOptions?.paths || {};

      for (const [alias, targets] of Object.entries(paths)) {
        const cleanAlias = alias.replace("/*", "");
        const target = (targets as string[])[0]?.replace("/*", "") || "";
        aliases.set(cleanAlias, target);
      }
    } catch {
      // tsconfig parsing failed — skip aliases
    }
  }

  return aliases;
}

function resolveImportPath(
  importPath: string,
  fromPath: string,
  aliases: Map<string, string>,
): string | null {
  // Skip node_modules imports
  if (
    !importPath.startsWith(".") &&
    !importPath.startsWith("@/") &&
    !importPath.startsWith("~/")
  ) {
    // Check if it matches a path alias
    for (const [alias, target] of aliases) {
      if (importPath.startsWith(alias)) {
        return importPath.replace(alias, target);
      }
    }
    return null; // external package
  }

  // Resolve relative imports
  if (importPath.startsWith(".")) {
    const fromDir = path.dirname(fromPath);
    return path.posix.join(fromDir, importPath);
  }

  // Resolve alias imports
  for (const [alias, target] of aliases) {
    if (importPath.startsWith(alias)) {
      return importPath.replace(alias, target);
    }
  }

  return importPath;
}

function findNodeByImport(
  resolvedPath: string,
  nodeMap: Map<string, StrandNode>,
): StrandNode | null {
  // Try exact match first
  if (nodeMap.has(resolvedPath)) return nodeMap.get(resolvedPath)!;

  // Try with extensions
  const extensions = [
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    "/index.ts",
    "/index.tsx",
    "/index.js",
  ];
  for (const ext of extensions) {
    const withExt = resolvedPath + ext;
    if (nodeMap.has(withExt)) return nodeMap.get(withExt)!;
  }

  return null;
}

function detectModules(nodes: StrandNode[], rootDir: string): ModuleBoundary[] {
  const modules: ModuleBoundary[] = [];

  // Group files by top-level directories
  const dirGroups = new Map<string, StrandNode[]>();
  for (const node of nodes) {
    const parts = node.path.split("/");
    // Use first 2 levels for grouping (e.g., "src/lib", "src/components", "src/app")
    const moduleKey = parts.length > 2 ? parts.slice(0, 2).join("/") : parts[0];
    if (!dirGroups.has(moduleKey)) {
      dirGroups.set(moduleKey, []);
    }
    dirGroups.get(moduleKey)!.push(node);
  }

  for (const [dirPath, groupNodes] of dirGroups) {
    // Find entry points — nodes imported by files outside this module
    const entryPoints = groupNodes
      .filter((n) =>
        nodes.some(
          (other) =>
            !other.path.startsWith(dirPath) &&
            other.imports.some((imp) =>
              imp.includes(n.path.replace(/\.(ts|tsx|js|jsx)$/, "")),
            ),
        ),
      )
      .map((n) => n.id);

    modules.push({
      id: dirPath,
      name: path.basename(dirPath),
      path: dirPath,
      nodeCount: groupNodes.length,
      totalLines: groupNodes.reduce((sum, n) => sum + n.lines, 0),
      entryPoints,
    });
  }

  return modules;
}

function calculateComplexity(nodes: StrandNode[]): void {
  if (nodes.length === 0) return;

  const maxLines = Math.max(...nodes.map((n) => n.lines));
  const maxImports = Math.max(...nodes.map((n) => n.imports.length));

  for (const node of nodes) {
    // Simple complexity: weighted combination of lines and import count
    const lineScore = maxLines > 0 ? node.lines / maxLines : 0;
    const importScore = maxImports > 0 ? node.imports.length / maxImports : 0;
    node.complexity = lineScore * 0.6 + importScore * 0.4;
  }
}
