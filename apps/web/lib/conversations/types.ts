import type { ConversationDto, MessageDto } from "@query-wise/shared/types";

export interface ConversationListItem extends ConversationDto {
  messageCount: number;
}

export interface CursorPage<T> {
  contractVersion: "querywise.v2";
  items: T[];
  pageInfo: { nextCursor: string | null; hasMore: boolean; limit: number };
}

export interface ConversationDetail extends ConversationDto {
  connection: { id: string; name: string; providerId: string; dialectId: string };
}

export type ConversationMessageDto = MessageDto & {
  queryRun: {
    status: string;
    generatedQuery: unknown;
    resultPreview: unknown;
    returnedRowCount: number | null;
    totalRowCount: number | null;
    truncated: boolean | null;
    executionTimeMs: number | null;
    errorCode: string | null;
    errorMessage: string | null;
  } | null;
};
