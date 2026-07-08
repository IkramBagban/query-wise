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

/** Result of an EXPLAIN (FORMAT JSON) probe (SPEC-02 §1.2). */
export interface ExplainQueryOutcome {
  /** The plan's estimated total cost (arbitrary planner units). */
  totalCost: number;
  /** The plan's estimated returned row count. */
  planRows: number;
}

/** Connection-scoped SQL runtime injected by the orchestrator. */
export interface AnalystAgentRuntime {
  validateSql(sql: string): Promise<SqlValidationOutcome>;
  /** Must be called with a normalizedSql returned by validateSql. */
  executeSql(normalizedSql: string): Promise<BoundedQueryResult>;
  /**
   * Estimate a statement's cost via `EXPLAIN (FORMAT JSON)` — never ANALYZE, so
   * the query is planned but not executed (SPEC-02 §1.2). Validates the inner
   * statement through the same read-only policy as `executeSql` before wrapping
   * it in the EXPLAIN. Returns null when the plan cannot be parsed.
   */
  explainSql(sql: string): Promise<ExplainQueryOutcome | null>;
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
  /** Links a successful run_sql step to its result block for chronological UI interleaving. */
  blockIndex?: number;
}

export interface AnalystAgentResult {
  mode: "query" | "conversation";
  answer: string;
  blocks: AgentResultBlock[];
  transcript: AgentTranscriptStep[];
}

/**
 * Distilled conversation memory injected into the agent context (SPEC-02 §4).
 * Produced from the persisted per-conversation analysis state; a small,
 * budget-friendly preamble that survives beyond the verbatim history window.
 */
export interface AgentMemoryContext {
  /** One-paragraph summary of turns older than the verbatim window. */
  rollingSummary?: string;
  /** Recent result blocks as `turn · purpose — headline` lines. */
  blockSummaries?: string[];
  /** Entities (tables/metrics) discussed so far. */
  entities?: string[];
  /** Most recent active filters the user established. */
  activeFilters?: string[];
  /** Most recent time window the user established. */
  timeWindow?: string;
}

export interface RunAnalystAgentParams extends AnalystAgentEmitters {
  question: string;
  history: ChatMessage[];
  schema: SchemaInfo;
  runtime: AnalystAgentRuntime;
  provider: Provider;
  model: string;
  apiKeys: string[];
  abortSignal?: AbortSignal;
  /**
   * Table names in descending relevance order for the current question,
   * pre-seeded from retrieval (SPEC-01 §3). Drives Tier-B membership in the
   * tiered schema context. Optional — assembly falls back to schema order.
   */
  rankedTables?: string[];
  /**
   * Resolved step/attempt budget for this run (SPEC-02 §2). Optional so tests
   * can inject a profile directly; production resolves it from the question via
   * `resolveAgentBudget`.
   */
  budget?: AgentBudget;
  /** Distilled prior-turn memory injected into context (SPEC-02 §4). */
  memory?: AgentMemoryContext;
}

/** Mutable per-run state shared by the tools. */
export interface AgentRunState {
  blocks: AgentResultBlock[];
  transcript: AgentTranscriptStep[];
  sqlAttempts: number;
  sampleCalls: number;
  /** search_schema calls made this run (SPEC-02 §1.1, capped at maxSearchCalls). */
  searchCalls: number;
  /** Resolved budget for the run; tools read their caps from here (SPEC-02 §2). */
  budget: AgentBudget;
}

/** Per-run step/attempt caps. Two profiles are resolved by question complexity. */
export interface AgentBudget {
  maxSteps: number;
  maxSqlAttempts: number;
  maxSampleCalls: number;
  maxSearchCalls: number;
}

/**
 * Adaptive budget profiles (SPEC-02 §2). `standard` preserves the historical
 * fixed values; `extended` engages for complex, multi-part questions.
 */
export const AGENT_BUDGET_PROFILES: Record<"standard" | "extended", AgentBudget> = {
  standard: { maxSteps: 14, maxSqlAttempts: 8, maxSampleCalls: 8, maxSearchCalls: 3 },
  extended: { maxSteps: 22, maxSqlAttempts: 12, maxSampleCalls: 12, maxSearchCalls: 4 },
};

export type AgentBudgetProfile = keyof typeof AGENT_BUDGET_PROFILES;

/** Rows of a result fed back to the model; the UI always receives the full result. */
export const MODEL_ROW_SLICE = 50;

/** Enumeration / multi-part cues that push a question onto the extended budget. */
const COMPLEXITY_CUES = [
  " and ",
  " vs ",
  " versus ",
  "broken down by",
  "break down",
  "full picture",
  "report",
  "compare",
  "each ",
  "as well as",
  "along with",
];

/**
 * Cheap, no-LLM heuristic (SPEC-02 §2): long questions, multiple question marks,
 * or enumeration / multi-part cues select the extended budget. Everything else
 * stays on the standard budget so simple KPI questions keep their low latency.
 */
export function selectAgentBudgetProfile(question: string): AgentBudgetProfile {
  const normalized = question.toLowerCase();
  if (question.length > 200) return "extended";
  if ((question.match(/\?/g)?.length ?? 0) >= 2) return "extended";
  const cueHits = COMPLEXITY_CUES.filter((cue) => normalized.includes(cue)).length;
  if (cueHits >= 2) return "extended";
  return "standard";
}

/** Resolve the run budget: an explicit override wins, else the heuristic profile. */
export function resolveAgentBudget(question: string, override?: AgentBudget): {
  budget: AgentBudget;
  profile: AgentBudgetProfile | "override";
} {
  if (override) return { budget: override, profile: "override" };
  const profile = selectAgentBudgetProfile(question);
  return { budget: AGENT_BUDGET_PROFILES[profile], profile };
}
