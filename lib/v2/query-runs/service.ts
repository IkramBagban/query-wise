import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { Prisma, type QueryRun } from "@prisma/client";
import { getAppDb, withAppDbTransaction } from "@/lib/v2/app-db";
import { requireUser } from "@/lib/v2/auth";
import { appendMessage, DEFAULT_CONVERSATION_TITLE } from "@/lib/v2/conversations";
import { AppError, requireFound } from "@/lib/v2/dal/core";
import type { QueryRunDto, QueryRunStatus } from "@/types/v2";
import { TERMINAL_QUERY_RUN_STATUSES, type QuerySubmission } from "./types";
import { abortActiveQueryRun } from "@/lib/v2/query/cancellation";
import { writeAuditLog } from "@/lib/v2/audit";

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
    generatedQuery: run.generatedQuery as QueryRunDto["generatedQuery"],
    resultPreview: run.resultPreview as QueryRunDto["resultPreview"],
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
  // Bind an idempotency key to the logical request. The API key is deliberately
  // excluded because it is a credential, not persisted request identity.
  return createHash("sha256").update(JSON.stringify({
    conversationId: input.conversationId,
    question: input.question.trim(),
    provider: input.provider,
    model: input.model,
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
  return withAppDbTransaction(async (tx) => {
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
}

export async function getOwnedQueryRun(queryRunId: string): Promise<QueryRun> {
  const { userId } = await requireUser();
  return requireFound(await getAppDb().queryRun.findFirst({
    where: { id: queryRunId, ownerUserId: userId },
  }));
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
  returnedRowCount?: number;
  totalRowCount?: number | null;
  truncated?: boolean;
  executionTimeMs?: number;
}): Promise<QueryRun> {
  const current = await getOwnedQueryRun(input.queryRunId);
  if (TERMINAL_QUERY_RUN_STATUSES.has(current.status)) return current;
  return withAppDbTransaction(async (tx) => {
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
}

export async function failQueryRun(queryRunId: string, code: string, message: string): Promise<QueryRun> {
  const current = await getOwnedQueryRun(queryRunId);
  if (TERMINAL_QUERY_RUN_STATUSES.has(current.status)) return current;
  const safeMessage = message.slice(0, 1000);
  return withAppDbTransaction(async (tx) => {
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
      metadata: { schemaVersion: 1, errorCode: code },
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
  abortActiveQueryRun(queryRunId);
  return cancelled;
}
