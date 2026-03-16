// src/query/__tests__/resolve.test.ts
import { describe, it, expect } from "vitest";
import { resolveFile } from "../resolve.js";

const nodeIds = [
  "src/lib/constants.ts",
  "src/emails/constants.ts",
  "src/services/order.ts",
  "src/lib/utils.ts",
];

describe("resolveFile", () => {
  it("matches exact path", () => {
    expect(resolveFile(nodeIds, "src/lib/constants.ts")).toBe("src/lib/constants.ts");
  });

  it("normalizes backslashes to forward slashes", () => {
    expect(resolveFile(nodeIds, "src\\services\\order.ts")).toBe("src/services/order.ts");
  });

  it("matches unique suffix", () => {
    expect(resolveFile(nodeIds, "order.ts")).toBe("src/services/order.ts");
  });

  it("matches suffix with partial path", () => {
    expect(resolveFile(nodeIds, "lib/utils.ts")).toBe("src/lib/utils.ts");
  });

  it("throws on ambiguous suffix match", () => {
    expect(() => resolveFile(nodeIds, "constants.ts")).toThrow("Multiple matches");
    expect(() => resolveFile(nodeIds, "constants.ts")).toThrow("src/lib/constants.ts");
    expect(() => resolveFile(nodeIds, "constants.ts")).toThrow("src/emails/constants.ts");
  });

  it("strips leading slash", () => {
    expect(resolveFile(nodeIds, "/src/lib/constants.ts")).toBe("src/lib/constants.ts");
  });

  it("throws on no match", () => {
    expect(() => resolveFile(nodeIds, "nonexistent.ts")).toThrow("not found in cache");
  });
});
