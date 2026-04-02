import { resolveChartConfig } from "@/lib/charts";
import { executeQuery, validateAndSanitizeSql } from "@/lib/db";
import { generateSQL, runConstrainedAnalystAgent } from "@/lib/llm/index";
import { logEvent } from "@/lib/logger";
import type { QueryResponse } from "@/types";

import {
  isStructuredOutputParseFailure,
} from "./error-mapping";
import { getCachedSchema } from "./schema-cache";
import type { QueryRequestInput, StreamEmitter } from "./contracts";

export async function executeQueryFlow(
  input: QueryRequestInput,
  emit?: StreamEmitter,
): Promise<QueryResponse> {
  const { question, history, connectionString, provider, model, apiKey } = input;

  emit?.("stage", { label: "Analyzing request" });
  logEvent({
    type: "USER_QUERY",
    timestamp: new Date().toISOString(),
    message: question,
    meta: { history, connectionString, provider, model },
  });

  const schema = await getCachedSchema(connectionString);
  emit?.("stage", { label: "Preparing schema context" });

  const runSqlQuestion = async (toolQuestion: string) => {
    try {
      const sql = await generateSQL({
        question: toolQuestion,
        schema,
        history,
        provider,
        model,
        apiKey,
      });

      logEvent({
        type: "LLM_RESPONSE",
        timestamp: new Date().toISOString(),
        message: sql,
        meta: { tool: "execute_query", question: toolQuestion, model },
      });

      emit?.("sql", { sql });

      const validation = validateAndSanitizeSql(sql);
      if (!validation.valid) {
        throw new Error(validation.reason ?? "Query blocked");
      }

      emit?.("stage", { label: "Executing SQL" });
      const result = await executeQuery(sql, connectionString);

      emit?.("query_stats", {
        rowCount: result.rowCount,
        executionTimeMs: result.executionTimeMs,
      });

      logEvent({
        type: "SQL_QUERY",
        timestamp: new Date().toISOString(),
        message: sql,
        meta: { connectionString, model, rowCount: result.rowCount },
      });

      return {
        sql,
        columns: result.columns,
        rows: result.rows,
        rowCount: result.rowCount,
        executionTimeMs: result.executionTimeMs,
      };
    } catch (error) {
      logEvent({
        type: "ERROR",
        timestamp: new Date().toISOString(),
        message: error instanceof Error ? error.message : String(error),
        meta: {
          stack: error instanceof Error ? error.stack : undefined,
          tool: "execute_query",
          toolQuestion,
        },
      });
      throw error;
    }
  };

  let agentTurn;
  try {
    agentTurn = await runConstrainedAnalystAgent({
      question,
      history,
      schema,
      provider,
      model,
      apiKey,
      onTextDelta: (chunk) => {
        emit?.("text_delta", { chunk });
      },
      onStage: (label) => {
        emit?.("stage", { label });
      },
      executeQueryTool: async (toolQuestion) => runSqlQuestion(toolQuestion),
    });
  } catch (error) {
    if (!isStructuredOutputParseFailure(error)) {
      throw error;
    }

    emit?.("stage", { label: "Recovering from model format error" });
    const fallbackResult = await runSqlQuestion(question);
    emit?.("stage", { label: "Selecting chart" });

    const finalResult = {
      columns: fallbackResult.columns,
      rows: fallbackResult.rows,
      rowCount: fallbackResult.rowCount,
      executionTimeMs: fallbackResult.executionTimeMs,
    };

    const chartConfig = resolveChartConfig(finalResult);
    const explanation = `Found ${finalResult.rowCount.toLocaleString()} result${finalResult.rowCount === 1 ? "" : "s"} for: ${question}`;

    return {
      mode: "query",
      explanation,
      sql: fallbackResult.sql,
      result: finalResult,
      chartConfig,
    };
  }

  logEvent({
    type: "LLM_RESPONSE",
    timestamp: new Date().toISOString(),
    message: agentTurn.explanation,
    meta: { mode: agentTurn.mode, chartHint: agentTurn.chartHint },
  });

  if (agentTurn.mode === "query" && agentTurn.toolResult) {
    emit?.("stage", { label: "Selecting chart" });

    const finalResult = {
      columns: agentTurn.toolResult.columns,
      rows: agentTurn.toolResult.rows,
      rowCount: agentTurn.toolResult.rowCount,
      executionTimeMs: agentTurn.toolResult.executionTimeMs,
    };

    const chartConfig = resolveChartConfig(finalResult, agentTurn.chartHint);

    logEvent({
      type: "CHART_RENDER",
      timestamp: new Date().toISOString(),
      message: chartConfig.type,
      meta: { chartConfig, chartHint: agentTurn.chartHint },
    });

    const response: QueryResponse = {
      mode: "query",
      explanation: agentTurn.explanation,
      sql: agentTurn.toolResult.sql,
      result: finalResult,
      chartConfig,
    };

    logEvent({
      type: "INFO",
      timestamp: new Date().toISOString(),
      message: "Query completed",
      meta: {
        question,
        sql: agentTurn.toolResult.sql,
        chartType: chartConfig.type,
        rowCount: finalResult.rowCount,
      },
    });

    return response;
  }

  const response: QueryResponse = {
    mode: "conversation",
    explanation: agentTurn.explanation,
  };

  logEvent({
    type: "INFO",
    timestamp: new Date().toISOString(),
    message: "Conversation response (no SQL execution)",
    meta: { question },
  });

  return response;
}
