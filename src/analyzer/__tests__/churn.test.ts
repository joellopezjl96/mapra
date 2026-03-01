import { describe, it, expect } from "vitest";
import { parseGitLogOutput, type ChurnResult } from "../churn.js";

describe("parseGitLogOutput", () => {
  it("parses numstat output into per-file churn", () => {
    const raw = [
      "abc1234|2026-02-28T10:00:00-06:00|feat: add Sentry",
      "15\t20\tsrc/orders/route.ts",
      "5\t3\tsrc/lib/utils.ts",
      "",
      "def5678|2026-02-27T09:00:00-06:00|fix: remove personalEmail",
      "100\t200\tsrc/orders/route.ts",
      "",
    ].join("\n");

    const results = parseGitLogOutput(raw);

    const orders = results.get("src/orders/route.ts");
    expect(orders).toBeDefined();
    expect(orders!.commits30d).toBe(2);
    expect(orders!.linesAdded30d).toBe(115);   // 15 + 100
    expect(orders!.linesRemoved30d).toBe(220); // 20 + 200
    expect(orders!.lastCommitHash).toBe("abc1234");
    expect(orders!.lastCommitMsg).toBe("feat: add Sentry");

    const utils = results.get("src/lib/utils.ts");
    expect(utils).toBeDefined();
    expect(utils!.commits30d).toBe(1);
  });

  it("handles empty git log output", () => {
    const results = parseGitLogOutput("");
    expect(results.size).toBe(0);
  });

  it("handles binary files (- - in numstat)", () => {
    const raw = [
      "abc1234|2026-02-28T10:00:00-06:00|feat: add image",
      "-\t-\tpublic/logo.png",
      "5\t3\tsrc/app.ts",
      "",
    ].join("\n");

    const results = parseGitLogOutput(raw);
    expect(results.has("public/logo.png")).toBe(false);
    expect(results.has("src/app.ts")).toBe(true);
  });
});
