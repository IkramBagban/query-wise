import "server-only";
import type { Prisma } from "@prisma/client";
import { resolveChartConfig } from "@/lib/charts";
import {
  completeQueryRun,
  failQueryRun,
  getOwnedQueryRun,
  recordQueryValidation,
  transitionQueryRun,
} from "@/lib/v2/query-runs";
import { needsGeneratedConversationTitle, recentConversationHistory } from "@/lib/v2/conversations";
import { explainStagedNlSqlResult, planStagedNlSqlQuery } from "@/lib/v2/nl-sql";
import { AppError } from "@/lib/v2/dal/core";
import type { BoundedQueryResult, ChartConfig, ProviderQuery } from "@/types/v2";
import { createResultPreview } from "./preview";
import { getQueryRuntimeDependencies } from "./runtime";
import { statusEvent, type QueryStreamEmitter } from "./sse";
import { devLog, devLogError } from "@/lib/v2/observability";
import { generateConversationTitle } from "@/lib/llm/title";
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

function elapsedMs(startedAt: number): number {
  return Date.now() - startedAt;
}

async function createInitialConversationTitle(input: {
  userMessage: string;
  assistantMessage: string;
  provider: "google" | "anthropic";
  model: string;
  apiKey: string;
  abortSignal: AbortSignal;
  queryRunId: string;
  conversationId: string;
}): Promise<string | undefined> {
  try {
    if (!(await needsGeneratedConversationTitle(input.conversationId))) {
      return undefined;
    }
    const title = await generateConversationTitle(input);
    return title || undefined;
  } catch (error) {
    devLogError("conversation.title.generation-failed", "Conversation title generation failed.", error, {
      queryRunId: input.queryRunId,
    });
    return undefined;
  }
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
    const runStartedAt = Date.now();
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
    const loadStartedAt = Date.now();
    const [schema, history] = await Promise.all([
      runtime.loadGenerationSchema(context),
      recentConversationHistory(run.conversationId),
    ]);
    devLog("info", "query.run.context-loaded", "Query run context loaded.", {
      queryRunId: run.id,
      connectionId: run.connectionId,
      durationMs: elapsedMs(loadStartedAt),
      schemaTableCount: schema.tables.length,
      historyTurnCount: history.length,
    });

    run = await transitionQueryRun(run.id, "generating");
    throwIfQueryRunAborted(abortSignal);
    emit?.("status", statusEvent(run.status, run.statusVersion));
    const llm = {
      provider: input.provider,
      model: input.model,
      apiKey: input.apiKey,
      abortSignal,
    };
    const planningStartedAt = Date.now();
    const plan = await planStagedNlSqlQuery({
      question: input.question,
      history,
      schema,
      llm,
      onStage: (label) => emit?.("status", { status: run.status, statusVersion: run.statusVersion, label }),
    });
    devLog("info", "query.run.planning-completed", "Query run NL-to-SQL planning completed.", {
      queryRunId: run.id,
      connectionId: run.connectionId,
      durationMs: elapsedMs(planningStartedAt),
      mode: plan.mode,
      candidateTableCount: plan.retrieval.candidateTableCount,
      selectedTableCount: plan.retrieval.selectedTables.length,
      prunedTableCount: plan.retrieval.prunedTables.length,
    });

    if (plan.mode === "conversation" || !plan.sql) {
      const assistantContent = plan.directAnswer ?? "I can help analyze your connected database when you ask a data question.";
      const conversationTitle = await createInitialConversationTitle({
        userMessage: input.question,
        assistantMessage: assistantContent,
        provider: input.provider,
        model: input.model,
        apiKey: input.apiKey,
        abortSignal,
        queryRunId: run.id,
        conversationId: run.conversationId,
      });
      const persistenceStartedAt = Date.now();
      run = await transitionQueryRun(run.id, "persisting");
      throwIfQueryRunAborted(abortSignal);
      emit?.("status", statusEvent(run.status, run.statusVersion));
      run = await completeQueryRun({
        queryRunId: run.id,
        assistantContent,
        conversationTitle,
        metadata: { schemaVersion: 1, nlSqlPipeline: plan.retrieval } as unknown as Prisma.InputJsonValue,
      });
      devLog("info", "query.run.conversation-persisted", "Query run conversational response persisted.", {
        queryRunId: run.id,
        durationMs: elapsedMs(persistenceStartedAt),
      });
    } else {
      const providerQuery: ProviderQuery = { kind: "sql", dialectId: "postgresql", text: plan.sql };
      run = await transitionQueryRun(run.id, "validating", {
        generatedQuery: providerQuery as unknown as Prisma.InputJsonValue,
        generatedAt: new Date(),
      });
      emit?.("status", statusEvent(run.status, run.statusVersion));
      throwIfQueryRunAborted(abortSignal);
      const validation = await runtime.validateReadQuery(context, providerQuery);
      run = await recordQueryValidation(run.id, {
        schemaVersion: 1,
        valid: validation.valid,
        violations: validation.violations,
      } as unknown as Prisma.InputJsonValue);
      emit?.("sql-preview", {
        dialectId: "postgresql",
        language: "sql",
        text: providerQuery.text,
        validation: validation.valid ? "valid" : "blocked",
      });
      if (!validation.valid || !validation.normalizedQuery) {
        throw new AppError(
          "QUERY_VALIDATION_BLOCKED",
          "The generated SQL violates the read-only safety policy.",
        );
      }
      run = await transitionQueryRun(run.id, "executing");
      throwIfQueryRunAborted(abortSignal);
      emit?.("status", statusEvent(run.status, run.statusVersion));
      const executionStartedAt = Date.now();
      const completedResult: BoundedQueryResult = await runtime.executeValidatedReadQuery(
        context,
        validation.normalizedQuery,
        abortSignal,
      );
      devLog("info", "query.run.sql-executed", "Query run SQL execution completed.", {
        queryRunId: run.id,
        connectionId: run.connectionId,
        durationMs: elapsedMs(executionStartedAt),
        returnedRowCount: completedResult.returnedRowCount,
        truncated: completedResult.truncated,
      });
      emit?.("query-stats", {
        rowCount: completedResult.returnedRowCount,
        executionTimeMs: completedResult.executionTimeMs,
        truncated: completedResult.truncated,
      });
      const explanationStartedAt = Date.now();
      const explanation = await explainStagedNlSqlResult({
        question: plan.standaloneQuestion,
        sql: providerQuery.text,
        result: completedResult,
        llm,
        onStage: (label) => emit?.("status", { status: run.status, statusVersion: run.statusVersion, label }),
      });
      devLog("info", "query.run.explanation-completed", "Query run explanation completed.", {
        queryRunId: run.id,
        durationMs: elapsedMs(explanationStartedAt),
        explanationLength: explanation.explanation.length,
        chartHintType: explanation.chartHint?.type ?? plan.chartHint?.type ?? null,
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
      const conversationTitle = await createInitialConversationTitle({
        userMessage: input.question,
        assistantMessage: explanation.explanation,
        provider: input.provider,
        model: input.model,
        apiKey: input.apiKey,
        abortSignal,
        queryRunId: run.id,
        conversationId: run.conversationId,
      });
      const persistenceStartedAt = Date.now();
      run = await transitionQueryRun(run.id, "persisting");
      throwIfQueryRunAborted(abortSignal);
      emit?.("status", statusEvent(run.status, run.statusVersion));
      run = await completeQueryRun({
        queryRunId: run.id,
        assistantContent: explanation.explanation,
        conversationTitle,
        metadata: { schemaVersion: 1, chartConfig, nlSqlPipeline: plan.retrieval } as unknown as Prisma.InputJsonValue,
        generatedQuery: providerQuery as unknown as Prisma.InputJsonValue,
        resultPreview: preview as unknown as Prisma.InputJsonValue,
        returnedRowCount: completedResult.returnedRowCount,
        totalRowCount: completedResult.totalRowCount,
        truncated: completedResult.truncated || preview.truncated,
        executionTimeMs: completedResult.executionTimeMs,
      });
      devLog("info", "query.run.result-persisted", "Query run result persisted.", {
        queryRunId: run.id,
        durationMs: elapsedMs(persistenceStartedAt),
        previewRowCount: preview.previewRowCount,
        chartType: chartConfig.type,
      });
    }
    emit?.("completed", { status: run.status, statusVersion: run.statusVersion });
    devLog("info", "query.run.succeeded", "Durable query run completed.", {
      queryRunId: run.id,
      status: run.status,
      returnedRowCount: run.returnedRowCount,
      executionTimeMs: run.executionTimeMs,
      durationMs: elapsedMs(runStartedAt),
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
