/**
 * Advisor engine — Haiku-powered recommendations for experiment improvement.
 *
 * Takes an AnalysisReport + BatchResults, calls Haiku to generate
 * concrete assertion rewrites, condition suggestions, and question suggestions.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { AnalysisReport, BatchResults } from "./types.js";

export interface Advice {
  assertionRewrites: Array<{
    questionId: string;
    assertion: string;
    problem: string;
    rewrite: string;
    why: string;
  }>;
  conditionSuggestions: string[];
  questionSuggestions: string[];
  estimatedSavings: string;
}

export function buildAdvicePrompt(report: AnalysisReport): string {
  const diagSummary = report.diagnostics
    .map((d) => `[${d.type}] ${d.questionId}: "${d.assertion}" — ${d.detail}`)
    .join("\n");

  return `You are an experiment design advisor for an LLM evaluation system.

The system tests whether different codebase encodings help LLMs answer structural questions.
Each experiment has conditions (encoding variants), questions (with assertions), and trials.

Here are the diagnostics from the latest experiment run:

${diagSummary}

Budget: ${report.budget.totalSavingsPercent}% estimated waste.

Based on these diagnostics, provide concrete recommendations in these categories:

ASSERTION REWRITES:
For each non-discriminating or flaky assertion, suggest a specific rewrite that would make it more discriminating. The rewrite should test reasoning, not just presence of keywords.

CONDITION SUGGESTIONS:
If any conditions score identically or one hurts performance, suggest merging or splitting.

QUESTION SUGGESTIONS:
If any questions are at ceiling (trivially easy), suggest retiring or tightening them.

Format each recommendation as:
REWRITE: [questionId] "[old assertion]"
PROBLEM: [why it's weak]
NEW: "[rewritten assertion]"
WHY: [why the rewrite is better]

CONDITION: [suggestion]

QUESTION: [suggestion]

SAVINGS: [estimated savings if all applied]`;
}

export async function generateAdvice(
  report: AnalysisReport,
  _batch: BatchResults,
): Promise<Advice> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY required for --advise");

  const client = new Anthropic({ apiKey });
  const prompt = buildAdvicePrompt(report);

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  return parseAdviceResponse(text);
}

export function parseAdviceResponse(text: string): Advice {
  const rewrites: Advice["assertionRewrites"] = [];
  const conditionSuggestions: string[] = [];
  const questionSuggestions: string[] = [];
  let savings = "";

  // Parse REWRITE blocks
  const rewritePattern = /REWRITE:\s*\[(\S+)\]\s*"([^"]+)"\s*\nPROBLEM:\s*(.+)\s*\nNEW:\s*"([^"]+)"\s*\nWHY:\s*(.+)/g;
  let m;
  while ((m = rewritePattern.exec(text)) !== null) {
    rewrites.push({
      questionId: m[1]!,
      assertion: m[2]!,
      problem: m[3]!.trim(),
      rewrite: m[4]!,
      why: m[5]!.trim(),
    });
  }

  // Parse CONDITION lines
  for (const line of text.split("\n")) {
    if (line.startsWith("CONDITION:")) {
      conditionSuggestions.push(line.replace("CONDITION:", "").trim());
    }
    if (line.startsWith("QUESTION:")) {
      questionSuggestions.push(line.replace("QUESTION:", "").trim());
    }
    if (line.startsWith("SAVINGS:")) {
      savings = line.replace("SAVINGS:", "").trim();
    }
  }

  return { assertionRewrites: rewrites, conditionSuggestions, questionSuggestions, estimatedSavings: savings };
}

export function formatAdvice(advice: Advice): string {
  const lines: string[] = [];
  lines.push("=== RECOMMENDATIONS (powered by claude-haiku) ===\n");

  if (advice.assertionRewrites.length > 0) {
    lines.push("  ASSERTION REWRITES:\n");
    for (const r of advice.assertionRewrites) {
      lines.push(`  ${r.questionId}: "${r.assertion}"`);
      lines.push(`    Problem: ${r.problem}`);
      lines.push(`    Rewrite: "${r.rewrite}"`);
      lines.push(`    Why: ${r.why}`);
      lines.push("");
    }
  }

  if (advice.conditionSuggestions.length > 0) {
    lines.push("  CONDITION SUGGESTIONS:\n");
    for (const s of advice.conditionSuggestions) lines.push(`  - ${s}`);
    lines.push("");
  }

  if (advice.questionSuggestions.length > 0) {
    lines.push("  QUESTION SUGGESTIONS:\n");
    for (const s of advice.questionSuggestions) lines.push(`  - ${s}`);
    lines.push("");
  }

  if (advice.estimatedSavings) {
    lines.push(`  ESTIMATED SAVINGS: ${advice.estimatedSavings}`);
  }

  return lines.join("\n");
}
