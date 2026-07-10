import "server-only";

import { requireAdmin } from "@/lib/admin-auth";
import { adminDb } from "@/lib/db";
import {
  assertNoResultPayload,
  redactResultData,
  type ResultSummary,
} from "@/lib/queries/run-debug-redaction";

export {
  assertNoResultPayload,
  redactResultData,
} from "@/lib/queries/run-debug-redaction";

/**
 * Content-gated run debug DTO (SPEC-08 §5.4).
 * Never includes result row data — only redacted summaries.
 */
export interface RunDebugData {
  queryRunId: string;
  ownerUserId: string;
  conversationId: string;
  connectionId: string;
  connectionName: string | null;
  /** User content — only on this page after interstitial. */
  questionText: string | null;
  /** Generated SQL (JSON as stored) — user content, debug-only. */
  generatedQuery: unknown;
  status: string;
  statusVersion: number;
  validationResult: unknown;
  errorCode: string | null;
  errorMessage: string | null;
  timeline: {
    createdAt: Date;
    generatedAt: Date | null;
    startedAt: Date | null;
    finishedAt: Date | null;
  };
  resultSummary: ResultSummary;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    llmCallCount: number;
    agentSteps: number | null;
    sqlAttempts: number | null;
    budgetProfile: string | null;
    chartType: string | null;
    chartGenerated: boolean;
    primaryProvider: string | null;
    primaryModel: string | null;
  } | null;
  llmCalls: Array<{
    id: string;
    task: string;
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    latencyMs: number | null;
    attemptIndex: number | null;
    callOrdinal: number | null;
    success: boolean;
    createdAt: Date;
  }>;
}

export async function getRunDebug(
  ownerUserId: string,
  queryRunId: string,
): Promise<RunDebugData | null> {
  await requireAdmin();
  const db = adminDb();

  const run = await db.queryRun.findFirst({
    where: { id: queryRunId, ownerUserId },
  });
  if (!run) return null;

  const [message, usage, llmCalls, connection] = await Promise.all([
    db.message.findUnique({
      where: { id: run.triggeringMessageId },
      select: { content: true, role: true },
    }),
    db.queryRunUsage.findUnique({ where: { queryRunId } }),
    db.llmUsageRecord.findMany({
      where: { queryRunId },
      orderBy: [{ callOrdinal: "asc" }, { createdAt: "asc" }],
    }),
    db.databaseConnection.findUnique({
      where: { id: run.connectionId },
      select: { name: true },
    }),
  ]);

  const resultSummary = redactResultData({
    returnedRowCount: run.returnedRowCount,
    totalRowCount: run.totalRowCount,
    truncated: run.truncated,
    resultPreview: run.resultPreview,
    resultBlocks: run.resultBlocks,
  });

  const data: RunDebugData = {
    queryRunId: run.id,
    ownerUserId: run.ownerUserId,
    conversationId: run.conversationId,
    connectionId: run.connectionId,
    connectionName: connection?.name ?? null,
    questionText: message?.content ?? null,
    generatedQuery: run.generatedQuery,
    status: run.status,
    statusVersion: run.statusVersion,
    validationResult: run.validationResult,
    errorCode: run.errorCode,
    errorMessage: run.errorMessage,
    timeline: {
      createdAt: run.createdAt,
      generatedAt: run.generatedAt,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
    },
    resultSummary,
    usage: usage
      ? {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cachedInputTokens: usage.cachedInputTokens,
          llmCallCount: usage.llmCallCount,
          agentSteps: usage.agentSteps,
          sqlAttempts: usage.sqlAttempts,
          budgetProfile: usage.budgetProfile,
          chartType: usage.chartType,
          chartGenerated: usage.chartGenerated,
          primaryProvider: usage.primaryProvider,
          primaryModel: usage.primaryModel,
        }
      : null,
    llmCalls: llmCalls.map((c) => ({
      id: c.id,
      task: c.task,
      provider: c.provider,
      model: c.model,
      inputTokens: c.inputTokens,
      outputTokens: c.outputTokens,
      cachedInputTokens: c.cachedInputTokens,
      latencyMs: c.latencyMs,
      attemptIndex: c.attemptIndex,
      callOrdinal: c.callOrdinal,
      success: c.success,
      createdAt: c.createdAt,
    })),
  };

  assertNoResultPayload(data);
  return data;
}
