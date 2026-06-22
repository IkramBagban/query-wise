import type { QueryRunStatus } from "@/types/v2";

export const TERMINAL_QUERY_RUN_STATUSES: ReadonlySet<QueryRunStatus> = new Set([
  "succeeded",
  "failed",
  "cancelled",
  "expired",
]);

export interface QuerySubmission {
  conversationId: string;
  question: string;
  provider: "google" | "anthropic";
  model: string;
  apiKey: string;
  idempotencyKey: string;
}
