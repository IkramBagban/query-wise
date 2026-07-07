import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { Conversation, Message } from "@prisma/client";
import { getAppDb, withAppDbTransaction } from "@query-wise/shared/app-db";
import { requireUser } from "@/lib/auth";
import {
  AppError,
  decodeCursor,
  encodeCursor,
  normalizePageLimit,
  requireFound,
} from "@query-wise/shared/dal/core";
import type { ConversationDto, MessageDto, QueryResultBlock } from "@query-wise/shared/types";
import type {
  ConversationDetail,
  ConversationListItem,
  ConversationMessageDto,
  CursorPage,
} from "./types";

const CONVERSATION_CURSOR = "conversations";
const MESSAGE_CURSOR = "conversation-messages";
export const DEFAULT_CONVERSATION_TITLE = "New conversation";

function conversationDto(record: Conversation): ConversationDto {
  return {
    contractVersion: "querywise.v2",
    id: record.id,
    connectionId: record.connectionId,
    title: record.title,
    status: record.status,
    lastActivityAt: record.lastActivityAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function messageDto(record: Message): MessageDto {
  return {
    contractVersion: "querywise.v2",
    id: record.id,
    sequence: record.sequence,
    role: record.role,
    content: record.content,
    queryRunId: record.queryRunId,
    metadata: record.metadata as unknown as MessageDto["metadata"],
    createdAt: record.createdAt.toISOString(),
  };
}

export async function createConversation(connectionId: string, title?: string): Promise<ConversationDto> {
  const { userId } = await requireUser();
  return withAppDbTransaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`connection:${connectionId}`}))`;
    requireFound(await tx.databaseConnection.findFirst({
      where: { id: connectionId, ownerUserId: userId, deletedAt: null },
      select: { id: true },
    }));
    const record = await tx.conversation.create({
      data: {
        id: randomUUID(),
        ownerUserId: userId,
        connectionId,
        title: title?.trim() || DEFAULT_CONVERSATION_TITLE,
      },
    });
    return conversationDto(record);
  });
}

export async function listConversations(input: {
  cursor?: string;
  limit?: number;
  status?: "active" | "archived";
}): Promise<CursorPage<ConversationListItem>> {
  const { userId } = await requireUser();
  const limit = normalizePageLimit(input.limit);
  const sort = input.cursor ? decodeCursor(input.cursor, CONVERSATION_CURSOR, userId) : null;
  const lastActivityAt = typeof sort?.[0] === "string" ? new Date(sort[0]) : null;
  const id = typeof sort?.[1] === "string" ? sort[1] : null;
  if (sort && (!lastActivityAt || Number.isNaN(lastActivityAt.valueOf()) || !id)) {
    throw new AppError("VALIDATION_FAILED", "The pagination cursor is invalid.");
  }

  const records = await getAppDb().conversation.findMany({
    where: {
      ownerUserId: userId,
      deletedAt: null,
      status: input.status,
      ...(lastActivityAt && id
        ? {
            OR: [
              { lastActivityAt: { lt: lastActivityAt } },
              { lastActivityAt, id: { lt: id } },
            ],
          }
        : {}),
    },
    orderBy: [{ lastActivityAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });
  const hasMore = records.length > limit;
  const page = records.slice(0, limit);
  const counts = await getAppDb().message.groupBy({
    by: ["conversationId"],
    where: { conversationId: { in: page.map((item: any) => item.id) } },
    _count: { _all: true },
  });
  const countById = new Map(counts.map((item: any) => [item.conversationId, item._count._all]));
  const last = page.at(-1);
  return {
    contractVersion: "querywise.v2",
    items: page.map((item: any) => ({ ...conversationDto(item), messageCount: countById.get(item.id) ?? 0 })),
    pageInfo: {
      nextCursor: hasMore && last
        ? encodeCursor(CONVERSATION_CURSOR, userId, [last.lastActivityAt.toISOString(), last.id])
        : null,
      hasMore,
      limit,
    },
  };
}

export async function getConversation(conversationId: string): Promise<ConversationDetail> {
  const { userId } = await requireUser();
  const record = await getAppDb().conversation.findFirst({
    where: { id: conversationId, ownerUserId: userId, deletedAt: null },
  });
  const conversation = requireFound(record);
  const connection = requireFound(await getAppDb().databaseConnection.findFirst({
    where: { id: conversation.connectionId, ownerUserId: userId, deletedAt: null },
    select: { id: true, name: true, providerId: true, dialectId: true },
  }));
  return { ...conversationDto(conversation), connection };
}

export async function updateConversation(
  conversationId: string,
  patch: { title?: string; status?: "active" | "archived" },
): Promise<ConversationDto> {
  const { userId } = await requireUser();
  const result = await getAppDb().conversation.updateMany({
    where: { id: conversationId, ownerUserId: userId, deletedAt: null },
    data: patch,
  });
  if (result.count === 0) requireFound(null);
  return conversationDto(requireFound(await getAppDb().conversation.findFirst({
    where: { id: conversationId, ownerUserId: userId, deletedAt: null },
  })));
}

export async function deleteConversation(conversationId: string): Promise<void> {
  const { userId } = await requireUser();
  // User-visible deletion is currently a soft delete: normal reads exclude the
  // row immediately. Messages and query runs remain stored until separate cleanup.
  const result = await getAppDb().conversation.updateMany({
    where: { id: conversationId, ownerUserId: userId, deletedAt: null },
    data: { deletedAt: new Date(), status: "archived" },
  });
  if (result.count === 0) requireFound(null);
}

export async function needsGeneratedConversationTitle(conversationId: string): Promise<boolean> {
  const { userId } = await requireUser();
  const record = requireFound(await getAppDb().conversation.findFirst({
    where: { id: conversationId, ownerUserId: userId, deletedAt: null },
    select: { title: true },
  }));
  return record.title === DEFAULT_CONVERSATION_TITLE;
}

export async function setGeneratedConversationTitle(conversationId: string, title: string): Promise<void> {
  const { userId } = await requireUser();
  await getAppDb().conversation.updateMany({
    where: { id: conversationId, ownerUserId: userId, deletedAt: null, title: DEFAULT_CONVERSATION_TITLE },
    data: { title },
  });
}

export async function listMessages(input: {
  conversationId: string;
  cursor?: string;
  limit?: number;
}): Promise<CursorPage<ConversationMessageDto>> {
  const { userId } = await requireUser();
  requireFound(await getAppDb().conversation.findFirst({
    where: { id: input.conversationId, ownerUserId: userId, deletedAt: null },
  }));
  const endpoint = `${MESSAGE_CURSOR}:${input.conversationId}`;
  const limit = normalizePageLimit(input.limit);
  const sort = input.cursor ? decodeCursor(input.cursor, endpoint, userId) : null;
  const sequence = typeof sort?.[0] === "number" ? sort[0] : null;
  const id = typeof sort?.[1] === "string" ? sort[1] : null;
  if (sort && (sequence == null || !id)) throw new AppError("VALIDATION_FAILED", "The pagination cursor is invalid.");

  const records = await getAppDb().message.findMany({
    where: {
      conversationId: input.conversationId,
      ...(sequence != null && id
        ? { OR: [{ sequence: { lt: sequence } }, { sequence, id: { lt: id } }] }
        : {}),
    },
    // Fetch newest-first so the initial bounded page always contains the current conversation tail.
    orderBy: [{ sequence: "desc" }, { id: "desc" }],
    take: limit + 1,
  });
  const page = records.slice(0, limit);
  const runIds = page.flatMap((item) => item.queryRunId ? [item.queryRunId] : []);
  const runs = await getAppDb().queryRun.findMany({
    where: { id: { in: runIds }, ownerUserId: userId, conversationId: input.conversationId },
  });
  const runsById = new Map(runs.map((run) => [run.id, run]));
  const last = page.at(-1);
  return {
    contractVersion: "querywise.v2",
    items: page.map((item) => {
      const run = item.queryRunId ? runsById.get(item.queryRunId) : null;
      return {
        ...messageDto(item),
        queryRun: run ? {
          status: run.status,
          generatedQuery: run.generatedQuery,
          resultPreview: run.resultPreview,
          resultBlocks: run.resultBlocks as unknown as QueryResultBlock[],
          returnedRowCount: run.returnedRowCount,
          totalRowCount: run.totalRowCount == null ? null : Number(run.totalRowCount),
          truncated: run.truncated,
          executionTimeMs: run.executionTimeMs,
          errorCode: run.errorCode,
          errorMessage: run.errorMessage,
        } : null,
      };
    }),
    pageInfo: {
      nextCursor: records.length > limit && last
        ? encodeCursor(endpoint, userId, [last.sequence, last.id])
        : null,
      hasMore: records.length > limit,
      limit,
    },
  };
}

/**
 * The SQL an assistant turn actually ran, for the `[SQL used: …]` history
 * annotation (SPEC-01 §3). Prefers the per-block SQL of the query run, capped at
 * the 2 most recent statements; falls back to the legacy single generated query.
 */
function recentSqlForRun(run: { resultBlocks: unknown; generatedQuery: unknown }): string | undefined {
  const blocks = (run.resultBlocks as QueryResultBlock[] | null) ?? [];
  const statements = blocks
    .map((block) => block?.sql)
    .filter((sql): sql is string => typeof sql === "string" && sql.trim().length > 0);
  if (statements.length > 0) return statements.slice(-2).join("\n");
  const generated = run.generatedQuery as { text?: string } | null;
  if (generated?.text?.trim()) return generated.text.trim();
  return undefined;
}

export async function recentConversationHistory(conversationId: string, limit = 20) {
  const records = await getAppDb().message.findMany({
    where: { conversationId },
    orderBy: [{ sequence: "desc" }, { id: "desc" }],
    take: limit,
  });
  const runIds = records.flatMap((message) => (message.queryRunId ? [message.queryRunId] : []));
  const runs = runIds.length
    ? await getAppDb().queryRun.findMany({
        where: { id: { in: runIds } },
        select: { id: true, resultBlocks: true, generatedQuery: true },
      })
    : [];
  const runsById = new Map(runs.map((run) => [run.id, run]));
  return records.reverse().map((message) => {
    const run = message.queryRunId ? runsById.get(message.queryRunId) : null;
    const sql = run ? recentSqlForRun(run) : undefined;
    return {
      id: message.id,
      role: message.role === "system" ? ("assistant" as const) : message.role,
      content: message.content,
      timestamp: message.createdAt.valueOf(),
      ...(sql ? { sql } : {}),
    };
  });
}

/**
 * Appends one message with a gap-free, conversation-local sequence number.
 * The caller supplies an open transaction so the message and its surrounding
 * query-run state change either commit together or roll back together.
 */
export async function appendMessage(
  tx: Parameters<Parameters<typeof withAppDbTransaction>[0]>[0],
  input: { conversationId: string; role: "user" | "assistant" | "system"; content: string; queryRunId?: string; metadata?: Prisma.InputJsonValue },
) {
  // Without this transaction-scoped lock, two concurrent appends could both read
  // the same maximum sequence and race on the unique (conversationId, sequence) key.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.conversationId}))`;
  const latest = await tx.message.aggregate({
    where: { conversationId: input.conversationId },
    _max: { sequence: true },
  });
  return tx.message.create({
    data: {
      id: randomUUID(),
      conversationId: input.conversationId,
      sequence: (latest._max.sequence ?? 0) + 1,
      role: input.role,
      // Bound persisted prompt/response content even when this helper is called
      // outside request schemas (for example, recovery-generated messages).
      content: input.content.slice(0, 8000),
      queryRunId: input.queryRunId,
      metadata: input.metadata ?? { schemaVersion: 1 },
    },
  });
}
