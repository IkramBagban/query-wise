import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma, type QueryRun } from "@prisma/client";
import { getAppDb, withAppDbTransaction } from "@query-wise/shared/app-db";
import { requireUser } from "@/lib/auth";
import { appendMessage, DEFAULT_CONVERSATION_TITLE } from "@/lib/conversations";
import { assertConnectionNotDeleted } from "@/lib/connections/deleted-guard";
import { AppError, requireFound, resourceNotFound } from "@query-wise/shared/dal/core";
import { ChartConfigSchema } from "@/lib/dashboards/schemas";
import type { QueryResultBlock, QueryRunDto, QueryRunStatus } from "@query-wise/shared/types";
import { getUserPlan, recordQuestionTerminal, reserveQuestionQuota } from "@query-wise/shared/plans";
import { recordMetricEvent } from "@query-wise/shared/metrics";
import { TERMINAL_QUERY_RUN_STATUSES, type QuerySubmission } from "./types";
import { abortActiveQueryRun } from "@/lib/query/cancellation";
import { writeAuditLog } from "@/lib/audit";

/** Codes that indicate an accept was refused by plan enforcement (for metrics). */
const QUOTA_BLOCK_CODES = new Set<string>([
  "QUOTA_EXCEEDED_DAILY",
  "QUOTA_EXCEEDED_MONTHLY",
  "ACCOUNT_DISABLED",
]);

const STALE_QUERY_RUN_MS = 5 * 60_000;
const DEFAULT_RECOVERY_BATCH_SIZE = 25;
const MAX_RECOVERY_BATCH_SIZE = 100;
const RECOVERY_ERROR_CODE = "QUERY_EXECUTION_FAILED";
const RECOVERY_ASSISTANT_MESSAGE =
  "The query run expired before it could complete. Submit the question again to retry.";

export function queryRunDto(run: QueryRun): QueryRunDto {
  return {
    contractVersion: "querywise.v2",
    id: run.id,
    conversationId: run.conversationId,
    connectionId: run.connectionId,
    triggeringMessageId: run.triggeringMessageId,
    responseMessageId: run.responseMessageId,
    idempotencyKey: run.idempotencyKey,
    status: run.status,
    statusVersion: run.statusVersion,
    providerId: run.providerId as QueryRunDto["providerId"],
    dialectId: run.dialectId as QueryRunDto["dialectId"],
    generatedQuery: run.generatedQuery as unknown as QueryRunDto["generatedQuery"],
    resultPreview: run.resultPreview as unknown as QueryRunDto["resultPreview"],
    resultBlocks: run.resultBlocks as unknown as QueryRunDto["resultBlocks"],
    returnedRowCount: run.returnedRowCount,
    totalRowCount: run.totalRowCount == null ? null : Number(run.totalRowCount),
    truncated: run.truncated,
    executionTimeMs: run.executionTimeMs,
    generatedAt: run.generatedAt?.toISOString() ?? null,
    startedAt: run.startedAt?.toISOString() ?? null,
    finishedAt: run.finishedAt?.toISOString() ?? null,
    errorCode: run.errorCode,
    errorMessage: run.errorMessage,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  };
}

function fingerprint(input: QuerySubmission): string {
  return createHash("sha256").update(JSON.stringify({
    conversationId: input.conversationId,
    question: input.question.trim(),
  })).digest("hex");
}

/**
 * Atomically accepts one logical query submission.
 *
 * A first submission appends the user's message and creates its durable QueryRun.
 * A retry with the same key and payload returns that run without adding another
 * message; reusing the key for a different payload is rejected.
 */
