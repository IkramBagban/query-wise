import type { ConversationDto, MessageDto, QueryResultBlock } from "@query-wise/shared/types";

export interface ConversationListItem extends ConversationDto {
  messageCount: number;
  // SPEC-13 §4: the bound connection was soft-deleted; the chat is read-only.
  connectionDeleted: boolean;
}

export interface CursorPage<T> {
  contractVersion: "querywise.v2";
  items: T[];
  pageInfo: { nextCursor: string | null; hasMore: boolean; limit: number };
}

export interface ConversationDetail extends ConversationDto {
  connection: { id: string; name: string; providerId: string; dialectId: string };
  // SPEC-13 §4: the bound connection was soft-deleted; render read-only history.
  connectionDeleted: boolean;
}

export type ConversationMessageDto = MessageDto & {
  queryRun: {
    status: string;
    generatedQuery: unknown;
    resultPreview: unknown;
    resultBlocks: QueryResultBlock[];
    returnedRowCount: number | null;
    totalRowCount: number | null;
    truncated: boolean | null;
    executionTimeMs: number | null;
    errorCode: string | null;
    errorMessage: string | null;
  } | null;
};
