import { tool } from "ai";
import { z } from "zod";
import type { SchemaInfo, SchemaTable } from "@/types";
import { devLog } from "@query-wise/shared/observability";
import { retrieveCandidateTables } from "@/lib/retrieval/retrieval";
import type { TableCandidate } from "@/lib/retrieval/schema-context";
import type { AgentRunState, AnalystAgentEmitters } from "../types";
import { findTable } from "./schema-lookup";

/** How many ranked tables the search returns per call. */
const SEARCH_RESULT_LIMIT = 8;

/** First sentence of a table description, capped so index lines stay short. */
function oneSentence(text: string, max = 120): string {
  const firstSentence = text.trim().split(/(?<=[.!?])\s/)[0] ?? text.trim();
  const trimmed = firstSentence.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1).trimEnd()}…` : trimmed;
}

/**
 * A compact index line for one candidate table — name, description, row count,
 * key columns and related tables (SPEC-02 §1.1). Mirrors the Tier-A index line
 * so the agent sees a familiar shape.
 */
function candidateIndexLine(schema: SchemaInfo, candidate: TableCandidate): string {
  const table: SchemaTable | null = findTable(schema, candidate.tableName);
  const keyColumns = (table?.columns ?? candidate.columns)
    .filter((column) => column.isPrimaryKey || column.isForeignKey)
    .map((column) => column.name)
    .slice(0, 6);
  const related = schema.relationships
    .filter((r) => r.fromTable === candidate.tableName || r.toTable === candidate.tableName)
    .map((r) => (r.fromTable === candidate.tableName ? r.toTable : r.fromTable));
  const relatedUnique = [...new Set(related)].slice(0, 6);
  return [
    `- ${candidate.tableName}`,
    table?.description ? oneSentence(table.description) : null,
    typeof table?.rowCount === "number" ? `~${table.rowCount} rows` : null,
    `${(table?.columns ?? candidate.columns).length} cols`,
    keyColumns.length > 0 ? `keys: ${keyColumns.join(", ")}` : null,
    relatedUnique.length > 0 ? `related: ${relatedUnique.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

/**
 * `search_schema` (SPEC-02 §1.1): natural-language table discovery over the
 * relocated retrieval layer (pgvector with lexical fallback), scoped to the
 * connection. Lets the agent locate the right tables on a large schema without
 * the full schema ever being in the prompt. Capped at `maxSearchCalls` per run.
 */
export function createSearchSchemaTool(deps: {
  schema: SchemaInfo;
  state: AgentRunState;
  emitters: AnalystAgentEmitters;
  /** Injectable for tests; defaults to the pgvector/lexical retrieval layer. */
  retrieve?: (query: string, limit: number) => Promise<TableCandidate[]>;
}) {
  const { schema, state, emitters } = deps;
  const retrieve =
    deps.retrieve ??
    ((query: string, limit: number) => retrieveCandidateTables({ schema, question: query, limit }));
  return tool({
    description:
      "Find which tables hold the data you need by describing it in natural language. " +
      "Returns the most relevant tables as compact index lines. Call this first when you are " +
      "unsure which tables to use, before describe_tables.",
    inputSchema: z.object({
      query: z.string().trim().min(1).describe("Natural-language description of the data you are looking for"),
    }),
    execute: async ({ query }) => {
      if (state.searchCalls >= state.budget.maxSearchCalls) {
        return { error: "Schema search budget exhausted. Use describe_tables on the tables you have already seen." };
      }
      state.searchCalls += 1;
      const callId = `search_schema-${state.searchCalls}`;
      devLog("debug", "agent.tool.search_schema.started", `Searching schema: ${query}`, { query });
      emitters.onActivity?.({ kind: "tool-call", tool: "search_schema", callId, label: `Searching schema: ${query}`, input: { query } });

      let candidates: TableCandidate[];
      try {
        candidates = (await retrieve(query, SEARCH_RESULT_LIMIT)).slice(0, SEARCH_RESULT_LIMIT);
      } catch (error) {
        const message = error instanceof Error ? error.message : "search failed";
        devLog("error", "agent.tool.search_schema.error", `search_schema failed: ${message}`, {}, error);
        emitters.onActivity?.({ kind: "retry", tool: "search_schema", callId, label: message.slice(0, 120) });
        state.transcript.push({ tool: "search_schema", input: { query }, outcome: "error", summary: message });
        return { error: `Schema search failed: ${message}` };
      }

      const lines = candidates.map((candidate) => candidateIndexLine(schema, candidate));
      const summary = candidates.length > 0 ? `${candidates.length} tables` : "no matches";
      state.transcript.push({ tool: "search_schema", input: { query }, outcome: candidates.length > 0 ? "ok" : "error", summary });
      emitters.onActivity?.({ kind: "tool-result", tool: "search_schema", callId, label: summary });
      devLog("debug", "agent.tool.search_schema.completed", `search_schema completed`, { count: candidates.length });

      if (candidates.length === 0) {
        return { tables: [], note: "No tables matched. Try different keywords or inspect the Tier-A index in the prompt." };
      }
      return {
        tables: candidates.map((candidate) => candidate.tableName),
        index: lines.join("\n"),
        note: "Call describe_tables on the tables you want before writing SQL against them.",
      };
    },
  });
}