export async function acceptQuerySubmission(input: QuerySubmission): Promise<{
  run: QueryRun;
  created: boolean;
}> {
  const { userId } = await requireUser();
  const requestFingerprint = fingerprint(input);
  let result: { run: QueryRun; created: boolean };
  try {
    result = await withAppDbTransaction(async (tx) => {
    // Serialize concurrent retries before the unique-key lookup. This transaction-
    // scoped PostgreSQL lock is released automatically on commit or rollback.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${userId}:${input.conversationId}:${input.idempotencyKey}`}))`;
    const existing = await tx.queryRun.findUnique({
      where: {
        ownerUserId_conversationId_idempotencyKey: {
          ownerUserId: userId,
          conversationId: input.conversationId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) {
        throw new AppError("IDEMPOTENCY_KEY_REUSED", "The idempotency key was already used for a different request.");
      }
      return { run: existing, created: false };
    }

    // Ownership and soft-delete checks happen inside the same transaction as the
    // message/run creation, so acceptance cannot produce a partial submission.
    const conversation = requireFound(await tx.conversation.findFirst({
      where: { id: input.conversationId, ownerUserId: userId, deletedAt: null },
    }));
    // SPEC-13 §4: defense in depth. Reads degrade to read-only history, but every
    // write/execute path hard-rejects a conversation whose data source was deleted.
    const connection = requireFound(await tx.databaseConnection.findFirst({
      where: { id: conversation.connectionId, ownerUserId: userId },
      select: { deletedAt: true },
    }));
    assertConnectionNotDeleted(connection);
    // Entitlement gate: resolve the plan (lazily creating a Free row) and reserve
    // one question against the daily+monthly caps BEFORE any expensive work. This
    // runs after the idempotency short-circuit so retries of an existing run never
    // re-count. A disabled account is fail-closed. Throwing rolls back the whole
    // accept transaction, so no message/run is created when quota is exhausted.
    const plan = await getUserPlan(userId, tx);
    if (plan.status === "disabled") {
      throw new AppError("ACCOUNT_DISABLED", "This account is disabled. Contact support.");
    }
    await reserveQuestionQuota(tx, {
      userId,
      questionsPerDay: plan.limits.questionsPerDay,
      questionsPerMonth: plan.limits.questionsPerMonth,
    });
    const triggeringMessage = await appendMessage(tx, {
      conversationId: conversation.id,
      role: "user",
      content: input.question,
    });
    const run = await tx.queryRun.create({
      data: {
        id: randomUUID(),
        ownerUserId: userId,
        conversationId: conversation.id,
        connectionId: conversation.connectionId,
        triggeringMessageId: triggeringMessage.id,
        idempotencyKey: input.idempotencyKey,
        requestFingerprint,
        providerId: "postgresql",
        dialectId: "postgresql",
      },
    });
    await tx.message.update({
      where: { id: triggeringMessage.id },
      // appendMessage must run first to establish ordered conversation history;
      // this back-reference then connects that message to the new execution ledger.
      data: { queryRunId: run.id },
    });
    await tx.conversation.update({
      where: { id: conversation.id },
      data: {
        lastActivityAt: new Date(),
      },
    });
    await writeAuditLog({
      actorUserId: userId,
      action: "query-run.accept",
      resourceType: "query-run",
      resourceId: run.id,
      outcome: "succeeded",
      metadata: { conversationId: run.conversationId, providerId: run.providerId },
    }, tx);
    return { run, created: true };
    });
  } catch (error) {
    // A quota/disabled rejection is a product signal worth tracking; the run was
    // never created (the transaction rolled back), so key the event to the ask.
    if (error instanceof AppError && QUOTA_BLOCK_CODES.has(error.code)) {
      void recordMetricEvent({
        userId,
        eventType: "question.quota_blocked",
        resourceType: "conversation",
        resourceId: input.conversationId,
        payload: { code: error.code },
      });
    }
    throw error;
  }
  if (result.created) {
    void recordMetricEvent({
      userId,
      eventType: "question.accepted",
      resourceType: "query-run",
      resourceId: result.run.id,
      queryRunId: result.run.id,
      payload: { conversationId: result.run.conversationId },
    });
  }
  return result;
}

export async function getOwnedQueryRun(queryRunId: string): Promise<QueryRun> {
  const { userId } = await requireUser();
  return requireFound(await getAppDb().queryRun.findFirst({
    where: { id: queryRunId, ownerUserId: userId },
  }));
}

// SPEC-09 §1/§2.1: validation for the alternate-views PATCH. The transform union
// mirrors the shared `ViewTransform` type; `chartConfig` reuses the dashboard
// ChartConfig schema so a view's config is exactly a pinnable chart config.
const ViewTransformSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("topN"), n: z.number().int().min(1).max(500), measureKey: z.string().min(1).max(200), othersBucket: z.boolean() }).strict(),
  z.object({ kind: z.literal("cumulative"), measureKeys: z.array(z.string().min(1).max(200)).min(1).max(50) }).strict(),
  z.object({ kind: z.literal("percentOfTotal"), measureKeys: z.array(z.string().min(1).max(200)).min(1).max(50) }).strict(),
  z.object({ kind: z.literal("pivot"), seriesKey: z.string().min(1).max(200) }).strict(),
]);
const BlockViewSchema = z
  .object({
    id: z.string().min(1).max(100),
    chartConfig: ChartConfigSchema,
    transform: ViewTransformSchema.nullable(),
    stackMode: z.enum(["none", "stacked", "percent"]).optional(),
    normalized: z.boolean().optional(),
  })
  .strict();
