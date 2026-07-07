import { tool } from "ai";
import { z } from "zod";
import { devLog } from "@query-wise/shared/observability";
import { getErrorMessage } from "../../client";
import type { AgentRunState, AnalystAgentEmitters, AnalystAgentRuntime } from "../types";

/** Above this estimated total cost a plan is flagged as likely to time out. */
const COST_WARNING_THRESHOLD = 1e6;

/**
 * `explain_query` (SPEC-02 §1.2): estimate a statement's cost via
 * `EXPLAIN (FORMAT JSON)` — never ANALYZE — so the agent can rewrite an
 * expensive query (big cross join, unfiltered scan) before it times out.
 * Shares the read-only validate→execute path of run_sql via `runtime.explainSql`.
 */
export function createExplainQueryTool(deps: {
  state: AgentRunState;
  runtime: AnalystAgentRuntime;
  emitters: AnalystAgentEmitters;
}) {
  const { state, runtime, emitters } = deps;
  return tool({
    description:
      "Estimate the cost of a read-only SELECT/WITH statement WITHOUT running it (EXPLAIN, no ANALYZE). " +
      "Returns estimated total cost and row count, and flags plans likely to time out. " +
      "Call this before a query that joins 3+ tables or scans a very large table.",
    inputSchema: z.object({
      sql: z.string().trim().min(1).describe("The SELECT/WITH statement to estimate (not executed)"),
    }),
    execute: async ({ sql }) => {
      const callId = `explain_query-${state.transcript.length}`;
      devLog("debug", "agent.tool.explain_query.started", "Explaining query.", { sql });
      emitters.onActivity?.({ kind: "tool-call", tool: "explain_query", callId, label: "Estimating query cost", input: { sql } });

      try {
        const outcome = await runtime.explainSql(sql);
        if (!outcome) {
          state.transcript.push({ tool: "explain_query", input: { sql }, outcome: "error", summary: "no plan returned" });
          emitters.onActivity?.({ kind: "retry", tool: "explain_query", callId, label: "No plan returned" });
          return { error: "Could not obtain a query plan. Check the SQL is a valid read-only statement." };
        }
        const expensive = outcome.totalCost > COST_WARNING_THRESHOLD;
        const flag = expensive
          ? "likely to time out — add filters, aggregate in the database, or pre-aggregate before joining"
          : "cost is within normal range";
        const summary = `cost ~${Math.round(outcome.totalCost).toLocaleString()}, ~${Math.round(outcome.planRows).toLocaleString()} rows${expensive ? " (expensive)" : ""}`;
        state.transcript.push({ tool: "explain_query", input: { sql }, outcome: "ok", summary });
        emitters.onActivity?.({ kind: "tool-result", tool: "explain_query", callId, label: summary });
        devLog("debug", "agent.tool.explain_query.completed", "explain_query completed", { ...outcome, expensive });
        return {
          estimatedTotalCost: Math.round(outcome.totalCost),
          estimatedRows: Math.round(outcome.planRows),
          expensive,
          flag,
        };
      } catch (error) {
        const message = getErrorMessage(error) || "EXPLAIN failed.";
        state.transcript.push({ tool: "explain_query", input: { sql }, outcome: "error", summary: message });
        emitters.onActivity?.({ kind: "retry", tool: "explain_query", callId, label: message.slice(0, 120) });
        devLog("error", "agent.tool.explain_query.error", `explain_query failed: ${message}`, {}, error);
        return { error: `Could not estimate the query: ${message}. Fix the SQL and retry, or run it directly.` };
      }
    },
  });
}
