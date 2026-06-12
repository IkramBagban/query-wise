import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { Prisma, type QueryRun } from "@prisma/client";
import { getAppDb, withAppDbTransaction } from "@/lib/v2/app-db";
import { requireUser } from "@/lib/v2/auth";
import { appendMessage, fallbackConversationTitle } from "@/lib/v2/conversations";
import { AppError, requireFound } from "@/lib/v2/dal/core";
import type { QueryRunDto, QueryRunStatus } from "@/types/v2";
import { TERMINAL_QUERY_RUN_STATUSES, type QuerySubmission } from "./types";
import { abortActiveQueryRun } from "@/lib/v2/query/cancellation";

const STALE_QUERY_RUN_MS = 5 * 60_000;

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
  return createHash("sha256").update(JSON.stringify({
    conversationId: input.conversationId,
    question: input.question.trim(),
    provider: input.provider,
    model: input.model,
  })).digest("hex");
}

export async function acceptQuerySubmission(input: QuerySubmission): Promise<{
  run: QueryRun;
  created: boolean;
}> {
  const { userId } = await requireUser();
  const requestFingerprint = fingerprint(input);
  return withAppDbTransaction(async (tx) => {
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
      if (
        !TERMINAL_QUERY_RUN_STATUSES.has(existing.status) &&
        existing.updatedAt.getTime() <= Date.now() - STALE_QUERY_RUN_MS
      ) {
        const response = await appendMessage(tx, {
          conversationId: existing.conversationId,
          role: "assistant",
          content: "The previous query run expired before it could complete. Submit the question again to retry.",
          queryRunId: existing.id,
          metadata: { schemaVersion: 1, errorCode: "QUERY_EXECUTION_FAILED" },
        });
        return {
          run: await tx.queryRun.update({
            where: { id: existing.id },
            data: {
              status: "expired",
              statusVersion: { increment: 1 },
              responseMessageId: response.id,
              errorCode: "QUERY_EXECUTION_FAILED",
              errorMessage: "The query run expired before completion.",
              finishedAt: new Date(),
            },
          }),
          created: false,
        };
      }
      return { run: existing, created: false };
    }

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
      data: { queryRunId: run.id },
    });
    await tx.conversation.update({
      where: { id: conversation.id },
      data: {
        lastActivityAt: new Date(),
        ...(conversation.title === "New conversation"
          ? { title: fallbackConversationTitle(input.question) }
          : {}),
      },
    });
    return { run, created: true };
  });
}

export async function getOwnedQueryRun(queryRunId: string): Promise<QueryRun> {
  const { userId } = await requireUser();
  return requireFound(await getAppDb().queryRun.findFirst({
    where: { id: queryRunId, ownerUserId: userId },
  }));
}

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
    await tx.conversation.update({
      where: { id: fresh.conversationId },
      data: { lastActivityAt: new Date() },
    });
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
    return tx.queryRun.update({
      where: { id: fresh.id },
      data: {
        status: "cancelled",
        statusVersion: { increment: 1 },
        finishedAt: new Date(),
      },
    });
  });
  abortActiveQueryRun(queryRunId);
  return cancelled;
}
