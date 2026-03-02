/**
 * Report generator — produces JSON results and markdown summary tables.
 *
 * The markdown output mirrors the comparison tables from manual experiments
 * (no-strand vs v2 vs v3) but generated automatically from batch results.
 */

import type { BatchResults, QuestionResult, ConditionResult } from "./types.js";

/**
 * Generate a markdown summary report from batch results.
 */
export function generateMarkdownReport(results: BatchResults): string {
  const lines: string[] = [];

  lines.push(`## Results: ${results.config.name}`);
  lines.push("");
  lines.push(
    `*${results.config.codebases.join(", ")} — ${results.config.timestamp}*`,
  );
  lines.push("");

  // ─── Overall scores by condition ───
  lines.push("### Overall Scores by Condition");
  lines.push("");

  const conditionStats = aggregateByCondition(results.results);
  lines.push("| Condition | Avg Score | Avg Tokens (in) | Avg Latency |");
  lines.push("|-----------|-----------|------------------|-------------|");
  for (const stat of conditionStats) {
    lines.push(
      `| ${stat.name} | ${stat.avgScore.toFixed(2)} | ${formatNum(stat.avgInputTokens)} | ${stat.avgLatency.toFixed(1)}s |`,
    );
  }
  lines.push("");

  // ─── Scores by task type ───
  const taskTypes = getUniqueTaskTypes(results.results);
  if (taskTypes.length > 1) {
    lines.push("### Scores by Task Type");
    lines.push("");

    const conditionNames = conditionStats.map((c) => c.name);
    const conditionIds = conditionStats.map((c) => c.id);

    lines.push(`| Task Type | ${conditionNames.join(" | ")} |`);
    lines.push(
      `|-----------|${conditionNames.map(() => "-----------").join("|")}|`,
    );

    for (const taskType of taskTypes) {
      const questionsOfType = results.results.filter(
        (r) => r.taskType === taskType,
      );
      const scores = conditionIds.map((cid) => {
        const conditionResults = questionsOfType.flatMap((q) =>
          q.conditions.filter((c) => c.conditionId === cid),
        );
        if (conditionResults.length === 0) return "—";
        const avg =
          conditionResults.reduce((s, c) => s + c.aggregateScore, 0) /
          conditionResults.length;
        return avg.toFixed(2);
      });
      lines.push(`| ${taskType} | ${scores.join(" | ")} |`);
    }
    lines.push("");
  }

  // ─── Per-question detail ───
  lines.push("### Per-Question Detail");
  lines.push("");

  for (const qr of results.results) {
    lines.push(
      `<details><summary><strong>${qr.questionId}</strong> (${qr.taskType}) — ${truncate(qr.question, 80)}</summary>`,
    );
    lines.push("");
    for (const cr of qr.conditions) {
      const trialScores = cr.trials
        .map((t) => {
          if (!t.scores || t.scores.length === 0) return "?";
          const s =
            t.scores.reduce(
              (sum, a) =>
                sum +
                (a.verdict === "PASS" ? 1 : a.verdict === "PARTIAL" ? 0.5 : 0),
              0,
            ) / t.scores.length;
          return s.toFixed(2);
        })
        .join(", ");
      lines.push(
        `**${cr.conditionName}**: avg ${cr.aggregateScore.toFixed(2)} (trials: ${trialScores})`,
      );

      // Show assertion-level detail from first trial
      const firstTrial = cr.trials[0];
      if (firstTrial?.scores) {
        for (const score of firstTrial.scores) {
          const icon =
            score.verdict === "PASS"
              ? "+"
              : score.verdict === "PARTIAL"
                ? "~"
                : "-";
          lines.push(
            `  ${icon} ${score.verdict}: ${score.assertion} — ${score.reasoning}`,
          );
        }
      }
      lines.push("");
    }
    lines.push("</details>");
    lines.push("");
  }

  // ─── Cost summary ───
  lines.push("### Cost Summary");
  lines.push("");
  lines.push(`- **API calls**: ${results.summary.totalApiCalls}`);
  lines.push(
    `- **Tokens**: ${formatNum(results.summary.totalTokens.input)} in / ${formatNum(results.summary.totalTokens.output)} out`,
  );
  lines.push(
    `- **Estimated cost**: $${results.summary.totalCostEstimate.toFixed(2)}`,
  );
  lines.push(
    `- **Duration**: ${(results.summary.durationMs / 1000).toFixed(0)}s`,
  );
  lines.push("");

  return lines.join("\n");
}

// ─── Helpers ──────────────────────────────────────────

interface ConditionStat {
  id: string;
  name: string;
  avgScore: number;
  avgInputTokens: number;
  avgLatency: number;
}

function aggregateByCondition(results: QuestionResult[]): ConditionStat[] {
  const condMap = new Map<
    string,
    { name: string; scores: number[]; tokens: number[]; latencies: number[] }
  >();

  for (const qr of results) {
    for (const cr of qr.conditions) {
      let entry = condMap.get(cr.conditionId);
      if (!entry) {
        entry = {
          name: cr.conditionName,
          scores: [],
          tokens: [],
          latencies: [],
        };
        condMap.set(cr.conditionId, entry);
      }
      entry.scores.push(cr.aggregateScore);
      for (const t of cr.trials) {
        entry.tokens.push(t.tokens.input);
        entry.latencies.push(t.latencyMs / 1000);
      }
    }
  }

  const stats: ConditionStat[] = [];
  for (const [id, entry] of condMap) {
    stats.push({
      id,
      name: entry.name,
      avgScore: avg(entry.scores),
      avgInputTokens: avg(entry.tokens),
      avgLatency: avg(entry.latencies),
    });
  }
  return stats;
}

function getUniqueTaskTypes(results: QuestionResult[]): string[] {
  const seen = new Set<string>();
  for (const r of results) seen.add(r.taskType);
  return [...seen].sort();
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function formatNum(n: number): string {
  return Math.round(n).toLocaleString();
}

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + "…";
}
