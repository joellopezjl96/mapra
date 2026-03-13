import * as fs from "fs";
import * as path from "path";

export interface WorkspacePackage {
  dir: string;          // relative to monorepo root, forward slashes
  entryPoint?: string;  // e.g., "src/index.ts"
}

export interface WorkspaceContext {
  packages: Map<string, WorkspacePackage>;  // key = package name
  rootOffset: string;   // relative path from monorepo root to scan root
}

function toForwardSlash(p: string): string {
  return p.replace(/\\/g, "/");
}

export function detectWorkspaceAliases(scanRoot: string): WorkspaceContext {
  return { packages: new Map(), rootOffset: "" };
}

export function resolveWorkspaceImport(
  importPath: string,
  ctx: WorkspaceContext,
  hasNode: (id: string) => boolean,
): string | null {
  return null;
}
