import { describe, it, expect } from "vitest";
import { isNoiseFile } from "../index.js";

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
