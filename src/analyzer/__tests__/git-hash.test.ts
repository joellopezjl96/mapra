import { describe, it, expect } from "vitest";
import { getGitHash } from "../git-hash.js";
import * as path from "path";
import * as os from "os";

describe("getGitHash", () => {
  it("returns a short hash string for a git repo", () => {
    // The project itself is a git repo
    const rootDir = path.resolve(__dirname, "../../..");
    const hash = getGitHash(rootDir);
    expect(hash).not.toBeNull();
    expect(hash!.length).toBeGreaterThanOrEqual(7);
    expect(hash!.length).toBeLessThanOrEqual(12);
    expect(hash).toMatch(/^[a-f0-9]+$/);
  });

  it("returns null for a non-git directory", () => {
    const hash = getGitHash(os.tmpdir());
    expect(hash).toBeNull();
  });
});
