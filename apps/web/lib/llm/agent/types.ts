import type { BoundedQueryResult } from "@query-wise/shared/types";
import type { ChartConfig, ChartHint, ChatMessage, SchemaInfo } from "@/types";
import type { Provider } from "../client";

/**
 * Contract between the analyst agent (lib/llm/agent) and the query
 * orchestrator (lib/query/orchestrator). The orchestrator injects the
 * connection-scoped runtime and consumes the emitted events + result.
 * See docs/AGENTIC_ARCHITECTURE.md §3.
 */

export interface SqlValidationOutcome {
  valid: boolean;
  violations: string[];
  normalizedSql: string | null;
}

/** Connection-scoped SQL runtime injected by the orchestrator. */
export interface AnalystAgentRuntime {
  validateSql(sql: string): Promise<SqlValidationOutcome>;
  /** Must be called with a normalizedSql returned by validateSql. */
  executeSql(normalizedSql: string): Promise<BoundedQueryResult>;
}

export type AgentActivityKind = "thinking" | "tool-call" | "tool-result" | "retry";

export interface AgentActivityEvent {
  kind: AgentActivityKind;
  label: string;
  tool?: string;
  blockIndex?: number | null;
}

export interface AgentSqlPreviewEvent {
  blockIndex: number | null;
  sql: string;
  purpose: string;
  validation: "valid" | "blocked";
}

export interface AgentQueryStatsEvent {
  blockIndex: number;
  rowCount: number;
  executionTimeMs: number;
  truncated: boolean;
}

/** Every backend action surfaces through one of these (live activity feed). */
export interface AnalystAgentEmitters {
  onTextDelta?(chunk: string): void;
  onActivity?(event: AgentActivityEvent): void;
  onSqlPreview?(event: AgentSqlPreviewEvent): void;
  onQueryStats?(event: AgentQueryStatsEvent): void;
}

/** One executed query with its result and chart, rendered as a UI block. */
export interface AgentResultBlock {
  index: number;
  purpose: string;
  sql: string;
  result: BoundedQueryResult;
  /** Agent-provided hint via set_chart, already axis-validated. */
  chartHint: ChartHint | null;
  /** Final config (hint applied, or local heuristic fallback). */
  chartConfig: ChartConfig | null;
}

export interface AgentTranscriptStep {
  tool: string;
  input: unknown;
  outcome: "ok" | "error";
  summary: string;
}

export interface AnalystAgentResult {
  mode: "query" | "conversation";
  answer: string;
  blocks: AgentResultBlock[];
  transcript: AgentTranscriptStep[];
}

export interface RunAnalystAgentParams extends AnalystAgentEmitters {
  question: string;
  history: ChatMessage[];
  schema: SchemaInfo;
  runtime: AnalystAgentRuntime;
  provider: Provider;
  model: string;
  apiKey: string;
  abortSignal?: AbortSignal;
}

/** Mutable per-run state shared by the tools. */
export interface AgentRunState {
  blocks: AgentResultBlock[];
  transcript: AgentTranscriptStep[];
  sqlAttempts: number;
  sampleCalls: number;
}

export const AGENT_BUDGETS = {
  maxSteps: 8,
  maxSqlAttempts: 5,
  maxSampleCalls: 6,
  modelRowSlice: 50,
} as const;
