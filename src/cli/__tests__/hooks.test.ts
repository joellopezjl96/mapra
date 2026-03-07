import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  generateTrampoline,
  STRND_HOOK_START,
  STRND_HOOK_END,
  installHook,
  uninstallHook,
} from "../hooks.js";

describe("generateTrampoline", () => {
  it("post-commit trampoline runs hook.mjs in background", () => {
    const content = generateTrampoline("post-commit");
    expect(content).toContain("#!/bin/sh");
    expect(content).toContain(".strnd/hook.mjs");
    expect(content).toContain("&");
    expect(content).not.toContain("$3");
  });

  it("post-checkout trampoline filters by branch switch ($3=1)", () => {
    const content = generateTrampoline("post-checkout");
    expect(content).toContain('[ "$3" = "1" ]');
    expect(content).toContain(".strnd/hook.mjs");
  });

  it("all trampolines use LF line endings (no CRLF)", () => {
    for (const hook of ["post-commit", "post-merge", "post-checkout"] as const) {
      const content = generateTrampoline(hook);
      expect(content).not.toContain("\r");
    }
  });
});

describe("installHook", () => {
  const tmpDir = path.join(__dirname, "__fixtures__", "hooks-test");
  const hooksDir = path.join(tmpDir, ".git", "hooks");

  beforeEach(() => {
    fs.mkdirSync(hooksDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates hook file when none exists", () => {
    installHook(hooksDir, "post-commit");
    const content = fs.readFileSync(path.join(hooksDir, "post-commit"), "utf-8");
    expect(content).toContain(STRND_HOOK_START);
    expect(content).toContain(STRND_HOOK_END);
    expect(content).toContain(".strnd/hook.mjs");
  });

  it("appends to existing hook file", () => {
    const existing = "#!/bin/sh\necho 'existing hook'\n";
    fs.writeFileSync(path.join(hooksDir, "post-commit"), existing);
    installHook(hooksDir, "post-commit");
    const content = fs.readFileSync(path.join(hooksDir, "post-commit"), "utf-8");
    expect(content).toContain("existing hook");
    expect(content).toContain(STRND_HOOK_START);
  });

  it("is idempotent — does not duplicate on second install", () => {
    installHook(hooksDir, "post-commit");
    installHook(hooksDir, "post-commit");
    const content = fs.readFileSync(path.join(hooksDir, "post-commit"), "utf-8");
    const count = content.split(STRND_HOOK_START).length - 1;
    expect(count).toBe(1);
  });
});

describe("uninstallHook", () => {
  const tmpDir = path.join(__dirname, "__fixtures__", "unhook-test");
  const hooksDir = path.join(tmpDir, ".git", "hooks");

  beforeEach(() => {
    fs.mkdirSync(hooksDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("removes strnd block from hook file, preserving other content", () => {
    const existing = "#!/bin/sh\necho 'keep me'\n";
    fs.writeFileSync(path.join(hooksDir, "post-commit"), existing);
    installHook(hooksDir, "post-commit");
    uninstallHook(hooksDir, "post-commit");
    const content = fs.readFileSync(path.join(hooksDir, "post-commit"), "utf-8");
    expect(content).toContain("keep me");
    expect(content).not.toContain(STRND_HOOK_START);
  });

  it("deletes hook file if strnd was the only content", () => {
    installHook(hooksDir, "post-commit");
    uninstallHook(hooksDir, "post-commit");
    expect(fs.existsSync(path.join(hooksDir, "post-commit"))).toBe(false);
  });
});
