/**
 * Judge model scoring — evaluates LLM responses against ground truth assertions.
 *
 * Uses a cheap/fast model (Haiku) to check whether each assertion
 * is satisfied by the response. Returns structured verdicts.
 */

import type Anthropic from "@anthropic-ai/sdk";
import type { Assertion, AssertionScore, Verdict } from "./types.js";

/**
 * Score a single response against its assertions using the judge model.
 */
export async function scoreResponse(
  client: Anthropic,
  judgeModel: string,
  question: string,
  response: string,
  assertions: Assertion[],
): Promise<AssertionScore[]> {
  const prompt = buildJudgePrompt(question, response, assertions);

  const result = await client.messages.create({
    model: judgeModel,
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });

  const text = result.content[0]?.type === "text" ? result.content[0].text : "";
  return parseJudgeResponse(text, assertions);
}

/**
 * Build the judge prompt. Exported for testing.
 */
export function buildJudgePrompt(
  question: string,
  response: string,
  assertions: Assertion[],
): string {
  const assertionLines = assertions
    .map((a, i) => `${i + 1}. ${a.check}`)
    .join("\n");

  return `You are evaluating an AI's response to a codebase analysis question.

QUESTION: ${question}

RESPONSE:
${response}

ASSERTIONS TO CHECK:
${assertionLines}

For each assertion, respond with EXACTLY this format (one per line):
ASSERTION_1: PASS|PARTIAL|FAIL — <brief reasoning>
ASSERTION_2: PASS|PARTIAL|FAIL — <brief reasoning>
...

PASS = fully correct. PARTIAL = partially correct or mentioned but incomplete. FAIL = wrong or missing.`;
}

/**
 * Parse the judge model's structured response into AssertionScore[].
 * Exported for testing.
 */
export function parseJudgeResponse(
  text: string,
  assertions: Assertion[],
): AssertionScore[] {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  const results: AssertionScore[] = [];

  for (let i = 0; i < assertions.length; i++) {
    const assertion = assertions[i];
    if (!assertion) continue;

    // Look for a line matching ASSERTION_N: VERDICT — reasoning
    const pattern = new RegExp(
      `ASSERTION_${i + 1}\\s*:\\s*(PASS|PARTIAL|FAIL)\\s*[—–-]\\s*(.*)`,
      "i",
    );

    let matched = false;
    for (const line of lines) {
      const m = pattern.exec(line);
      if (m) {
        results.push({
          assertion: assertion.check,
          verdict: m[1]!.toUpperCase() as Verdict,
          reasoning: m[2]?.trim() ?? "",
        });
        matched = true;
        break;
      }
    }

    // Fallback: if judge didn't follow format, mark as FAIL
    if (!matched) {
      results.push({
        assertion: assertion.check,
        verdict: "FAIL",
        reasoning:
          "Judge response did not include a verdict for this assertion",
      });
    }
  }

  return results;
}

/**
 * Compute an aggregate score (0-1) from a list of assertion scores.
 * PASS = 1.0, PARTIAL = 0.5, FAIL = 0.0
 */
export function aggregateScores(scores: AssertionScore[]): number {
  if (scores.length === 0) return 0;
  const total = scores.reduce((sum, s) => {
    if (s.verdict === "PASS") return sum + 1.0;
    if (s.verdict === "PARTIAL") return sum + 0.5;
    return sum;
  }, 0);
  return total / scores.length;
}
