import "server-only";
import type { Prisma } from "@prisma/client";
import { resolveChartConfig } from "@/lib/charts";
import {
  completeQueryRun,
  failQueryRun,
  getOwnedQueryRun,
  recordQueryValidation,
  transitionQueryRun,
} from "@/lib/query-runs";
import { recentConversationHistory } from "@/lib/conversations";
import { beginExplainStream, planStagedNlSqlQuery } from "@/lib/nl-sql";
import { AppError } from "@query-wise/shared/dal/core";
import type { BoundedQueryResult, ProviderQuery } from "@query-wise/shared/types";
import { createResultPreview } from "./preview";
import { getQueryRuntimeDependencies } from "./runtime";
import { statusEvent, type QueryStreamEmitter } from "./sse";
import { devLog, devLogError } from "@query-wise/shared/observability";
import { getBackendLlmConfig } from "@/lib/llm/client";
import { runAgentQueryRun } from "./agent-run";
import { elapsedMs, generateAndPersistTitle, toV2ChartConfig } from "./run-helpers";
import {
  registerActiveQueryRun,
  throwIfQueryRunAborted,
  unregisterActiveQueryRun,
} from "./cancellation";
import { toUserFacingError } from "./error-mapping";

export async function executeDurableQueryRun(input: {
  queryRunId: string;
  question: string;
  emit?: QueryStreamEmitter;
}) {
  const { emit } = input;
  const llmConfig = getBackendLlmConfig();

  let run = await getOwnedQueryRun(input.queryRunId);
  devLog("info", "query.run.started", "Durable query run started.", {
    queryRunId: run.id,
    conversationId: run.conversationId,
    connectionId: run.connectionId,
    provider: llmConfig.provider,
    model: llmConfig.model,
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

    if (process.env.QUERYWISE_AGENT_V3 === "true") {
      run = await runAgentQueryRun({
        run,
        context,
        runtime,
        schema,
        history,
        question: input.question,
        emit,
        abortSignal,
      });
      devLog("info", "query.run.succeeded", "Durable query run completed.", {
        queryRunId: run.id,
        status: run.status,
        returnedRowCount: run.returnedRowCount,
        executionTimeMs: run.executionTimeMs,
        durationMs: elapsedMs(runStartedAt),
      });
      return run;
    }

    const llm = {
      provider: llmConfig.provider,
      model: llmConfig.model,
      apiKey: llmConfig.apiKey,
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

    let explanationText = "";
    if (plan.mode === "conversation" || !plan.sql) {
      const assistantContent = plan.directAnswer ?? "I can help analyze your connected database when you ask a data question.";
      const persistenceStartedAt = Date.now();
      run = await transitionQueryRun(run.id, "persisting");
      throwIfQueryRunAborted(abortSignal);
      emit?.("status", statusEvent(run.status, run.statusVersion));
      run = await completeQueryRun({
        queryRunId: run.id,
        assistantContent,
        metadata: { schemaVersion: 1, nlSqlPipeline: plan.retrieval } as unknown as Prisma.InputJsonValue,
      });
      await generateAndPersistTitle({
        conversationId: run.conversationId,
        userMessage: input.question,
        assistantMessage: assistantContent,
        abortSignal,
        queryRunId: run.id,
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
      const [explanationStream, chartHintPromise] = beginExplainStream({
        question: plan.standaloneQuestion,
        sql: providerQuery.text,
        result: completedResult,
        llm,
        onStage: (label) => emit?.("status", { status: run.status, statusVersion: run.statusVersion, label }),
      });

      for await (const chunk of explanationStream) {
        explanationText += chunk;
        emit?.("text-delta", { chunk });
      }
      const chartHint = await chartHintPromise;

      if (!explanationText.trim()) {
        throw new AppError("QUERY_GENERATION_FAILED", "The explanation model returned no content.");
      }

      devLog("info", "query.run.explanation-completed", "Query run explanation completed.", {
        queryRunId: run.id,
        durationMs: elapsedMs(explanationStartedAt),
        explanationLength: explanationText.length,
        chartHintType: chartHint?.type ?? plan.chartHint?.type ?? null,
      });
      const resultForChart = {
        columns: completedResult.columns.map((column) => column.name),
        rows: completedResult.rows,
        rowCount: completedResult.returnedRowCount,
        executionTimeMs: completedResult.executionTimeMs,
      };
      const chartConfig = toV2ChartConfig(resolveChartConfig(resultForChart, chartHint ?? plan.chartHint));
      const preview = createResultPreview(completedResult);
      const persistenceStartedAt = Date.now();
      run = await transitionQueryRun(run.id, "persisting");
      throwIfQueryRunAborted(abortSignal);
      emit?.("status", statusEvent(run.status, run.statusVersion));
      run = await completeQueryRun({
        queryRunId: run.id,
        assistantContent: explanationText,
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
    if (plan.mode !== "conversation" && plan.sql) {
      void generateAndPersistTitle({
        conversationId: run.conversationId,
        userMessage: input.question,
        assistantMessage: explanationText,
        abortSignal,
        queryRunId: run.id,
      });
    }
    devLog("info", "query.run.succeeded", "Durable query run completed.", {
      queryRunId: run.id,
      status: run.status,
      returnedRowCount: run.returnedRowCount,
      executionTimeMs: run.executionTimeMs,
      durationMs: elapsedMs(runStartedAt),
    });
    return run;
  } catch (error) {
    const failure = toUserFacingError(error);
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
