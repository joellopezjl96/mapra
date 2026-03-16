// src/query/__tests__/test-map.test.ts
import { describe, it, expect } from "vitest";
import { queryTestMap, formatTestMap } from "../test-map.js";
import { createTestCache } from "./fixture.js";

describe("queryTestMap", () => {
  const cache = createTestCache();

  it("finds direct test for utils.ts", () => {
    const result = queryTestMap("src/lib/utils.ts", cache);
    expect(result.directTests).toContain("src/lib/utils.test.ts");
  });

  it("finds transitive test for utils.ts via controller.ts", () => {
    const result = queryTestMap("src/lib/utils.ts", cache);
    expect(result.transitiveTests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          test: "src/controllers/controller.test.ts",
          via: "src/controllers/controller.ts",
        }),
      ]),
    );
  });

  it("reports correct total test count", () => {
    const result = queryTestMap("src/lib/utils.ts", cache);
    expect(result.testCount).toBe(2);
  });

  it("returns empty for file with no test connections", () => {
    const result = queryTestMap("src/controllers/app.ts", cache);
    expect(result.testCount).toBe(0);
    expect(result.directTests).toEqual([]);
    expect(result.transitiveTests).toEqual([]);
  });

  it("finds direct test for controller.ts", () => {
    const result = queryTestMap("src/controllers/controller.ts", cache);
    expect(result.directTests).toContain("src/controllers/controller.test.ts");
    expect(result.testCount).toBe(1);
  });
});

describe("formatTestMap", () => {
  const cache = createTestCache();

  it("formats strand notation with direct and transitive", () => {
    const result = queryTestMap("src/lib/utils.ts", cache);
    const output = formatTestMap(result, false);
    expect(output).toContain("2 test files connected");
    expect(output).toContain("structural, not runtime coverage");
    expect(output).toContain("direct:");
    expect(output).toContain("utils.test.ts");
    expect(output).toContain("transitive:");
    expect(output).toContain("controller.test.ts");
  });

  it("formats valid JSON", () => {
    const result = queryTestMap("src/lib/utils.ts", cache);
    const output = formatTestMap(result, true);
    const parsed = JSON.parse(output);
    expect(parsed.testCount).toBe(2);
    expect(parsed.directTests).toBeInstanceOf(Array);
  });

  it("shows 0 test files for file with no connections", () => {
    const result = queryTestMap("src/controllers/app.ts", cache);
    const output = formatTestMap(result, false);
    expect(output).toContain("0 test files connected");
  });
});
