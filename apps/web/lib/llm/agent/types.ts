import type { BoundedQueryResult, BoundedResultPreview } from "@query-wise/shared/types";
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

/** Error thrown when the agent fails, carrying the partial state so the UI doesn't lose the transcript. */
export class AgentExecutionError extends Error {
  constructor(message: string, public partialResult: Omit<AnalystAgentResult, "answer">, public cause?: unknown) {
    super(message);
    this.name = "AgentExecutionError";
  }
}

/** Connection-scoped SQL runtime injected by the orchestrator. */
export interface AnalystAgentRuntime {
  validateSql(sql: string): Promise<SqlValidationOutcome>;
  /** Must be called with a normalizedSql returned by validateSql. */
  executeSql(normalizedSql: string): Promise<BoundedQueryResult>;
}

export type AgentActivityKind =
  | "thinking"
  | "thinking-delta"
  | "tool-call"
  | "tool-result"
  | "retry";

export interface AgentActivityEvent {
  kind: AgentActivityKind;
  label: string;
  tool?: string;
  blockIndex?: number | null;
  content?: string;
  input?: unknown;
  /** Incremental reasoning text carried by `thinking-delta` events. */
  chunk?: string;
  /**
   * Correlates a tool-result/retry with its originating tool-call so parallel
   * calls of the same tool merge into the right live-timeline row.
   */
  callId?: string;
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

/** Full renderable result data for a block, streamed the moment SQL succeeds. */
export interface AgentBlockDataEvent {
  blockIndex: number;
  purpose: string;
  sql: string;
  preview: BoundedResultPreview;
  rowCount: number;
  executionTimeMs: number;
  truncated: boolean;
  /** Heuristic default config so the UI can draw immediately; set_chart may refine it. */
  chartConfig: ChartConfig;
}

/** Refined chart choice for an existing block (agent called set_chart). */
export interface AgentChartConfigEvent {
  blockIndex: number;
  chartConfig: ChartConfig;
}

/** Every backend action surfaces through one of these (live activity feed). */
export interface AnalystAgentEmitters {
  onTextDelta?(chunk: string): void;
  onActivity?(event: AgentActivityEvent): void;
  onSqlPreview?(event: AgentSqlPreviewEvent): void;
  onQueryStats?(event: AgentQueryStatsEvent): void;
  onBlockData?(event: AgentBlockDataEvent): void;
  onChartConfig?(event: AgentChartConfigEvent): void;
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
  outcome: "ok" | "error" | "thinking";
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
