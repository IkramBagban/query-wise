import type { QueryRunStatus } from "@query-wise/shared/types";

export const TERMINAL_QUERY_RUN_STATUSES: ReadonlySet<QueryRunStatus> = new Set([
  "succeeded",
  "failed",
  "cancelled",
  "expired",
]);

export interface QuerySubmission {
  conversationId: string;
  question: string;
  idempotencyKey: string;
}
