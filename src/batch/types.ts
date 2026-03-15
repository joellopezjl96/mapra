/**
 * Batch experiment runner types.
 *
 * Config is loaded from JSON; results are built up during execution
 * and serialized to JSON + markdown at the end.
 */

// ─── Config (loaded from JSON) ──────────────────────────

export interface CodebaseRef {
  name: string;
  path: string;
}

export interface Condition {
  id: string;
  name: string;
  model: string;
  encoding: "strand-v3" | "strand-v2" | "text" | "text-bare" | "none";
  includeUsageLine?: boolean;
  excludeSections?: string[];
  trials?: number;
  enableTools?: boolean;
  /** Prepended to the question for this condition (e.g., strategy framing) */
  promptPrefix?: string;
}

export interface Assertion {
  description: string;
  /** What the judge should verify (e.g., "Response mentions ordering-server.ts") */
  check: string;
}

export type TaskType =
  | "planning"
  | "debugging"
  | "refactoring"
  | "impact"
  | "review"
  | "inventory"
  | "architecture"
  | "change-safety";

export interface Question {
  id: string;
  question: string;
  taskType: TaskType;
  assertions: Assertion[];
}

export interface BatchConfig {
  name: string;
  description: string;
  codebases: CodebaseRef[];
  conditions: Condition[];
  questions: Question[];
  trials: number;
  maxTokens: number;
  delayMs: number;
  judgeModel: string;
  outputDir: string;
}

// ─── Results ────────────────────────────────────────────

export type Verdict = "PASS" | "PARTIAL" | "FAIL";

export interface AssertionScore {
  assertion: string;
  verdict: Verdict;
  reasoning: string;
}

export interface TrialResult {
  trial: number;
  response: string;
  tokens: { input: number; output: number };
  latencyMs: number;
  scores?: AssertionScore[];
  stopReason?: "end_turn" | "tool_use" | "max_tokens";
  toolCallCount?: number;
}

export interface ConditionResult {
  conditionId: string;
  conditionName: string;
  trials: TrialResult[];
  aggregateScore: number; // 0-1, average across trials
}

export interface QuestionResult {
  questionId: string;
  question: string;
  taskType: string;
  codebaseName: string;
  conditions: ConditionResult[];
}

export interface BatchResults {
  config: { name: string; timestamp: string; codebases: string[] };
  results: QuestionResult[];
  summary: {
    totalApiCalls: number;
    totalTokens: { input: number; output: number };
    totalCostEstimate: number;
    durationMs: number;
  };
}

// ─── Analysis ────────────────────────────────────────────

// TODO: consider adding "ceiling" and "floor" diagnostic types
// when detection logic is implemented
export type DiagnosticType =
  | "non-discriminating"
  | "flaky"
  | "redundant"
  | "negative-signal";

export interface ConditionStats {
  conditionId: string;
  conditionName: string;
  mean: number;
  stddev: number;
  min: number;
  max: number;
  verdictDistribution: { PASS: number; PARTIAL: number; FAIL: number };
  avgInputTokens: number;
  avgLatencyMs: number;
}

export interface ConditionComparison {
  conditionA: string;
  conditionB: string;
  cliffsDelta: number;
  cliffsMagnitude: "negligible" | "small" | "medium" | "large";
  confidenceInterval: [number, number];
  winRate: { wins: number; losses: number; ties: number; total: number };
}

export interface AssertionDiagnostic {
  type: DiagnosticType;
  questionId: string;
  assertion: string;
  detail: string;
  passRates?: Record<string, number>;
  trialScores?: number[];
  cv?: number;
  correlation?: number;
  pairedWith?: string;
}

export interface BudgetSummary {
  wastedOnNonDiscriminating: number;
  recoverableFromRedundant: number;
  totalSavingsPercent: number;
}

export interface ToolUsageStats {
  conditionId: string;
  conditionName: string;
  avgToolCalls: number;
  selfSufficientRate: number;  // fraction of trials with 0 tool calls
  trialCount: number;
}

export interface AnalysisReport {
  conditionStats: ConditionStats[];
  comparisons: ConditionComparison[];
  diagnostics: AssertionDiagnostic[];
  budget: BudgetSummary;
  toolUsage?: ToolUsageStats[];
}

export interface IterationDelta {
  conditionId: string;
  conditionName: string;
  scoreBefore: number;
  scoreAfter: number;
  delta: number;
  cliffsDelta: number;
}

export interface IterationComparison {
  beforeName: string;
  afterName: string;
  deltas: IterationDelta[];
  regressions: Array<{ questionId: string; conditionId: string; before: number; after: number }>;
  improvements: Array<{ questionId: string; conditionId: string; before: number; after: number }>;
  costBefore: number;
  costAfter: number;
}

// ─── Checkpoint ─────────────────────────────────────────

/** Tracks which (question × codebase × condition) tuples are done */
export interface CheckpointKey {
  questionId: string;
  codebaseName: string;
  conditionId: string;
}
