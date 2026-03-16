// src/query/__tests__/blast-radius.test.ts
import { describe, it, expect } from "vitest";
import { queryBlastRadius, formatBlastRadius } from "../blast-radius.js";
import { createTestCache } from "./fixture.js";

describe("queryBlastRadius", () => {
  const cache = createTestCache();

  it("returns blast radius for a file in the pre-computed risk array", () => {
    const result = queryBlastRadius("src/lib/utils.ts", cache);
    expect(result.file).toBe("src/lib/utils.ts");
    expect(result.directImporters).toBe(1);
    expect(result.affectedCount).toBe(3);
    expect(result.amplificationRatio).toBe(3.0);
    expect(result.cascadeDepth).toBe(3);
    expect(result.modulesAffected).toBe(2);
  });

  it("returns cascade path from source to deepest node", () => {
    const result = queryBlastRadius("src/lib/utils.ts", cache);
    expect(result.cascadePath.length).toBeGreaterThan(0);
    // cascade: service.ts(d1) → controller.ts(d2) → app.ts(d3)
    expect(result.cascadePath).toEqual([
      "src/services/service.ts",
      "src/controllers/controller.ts",
      "src/controllers/app.ts",
    ]);
  });

  it("returns affected module names", () => {
    const result = queryBlastRadius("src/lib/utils.ts", cache);
    expect(result.affectedModules).toContain("src/services");
    expect(result.affectedModules).toContain("src/controllers");
  });

  it("returns zero impact for leaf file not in risk array", () => {
    const result = queryBlastRadius("src/controllers/app.ts", cache);
    expect(result.affectedCount).toBe(0);
    expect(result.cascadePath).toEqual([]);
    expect(result.cascadeDepth).toBe(0);
  });
});

describe("formatBlastRadius", () => {
  const cache = createTestCache();

  it("formats strand notation with cascade line", () => {
    const result = queryBlastRadius("src/lib/utils.ts", cache);
    const output = formatBlastRadius(result, false);
    expect(output).toContain("src/lib/utils.ts");
    expect(output).toContain("×1→3");
    expect(output).toContain("d3");
    expect(output).toContain("amp3");
    expect(output).toContain("2mod");
    expect(output).toContain("affected modules: src/controllers, src/services");
    expect(output).toContain("cascade:");
  });

  it("formats valid JSON with --json flag", () => {
    const result = queryBlastRadius("src/lib/utils.ts", cache);
    const output = formatBlastRadius(result, true);
    const parsed = JSON.parse(output);
    expect(parsed.file).toBe("src/lib/utils.ts");
    expect(parsed.affectedCount).toBe(3);
    expect(parsed.cascadePath).toBeInstanceOf(Array);
  });

  it("omits cascade line when no impact", () => {
    const result = queryBlastRadius("src/controllers/app.ts", cache);
    const output = formatBlastRadius(result, false);
    expect(output).not.toContain("cascade:");
  });
});
