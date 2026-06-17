import "server-only";
import type { Prisma } from "@prisma/client";
import { resolveChartConfig } from "@/lib/charts";
import {
  completeQueryRun,
  failQueryRun,
  getOwnedQueryRun,
  transitionQueryRun,
} from "@/lib/v2/query-runs";
import { recentConversationHistory } from "@/lib/v2/conversations";
import { explainStagedNlSqlResult, planStagedNlSqlQuery } from "@/lib/v2/nl-sql";
import { AppError } from "@/lib/v2/dal/core";
import type { BoundedQueryResult, ChartConfig, ProviderQuery } from "@/types/v2";
import { createResultPreview } from "./preview";
import { getQueryRuntimeDependencies } from "./runtime";
import { statusEvent, type QueryStreamEmitter } from "./sse";
import { devLog, devLogError } from "@/lib/v2/observability";
import {
  registerActiveQueryRun,
  throwIfQueryRunAborted,
  unregisterActiveQueryRun,
} from "./cancellation";

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
  devLog("info", "query.run.started", "Durable query run started.", {
    queryRunId: run.id,
    conversationId: run.conversationId,
    connectionId: run.connectionId,
    provider: input.provider,
    model: input.model,
  });
  if (run.status === "succeeded" || run.status === "failed" || run.status === "cancelled" || run.status === "expired") {
    emit?.(run.status === "succeeded" ? "completed" : "failed", { status: run.status, statusVersion: run.statusVersion });
    return run;
  }
  const abortSignal = registerActiveQueryRun(run.id);

  try {
    throwIfQueryRunAborted(abortSignal);
    run = await transitionQueryRun(run.id, "preparing");
    throwIfQueryRunAborted(abortSignal);
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
    throwIfQueryRunAborted(abortSignal);
    emit?.("status", statusEvent(run.status, run.statusVersion));
    const llm = {
      provider: input.provider,
      model: input.model,
      apiKey: input.apiKey,
      abortSignal,
    };
    const plan = await planStagedNlSqlQuery({
      question: input.question,
      history,
      schema,
      llm,
      onStage: (label) => emit?.("status", { status: run.status, statusVersion: run.statusVersion, label }),
    });

    if (plan.mode === "conversation" || !plan.sql) {
      run = await transitionQueryRun(run.id, "persisting");
      throwIfQueryRunAborted(abortSignal);
      emit?.("status", statusEvent(run.status, run.statusVersion));
      run = await completeQueryRun({
        queryRunId: run.id,
        assistantContent: plan.directAnswer ?? "I can help analyze your connected database when you ask a data question.",
        metadata: { schemaVersion: 1, nlSqlPipeline: plan.retrieval } as unknown as Prisma.InputJsonValue,
      });
    } else {
      const providerQuery: ProviderQuery = { kind: "sql", dialectId: "postgresql", text: plan.sql };
      run = await transitionQueryRun(run.id, "validating", {
        generatedQuery: providerQuery as unknown as Prisma.InputJsonValue,
        generatedAt: new Date(),
      });
      emit?.("sql-preview", { dialectId: "postgresql", language: "sql", text: providerQuery.text, validation: "pending" });
      run = await transitionQueryRun(run.id, "executing");
      throwIfQueryRunAborted(abortSignal);
      emit?.("status", statusEvent(run.status, run.statusVersion));
      const completedResult: BoundedQueryResult = await runtime.executeValidatedReadQuery(context, providerQuery, abortSignal);
      emit?.("query-stats", {
        rowCount: completedResult.returnedRowCount,
        executionTimeMs: completedResult.executionTimeMs,
        truncated: completedResult.truncated,
      });
      const explanation = await explainStagedNlSqlResult({
        question: plan.standaloneQuestion,
        sql: providerQuery.text,
        result: completedResult,
        llm,
        onStage: (label) => emit?.("status", { status: run.status, statusVersion: run.statusVersion, label }),
      });
      emit?.("text-delta", { chunk: explanation.explanation });
      const resultForChart = {
        columns: completedResult.columns.map((column) => column.name),
        rows: completedResult.rows,
        rowCount: completedResult.returnedRowCount,
        executionTimeMs: completedResult.executionTimeMs,
      };
      const chartConfig = toV2ChartConfig(resolveChartConfig(resultForChart, explanation.chartHint ?? plan.chartHint));
      const preview = createResultPreview(completedResult);
      run = await transitionQueryRun(run.id, "persisting");
      throwIfQueryRunAborted(abortSignal);
      emit?.("status", statusEvent(run.status, run.statusVersion));
      run = await completeQueryRun({
        queryRunId: run.id,
        assistantContent: explanation.explanation,
        metadata: { schemaVersion: 1, chartConfig, nlSqlPipeline: plan.retrieval } as unknown as Prisma.InputJsonValue,
        generatedQuery: providerQuery as unknown as Prisma.InputJsonValue,
        resultPreview: preview as unknown as Prisma.InputJsonValue,
        returnedRowCount: completedResult.returnedRowCount,
        totalRowCount: completedResult.totalRowCount,
        truncated: completedResult.truncated || preview.truncated,
        executionTimeMs: completedResult.executionTimeMs,
      });
    }
    emit?.("completed", { status: run.status, statusVersion: run.statusVersion });
    devLog("info", "query.run.succeeded", "Durable query run completed.", {
      queryRunId: run.id,
      status: run.status,
      returnedRowCount: run.returnedRowCount,
      executionTimeMs: run.executionTimeMs,
    });
    return run;
  } catch (error) {
    const failure = safeFailure(error);
    devLogError("query.run.failed", "Durable query run failed.", error, {
      queryRunId: run.id,
      status: run.status,
      errorCode: failure.code,
    });
    run = await failQueryRun(run.id, failure.code, failure.message);
    emit?.("failed", { status: run.status, statusVersion: run.statusVersion, error: failure });
    return run;
  } finally {
    unregisterActiveQueryRun(run.id);
  }
}
