import { describe, it, expect } from "vitest";
import { generateHookShim, SHIM_VERSION_HEADER } from "../shim.js";

describe("generateHookShim", () => {
  it("includes version header", () => {
    const shim = generateHookShim("1.0.0");
    expect(shim).toContain("strnd v1.0.0");
  });

  it("uses LF line endings only", () => {
    const shim = generateHookShim("1.0.0");
    expect(shim).not.toContain("\r");
  });

  it("includes lockfile mechanism", () => {
    const shim = generateHookShim("1.0.0");
    expect(shim).toContain(".strnd/.lock");
    expect(shim).toContain("wx");
  });

  it("calls strnd generate --silent", () => {
    const shim = generateHookShim("1.0.0");
    expect(shim).toContain("generate");
    expect(shim).toContain("--silent");
  });

  it("includes shebang", () => {
    const shim = generateHookShim("1.0.0");
    expect(shim.startsWith("#!/usr/bin/env node\n")).toBe(true);
  });

  it("cleans up lockfile in finally block", () => {
    const shim = generateHookShim("1.0.0");
    expect(shim).toContain("finally");
    expect(shim).toContain("unlinkSync");
  });

  it("includes stale lockfile cleanup (5 min threshold)", () => {
    const shim = generateHookShim("1.0.0");
    expect(shim).toContain("statSync");
    expect(shim).toContain("300000");
  });
});
