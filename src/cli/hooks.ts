import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";

export const STRND_HOOK_START = "# --- strnd auto-update (do not edit) ---";
export const STRND_HOOK_END = "# --- end strnd ---";

const HOOK_TYPES = ["post-commit", "post-merge", "post-checkout"] as const;
type HookType = (typeof HOOK_TYPES)[number];

export function generateTrampoline(hookType: HookType): string {
  const lines = ["#!/bin/sh", STRND_HOOK_START];

  if (hookType === "post-checkout") {
    // $3=1 means branch switch; $3=0 means file checkout — skip file checkouts
    lines.push(
      '[ "$3" = "1" ] && [ -f .strnd/hook.mjs ] && node .strnd/hook.mjs &',
    );
  } else {
    lines.push("[ -f .strnd/hook.mjs ] && node .strnd/hook.mjs &");
  }

  lines.push(STRND_HOOK_END, "");
  return lines.join("\n");
}

export function installHook(hooksDir: string, hookType: HookType): void {
  const hookPath = path.join(hooksDir, hookType);
  const block = generateTrampoline(hookType);

  if (fs.existsSync(hookPath)) {
    const existing = fs.readFileSync(hookPath, "utf-8");

    // Already installed — skip
    if (existing.includes(STRND_HOOK_START)) return;

    // Append to existing hook
    const separator = existing.endsWith("\n") ? "" : "\n";
    const content = existing + separator + block;
    fs.writeFileSync(hookPath, content.replace(/\r\n/g, "\n"));
  } else {
    fs.writeFileSync(hookPath, block.replace(/\r\n/g, "\n"));
  }

  // Set executable bit (no-op on Windows, needed on Unix)
  try {
    fs.chmodSync(hookPath, 0o755);
  } catch {
    /* ignore on systems that don't support chmod */
  }
}

export function uninstallHook(hooksDir: string, hookType: HookType): void {
  const hookPath = path.join(hooksDir, hookType);
  if (!fs.existsSync(hookPath)) return;

  const content = fs.readFileSync(hookPath, "utf-8");
  if (!content.includes(STRND_HOOK_START)) return;

  // Remove the strnd block (including markers)
  const startIdx = content.indexOf(STRND_HOOK_START);
  const endIdx = content.indexOf(STRND_HOOK_END);
  if (startIdx === -1 || endIdx === -1) return;

  const before = content.slice(0, startIdx);
  const after = content.slice(endIdx + STRND_HOOK_END.length + 1); // +1 for trailing \n

  const remaining = (before + after).trim();

  if (!remaining || remaining === "#!/bin/sh") {
    fs.unlinkSync(hookPath);
  } else {
    fs.writeFileSync(hookPath, remaining + "\n");
  }
}

/**
 * Resolve the hooks directory: checks core.hooksPath first, falls back to .git/hooks.
 */
export function getHooksDir(targetPath: string): string | null {
  const gitDir = path.join(targetPath, ".git");
  if (!fs.existsSync(gitDir)) return null;

  // Check core.hooksPath
  try {
    const customPath = execFileSync("git", ["config", "core.hooksPath"], {
      cwd: targetPath,
      encoding: "utf-8",
      timeout: 5000,
    }).trim();

    if (customPath) {
      const resolved = path.isAbsolute(customPath)
        ? customPath
        : path.join(targetPath, customPath);
      return resolved;
    }
  } catch {
    // core.hooksPath not set — use default
  }

  return path.join(gitDir, "hooks");
}

/**
 * Install all three strnd hook trampolines.
 */
export function installAllHooks(targetPath: string): { installed: string[]; skipped: string | null } {
  const hooksDir = getHooksDir(targetPath);

  if (!hooksDir) {
    return { installed: [], skipped: "No .git directory found" };
  }

  fs.mkdirSync(hooksDir, { recursive: true });

  const installed: string[] = [];
  for (const hookType of HOOK_TYPES) {
    installHook(hooksDir, hookType);
    installed.push(hookType);
  }

  return { installed, skipped: null };
}

/**
 * Uninstall all strnd hook trampolines.
 */
export function uninstallAllHooks(targetPath: string): void {
  const hooksDir = getHooksDir(targetPath);
  if (!hooksDir) return;

  for (const hookType of HOOK_TYPES) {
    uninstallHook(hooksDir, hookType);
  }
}
