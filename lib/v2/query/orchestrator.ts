import "server-only";
import type { Prisma } from "@prisma/client";
import { resolveChartConfig } from "@/lib/charts";
import { runConstrainedAnalystAgent } from "@/lib/llm";
import type { ExecuteQueryToolResult } from "@/lib/llm";
import {
  completeQueryRun,
  failQueryRun,
  getOwnedQueryRun,
  transitionQueryRun,
} from "@/lib/v2/query-runs";
import { recentConversationHistory } from "@/lib/v2/conversations";
import { AppError } from "@/lib/v2/dal/core";
import type { BoundedQueryResult, ChartConfig, ProviderQuery } from "@/types/v2";
import { createResultPreview } from "./preview";
import { getQueryRuntimeDependencies } from "./runtime";
import { statusEvent, type QueryStreamEmitter } from "./sse";

function safeFailure(error: unknown): { code: string; message: string } {
  if (error instanceof AppError) return { code: error.code, message: error.message };
  return { code: "INTERNAL_ERROR", message: "The query could not be completed." };
}

function toV2ChartConfig(chart: ReturnType<typeof resolveChartConfig>): ChartConfig {
  return {
    schemaVersion: 1,
    type: chart.type,
    xKey: chart.xKey,
    yKey: chart.yKey,
    yKeys: chart.yKeys,
    nameKey: chart.nameKey,
    valueKey: chart.valueKey,
    title: chart.title,
  };
}

export async function executeDurableQueryRun(input: {
  queryRunId: string;
  question: string;
  provider: "google" | "anthropic";
  model: string;
  apiKey: string;
  emit?: QueryStreamEmitter;
}) {
  const { emit } = input;
  let run = await getOwnedQueryRun(input.queryRunId);
  if (run.status === "succeeded" || run.status === "failed" || run.status === "cancelled" || run.status === "expired") {
    emit?.(run.status === "succeeded" ? "completed" : "failed", { status: run.status, statusVersion: run.statusVersion });
    return run;
  }

  try {
    run = await transitionQueryRun(run.id, "preparing");
    emit?.("status", statusEvent(run.status, run.statusVersion));
    const runtime = getQueryRuntimeDependencies();
    const context = {
      ownerUserId: run.ownerUserId,
      connectionId: run.connectionId,
      providerId: run.providerId,
      dialectId: run.dialectId,
    };
    const [schema, history] = await Promise.all([
      runtime.loadGenerationSchema(context),
      recentConversationHistory(run.conversationId),
    ]);

    run = await transitionQueryRun(run.id, "generating");
    emit?.("status", statusEvent(run.status, run.statusVersion));
    let boundedResult: BoundedQueryResult | null = null;
    let providerQuery: ProviderQuery | null = null;
    const agent = await runConstrainedAnalystAgent({
      question: input.question,
      history,
      schema,
      provider: input.provider,
      model: input.model,
      apiKey: input.apiKey,
      onTextDelta: (chunk) => emit?.("text-delta", { chunk }),
      onStage: (label) => emit?.("status", { status: run.status, statusVersion: run.statusVersion, label }),
      executeQueryTool: async (toolQuestion): Promise<ExecuteQueryToolResult> => {
        const { generateSQL } = await import("@/lib/llm");
        const text = await generateSQL({
          question: toolQuestion,
          history,
          schema,
          provider: input.provider,
          model: input.model,
          apiKey: input.apiKey,
        });
        providerQuery = { kind: "sql", dialectId: "postgresql", text };
        run = await transitionQueryRun(run.id, "validating", {
          generatedQuery: providerQuery as unknown as Prisma.InputJsonValue,
          generatedAt: new Date(),
        });
        emit?.("sql-preview", { dialectId: "postgresql", language: "sql", text, validation: "pending" });
        run = await transitionQueryRun(run.id, "executing");
        emit?.("status", statusEvent(run.status, run.statusVersion));
        boundedResult = await runtime.executeValidatedReadQuery(context, providerQuery);
        emit?.("query-stats", {
          rowCount: boundedResult.returnedRowCount,
          executionTimeMs: boundedResult.executionTimeMs,
          truncated: boundedResult.truncated,
        });
        return {
          sql: text,
          columns: boundedResult.columns.map((column) => column.name),
          rows: boundedResult.rows,
          rowCount: boundedResult.returnedRowCount,
          executionTimeMs: boundedResult.executionTimeMs,
        };
      },
    });

    run = await transitionQueryRun(run.id, "persisting");
    emit?.("status", statusEvent(run.status, run.statusVersion));
    const completedResult = boundedResult as BoundedQueryResult | null;
    const completedQuery = providerQuery as ProviderQuery | null;
    if (!completedResult || !completedQuery || agent.mode !== "query" || !agent.toolResult) {
      run = await completeQueryRun({
        queryRunId: run.id,
        assistantContent: agent.explanation,
        metadata: { schemaVersion: 1 },
        resultPreview: { schemaVersion: 1, conversationOnly: true } as unknown as Prisma.InputJsonValue,
      });
    } else {
      const resultForChart = {
        columns: completedResult.columns.map((column) => column.name),
        rows: completedResult.rows,
        rowCount: completedResult.returnedRowCount,
        executionTimeMs: completedResult.executionTimeMs,
      };
      const chartConfig = toV2ChartConfig(resolveChartConfig(resultForChart, agent.chartHint));
      const preview = createResultPreview(completedResult);
      run = await completeQueryRun({
        queryRunId: run.id,
        assistantContent: agent.explanation,
        metadata: { schemaVersion: 1, chartConfig } as unknown as Prisma.InputJsonValue,
        generatedQuery: completedQuery as unknown as Prisma.InputJsonValue,
        resultPreview: preview as unknown as Prisma.InputJsonValue,
        returnedRowCount: completedResult.returnedRowCount,
        totalRowCount: completedResult.totalRowCount,
        truncated: completedResult.truncated || preview.truncated,
        executionTimeMs: completedResult.executionTimeMs,
      });
    }
    emit?.("completed", { status: run.status, statusVersion: run.statusVersion });
    return run;
  } catch (error) {
    const failure = safeFailure(error);
    run = await failQueryRun(run.id, failure.code, failure.message);
    emit?.("failed", { status: run.status, statusVersion: run.statusVersion, error: failure });
    return run;
  }
}
