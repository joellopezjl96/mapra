import { describe, it, expect } from "vitest";
import { buildPrompt } from "../runner.js";

describe("buildPrompt", () => {
  const question = "What does this codebase do?";
  const encoding = "MAPRA v3 | test | Typescript | 10 files";
  const prefix = "You are a senior engineer.";

  it("returns just the question when no prefix and no encoding", () => {
    const result = buildPrompt("", question);
    expect(result).toBe(question);
  });

  it("wraps encoding around the question when no prefix", () => {
    const result = buildPrompt(encoding, question);
    expect(result).toBe(
      `Here is an encoding of a codebase:\n\n${encoding}\n\nBased on this encoding, answer the following question:\n\n${question}`,
    );
  });

  it("prepends prefix to question when no encoding", () => {
    const result = buildPrompt("", question, prefix);
    expect(result).toBe(`${prefix}\n\n${question}`);
  });

  it("wraps encoding and prepends prefix to question when both provided", () => {
    const result = buildPrompt(encoding, question, prefix);
    expect(result).toBe(
      `Here is an encoding of a codebase:\n\n${encoding}\n\nBased on this encoding, answer the following question:\n\n${prefix}\n\n${question}`,
    );
  });

  it("treats empty string prefix as no prefix (falsy)", () => {
    const result = buildPrompt(encoding, question, "");
    expect(result).toBe(
      `Here is an encoding of a codebase:\n\n${encoding}\n\nBased on this encoding, answer the following question:\n\n${question}`,
    );
  });

  it("treats undefined prefix as no prefix", () => {
    const result = buildPrompt(encoding, question, undefined);
    expect(result).toBe(
      `Here is an encoding of a codebase:\n\n${encoding}\n\nBased on this encoding, answer the following question:\n\n${question}`,
    );
  });
});
