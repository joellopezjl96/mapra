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
  encoding: "strand-v3" | "strand-v2" | "text" | "none";
  includeUsageLine?: boolean;
  excludeSections?: string[];
  trials?: number;
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
  | "architecture";

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

// ─── Checkpoint ─────────────────────────────────────────

/** Tracks which (question × codebase × condition) tuples are done */
export interface CheckpointKey {
  questionId: string;
  codebaseName: string;
  conditionId: string;
}
