import "server-only";
import type { Prisma } from "@prisma/client";
import { failQueryRun, getOwnedQueryRun, transitionQueryRun } from "@/lib/query-runs";
import { recentConversationHistory } from "@/lib/conversations";
import { getQueryRuntimeDependencies } from "./runtime";
import { type QueryStreamEmitter } from "./sse";
import { devLog, devLogError } from "@query-wise/shared/observability";
import { getBackendLlmConfig } from "@/lib/llm/client";
import { runAgentQueryRun } from "./agent-run";
import { AgentExecutionError } from "@/lib/llm/agent/types";
import { elapsedMs } from "./run-helpers";
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
  } catch (error) {
    const failure = toUserFacingError(error);
    devLogError("query.run.failed", "Durable query run failed.", error, {
      queryRunId: run.id,
      status: run.status,
      errorCode: failure.code,
    });
    let partialMetadata: Prisma.InputJsonValue | undefined;
    if (error instanceof AgentExecutionError) {
      partialMetadata = {
        schemaVersion: 3,
        agentV3: {
          transcript: error.partialResult.transcript,
          mode: error.partialResult.mode,
        },
      } as unknown as Prisma.InputJsonValue;
    }

    run = await failQueryRun(run.id, failure.code, failure.message, partialMetadata);
    emit?.("failed", { status: run.status, statusVersion: run.statusVersion, error: failure });
    return run;
  } finally {
    unregisterActiveQueryRun(run.id);
  }
}