const UpdateBlockViewsSchema = z.object({ views: z.array(BlockViewSchema).min(1).max(8) }).strict();

/**
 * SPEC-09 §2.1: persist a finalized block's alternate views. Owner-only (via
 * getOwnedQueryRun), zod-validated, and additive — it only rewrites the target
 * block inside the existing `resultBlocks` JSON. The back-compat invariant (§1)
 * is enforced here: the block's `chartConfig` is re-mirrored to `views[0]` so
 * legacy readers (shares, dashboards, old-message fallback) keep working.
 */
export async function updateBlockViews(queryRunId: string, blockIndex: number, input: unknown): Promise<QueryRunDto> {
  const parsed = UpdateBlockViewsSchema.safeParse(input);
  if (!parsed.success) throw new AppError("VALIDATION_FAILED", "Invalid block views payload.");
  const run = await getOwnedQueryRun(queryRunId);
  const blocks = ((run.resultBlocks as unknown as QueryResultBlock[]) ?? []).slice();
  const targetIndex = blocks.findIndex((block) => block.index === blockIndex);
  if (targetIndex === -1) throw resourceNotFound();
  const views = parsed.data.views as unknown as NonNullable<QueryResultBlock["views"]>;
  blocks[targetIndex] = {
    ...blocks[targetIndex],
    views,
    // Back-compat mirror: chartConfig MUST equal views[0].chartConfig whenever views exist.
    chartConfig: views[0].chartConfig,
  };
  const saved = await getAppDb().queryRun.update({
    where: { id: queryRunId },
    data: { resultBlocks: blocks as unknown as Prisma.InputJsonValue },
  });
  return queryRunDto(saved);
}

// todo: explain what this does. 
export async function transitionQueryRun(
  queryRunId: string,
  status: QueryRunStatus,
  data: Prisma.QueryRunUpdateManyMutationInput = {},
): Promise<QueryRun> {
  const current = await getOwnedQueryRun(queryRunId);
  if (TERMINAL_QUERY_RUN_STATUSES.has(current.status)) return current;
  const now = new Date();
  const result = await getAppDb().queryRun.updateMany({
    where: { id: current.id, ownerUserId: current.ownerUserId, statusVersion: current.statusVersion },
    data: {
      ...data,
      status,
      statusVersion: { increment: 1 },
      startedAt: current.startedAt ?? (status === "accepted" ? null : now),
      ...(TERMINAL_QUERY_RUN_STATUSES.has(status) ? { finishedAt: now } : {}),
    },
  });
  if (result.count === 0) throw new AppError("CONFLICT", "The query run changed while it was being updated.");
  return requireFound(await getAppDb().queryRun.findFirst({
    where: { id: current.id, ownerUserId: current.ownerUserId },
  }));
}

export async function recordQueryValidation(
  queryRunId: string,
  validationResult: Prisma.InputJsonValue,
): Promise<QueryRun> {
  const current = await getOwnedQueryRun(queryRunId);
  if (TERMINAL_QUERY_RUN_STATUSES.has(current.status)) return current;
  if (current.status !== "validating") {
    throw new AppError("CONFLICT", "The query run is not awaiting validation.");
  }
  const updated = await getAppDb().queryRun.updateMany({
    where: {
      id: current.id,
      ownerUserId: current.ownerUserId,
      status: "validating",
      statusVersion: current.statusVersion,
    },
    data: {
      validationResult,
      statusVersion: { increment: 1 },
    },
  });
  if (updated.count !== 1) {
    throw new AppError("CONFLICT", "The query run changed while validation was being recorded.");
  }
  return requireFound(await getAppDb().queryRun.findFirst({
    where: { id: current.id, ownerUserId: current.ownerUserId },
  }));
}

