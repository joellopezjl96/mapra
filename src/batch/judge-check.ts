/**
 * Judge calibration — checks judge consistency and bias.
 *
 * Re-scores a sample of response-assertion pairs to detect:
 * - Inconsistency: same input produces different verdicts
 * - Bias: PARTIAL underuse (binary judging)
 */

import Anthropic from "@anthropic-ai/sdk";
import type { BatchResults, Verdict } from "./types.js";

export interface JudgeCheckResult {
  sampleSize: number;
  consistency: number;
  bias: VerdictBias;
  inconsistentPairs: Array<{
    questionId: string;
    assertion: string;
    verdicts: Verdict[];
  }>;
}

export interface VerdictBias {
  passRate: number;
  partialRate: number;
  failRate: number;
  biased: boolean;
}

export function computeConsistency(repetitions: Verdict[][]): number {
  if (repetitions.length === 0) return 1.0;
  let consistent = 0;
  for (const reps of repetitions) {
    const allSame = reps.every((v) => v === reps[0]);
    if (allSame) consistent++;
  }
  return consistent / repetitions.length;
}

export function computeVerdictBias(verdicts: Verdict[]): VerdictBias {
  if (verdicts.length === 0) {
    return { passRate: 0, partialRate: 0, failRate: 0, biased: false };
  }
  const total = verdicts.length;
  const passRate = verdicts.filter((v) => v === "PASS").length / total;
  const partialRate = verdicts.filter((v) => v === "PARTIAL").length / total;
  const failRate = verdicts.filter((v) => v === "FAIL").length / total;
  // Biased if PARTIAL is never used (binary judging)
  const biased = partialRate < 0.05;
  return { passRate, partialRate, failRate, biased };
}

interface ScoringPair {
  questionId: string;
  assertion: string;
  response: string;
}

function samplePairs(batch: BatchResults, n: number): ScoringPair[] {
  const pairs: ScoringPair[] = [];
  for (const qr of batch.results) {
    for (const cr of qr.conditions) {
      for (const trial of cr.trials) {
        if (!trial.scores) continue;
        for (const score of trial.scores) {
          pairs.push({
            questionId: qr.questionId,
            assertion: score.assertion,
            response: trial.response,
          });
        }
      }
    }
  }

  // Shuffle and take n
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pairs[i], pairs[j]] = [pairs[j]!, pairs[i]!];
  }
  return pairs.slice(0, n);
}

async function reScore(
  client: Anthropic,
  pair: ScoringPair,
  repetitions: number,
): Promise<Verdict[]> {
  const verdicts: Verdict[] = [];
  for (let i = 0; i < repetitions; i++) {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: `Score this response against the assertion. Reply with exactly one word: PASS, PARTIAL, or FAIL.

Assertion: ${pair.assertion}

Response:
${pair.response.slice(0, 2000)}`,
        },
      ],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
    if (text === "PASS" || text === "PARTIAL" || text === "FAIL") {
      verdicts.push(text);
    } else {
      verdicts.push("FAIL"); // default on unparseable
    }
  }
  return verdicts;
}

export async function runJudgeCheck(
  batch: BatchResults,
  sampleSize = 5,
  repetitions = 3,
): Promise<JudgeCheckResult> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY required for --judge-check");

  const client = new Anthropic({ apiKey });
  const pairs = samplePairs(batch, sampleSize);

  const allRepetitions: Verdict[][] = [];
  const inconsistentPairs: JudgeCheckResult["inconsistentPairs"] = [];
  const allVerdicts: Verdict[] = [];

  for (const pair of pairs) {
    const verdicts = await reScore(client, pair, repetitions);
    allRepetitions.push(verdicts);
    allVerdicts.push(...verdicts);

    const allSame = verdicts.every((v) => v === verdicts[0]);
    if (!allSame) {
      inconsistentPairs.push({
        questionId: pair.questionId,
        assertion: pair.assertion,
        verdicts,
      });
    }
  }

  return {
    sampleSize: pairs.length,
    consistency: computeConsistency(allRepetitions),
    bias: computeVerdictBias(allVerdicts),
    inconsistentPairs,
  };
}

export function formatJudgeCheck(result: JudgeCheckResult): string {
  const lines: string[] = [];
  lines.push("=== JUDGE CALIBRATION ===\n");
  lines.push(`  Sample size: ${result.sampleSize} pairs x 3 repetitions`);
  lines.push(`  Consistency: ${(result.consistency * 100).toFixed(0)}%`);
  lines.push(
    `  Verdict distribution: PASS ${(result.bias.passRate * 100).toFixed(0)}% | PARTIAL ${(result.bias.partialRate * 100).toFixed(0)}% | FAIL ${(result.bias.failRate * 100).toFixed(0)}%`,
  );

  if (result.bias.biased) {
    lines.push("  WARNING: PARTIAL underuse detected — judge may be binary");
  }

  if (result.inconsistentPairs.length > 0) {
    lines.push("\n  INCONSISTENT PAIRS:");
    for (const p of result.inconsistentPairs) {
      lines.push(`    ${p.questionId}: "${p.assertion}" -> [${p.verdicts.join(", ")}]`);
    }
  }

  lines.push("");
  return lines.join("\n");
}