export async function recoverStaleQueryRuns(input: {
  staleBefore?: Date;
  limit?: number;
} = {}): Promise<{ recovered: number; queryRunIds: string[] }> {
  const staleBefore = input.staleBefore ?? new Date(Date.now() - STALE_QUERY_RUN_MS);
  const limit = Math.max(
    1,
    Math.min(Math.trunc(input.limit ?? DEFAULT_RECOVERY_BATCH_SIZE), MAX_RECOVERY_BATCH_SIZE),
  );

  const recoveredIds: string[] = [];
  for (let index = 0; index < limit; index += 1) {
    const recoveredId = await withAppDbTransaction(async (tx) => {
      const candidates = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id
      FROM v2_query_runs
      WHERE status IN (
        'accepted'::v2_query_run_status,
        'preparing'::v2_query_run_status,
        'generating'::v2_query_run_status,
        'validating'::v2_query_run_status,
        'executing'::v2_query_run_status,
        'persisting'::v2_query_run_status
      )
        AND updated_at <= ${staleBefore}
      ORDER BY updated_at ASC, id ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `);
      const candidate = candidates[0];
      if (!candidate) return null;
      const run = await tx.queryRun.findUnique({ where: { id: candidate.id } });
      if (!run || TERMINAL_QUERY_RUN_STATUSES.has(run.status)) return null;
      const response = await appendMessage(tx, {
        conversationId: run.conversationId,
        role: "assistant",
        content: RECOVERY_ASSISTANT_MESSAGE,
        queryRunId: run.id,
        metadata: { schemaVersion: 1, errorCode: RECOVERY_ERROR_CODE },
      });
      const recovered = await tx.queryRun.updateMany({
        where: {
          id: run.id,
          status: run.status,
          statusVersion: run.statusVersion,
          updatedAt: { lte: staleBefore },
        },
        data: {
          status: "expired",
          statusVersion: { increment: 1 },
          responseMessageId: response.id,
          errorCode: RECOVERY_ERROR_CODE,
          errorMessage: "The query run expired before completion.",
          finishedAt: new Date(),
        },
      });
      // The row lock makes this zero-count path defensive; fail the transaction
      // rather than leave an orphan assistant message if the invariant changes.
      if (recovered.count !== 1) {
        throw new AppError("CONFLICT", "A stale query run changed during recovery.");
      }
      await tx.conversation.update({
        where: { id: run.conversationId },
        data: { lastActivityAt: new Date() },
      });
      await writeAuditLog({
        actorUserId: run.ownerUserId,
        action: "query-run.recover",
        resourceType: "query-run",
        resourceId: run.id,
        outcome: "failed",
        metadata: { priorStatus: run.status, reason: "stale" },
      }, tx);
      return run.id;
    });
    if (!recoveredId) break;
    recoveredIds.push(recoveredId);
  }
  return { recovered: recoveredIds.length, queryRunIds: recoveredIds };
}

export async function completeQueryRun(input: {
  queryRunId: string;
  assistantContent: string;
  metadata?: Prisma.InputJsonValue;
  generatedQuery?: Prisma.InputJsonValue;
  resultPreview?: Prisma.InputJsonValue;
  resultBlocks?: QueryResultBlock[];
  returnedRowCount?: number;
  totalRowCount?: number | null;
  truncated?: boolean;
  executionTimeMs?: number;
}): Promise<QueryRun> {
  const current = await getOwnedQueryRun(input.queryRunId);
  if (TERMINAL_QUERY_RUN_STATUSES.has(current.status)) return current;
  const completed = await withAppDbTransaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`query-run:${current.id}`}))`;
    const fresh = requireFound(await tx.queryRun.findFirst({
      where: { id: current.id, ownerUserId: current.ownerUserId },
    }));
    if (TERMINAL_QUERY_RUN_STATUSES.has(fresh.status)) return fresh;
    const response = await appendMessage(tx, {
      conversationId: fresh.conversationId,
      role: "assistant",
      content: input.assistantContent,
      queryRunId: fresh.id,
      metadata: input.metadata,
    });
    const run = await tx.queryRun.update({
      where: { id: fresh.id },
      data: {
        status: "succeeded",
        statusVersion: { increment: 1 },
        responseMessageId: response.id,
        generatedQuery: input.generatedQuery,
        resultPreview: input.resultPreview,
        ...(input.resultBlocks
          ? { resultBlocks: input.resultBlocks as unknown as Prisma.InputJsonValue }
          : {}),
        returnedRowCount: input.returnedRowCount,
        totalRowCount: input.totalRowCount,
        truncated: input.truncated,
        executionTimeMs: input.executionTimeMs,
        finishedAt: new Date(),
      },
    });
    const now = new Date();
    await tx.conversation.update({
      where: { id: fresh.conversationId },
      data: { lastActivityAt: now },
    });
    await writeAuditLog({
      actorUserId: fresh.ownerUserId,
      action: "query-run.complete",
      resourceType: "query-run",
      resourceId: fresh.id,
      outcome: "succeeded",
      metadata: { conversationId: fresh.conversationId },
    }, tx);
    return run;
  });
  // Terminal metrics (best-effort): succeeded question counters + event. Placed at
  // this single completion choke point so all success paths are counted once.
  if (completed.status === "succeeded") {
    void recordQuestionTerminal(completed.ownerUserId, "succeeded");
    void recordMetricEvent({
      userId: completed.ownerUserId,
      eventType: "question.succeeded",
      resourceType: "query-run",
      resourceId: completed.id,
      queryRunId: completed.id,
    });
  }
  return completed;
}

export async function failQueryRun(queryRunId: string, code: string, message: string, partialMetadata?: Prisma.InputJsonValue): Promise<QueryRun> {
  const current = await getOwnedQueryRun(queryRunId);
  if (TERMINAL_QUERY_RUN_STATUSES.has(current.status)) return current;
  const safeMessage = message.slice(0, 1000);
  const failed = await withAppDbTransaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`query-run:${current.id}`}))`;
    const fresh = requireFound(await tx.queryRun.findFirst({
      where: { id: current.id, ownerUserId: current.ownerUserId },
    }));
    if (TERMINAL_QUERY_RUN_STATUSES.has(fresh.status)) return fresh;
    const response = await appendMessage(tx, {
      conversationId: fresh.conversationId,
      role: "assistant",
      content: safeMessage,
      queryRunId: fresh.id,
      metadata: { 
        ...(typeof partialMetadata === "object" && partialMetadata !== null ? partialMetadata : {}),
        schemaVersion: 1, 
        errorCode: code 
      } as Prisma.InputJsonValue,
    });
    const run = await tx.queryRun.update({
      where: { id: fresh.id },
      data: {
        status: "failed",
        statusVersion: { increment: 1 },
        responseMessageId: response.id,
        errorCode: code,
        errorMessage: safeMessage,
        finishedAt: new Date(),
      },
    });
    await tx.conversation.update({
      where: { id: fresh.conversationId },
      data: { lastActivityAt: new Date() },
    });
    await writeAuditLog({
      actorUserId: fresh.ownerUserId,
      action: "query-run.complete",
      resourceType: "query-run",
      resourceId: fresh.id,
      outcome: "failed",
      metadata: { errorCode: code },
    }, tx);
    return run;
  });
  if (failed.status === "failed") {
    void recordQuestionTerminal(failed.ownerUserId, "failed");
    void recordMetricEvent({
      userId: failed.ownerUserId,
      eventType: "question.failed",
      resourceType: "query-run",
      resourceId: failed.id,
      queryRunId: failed.id,
      payload: { errorCode: code },
    });
  }
  return failed;
}

export async function cancelQueryRun(queryRunId: string): Promise<QueryRun> {
  const current = await getOwnedQueryRun(queryRunId);
  if (TERMINAL_QUERY_RUN_STATUSES.has(current.status)) return current;
  const cancelled = await withAppDbTransaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`query-run:${current.id}`}))`;
    const fresh = requireFound(await tx.queryRun.findFirst({
      where: { id: current.id, ownerUserId: current.ownerUserId },
    }));
    if (TERMINAL_QUERY_RUN_STATUSES.has(fresh.status)) return fresh;
    const run = await tx.queryRun.update({
      where: { id: fresh.id },
      data: {
        status: "cancelled",
        statusVersion: { increment: 1 },
        finishedAt: new Date(),
      },
    });
    await writeAuditLog({
      actorUserId: fresh.ownerUserId,
      action: "query-run.cancel",
      resourceType: "query-run",
      resourceId: fresh.id,
      outcome: "cancelled",
    }, tx);
    return run;
  });
  if (cancelled.status === "cancelled") {
    void recordMetricEvent({
      userId: cancelled.ownerUserId,
      eventType: "question.cancelled",
      resourceType: "query-run",
      resourceId: cancelled.id,
      queryRunId: cancelled.id,
    });
  }
  abortActiveQueryRun(queryRunId);
  return cancelled;
}
