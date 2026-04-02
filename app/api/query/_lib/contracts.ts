import { z } from "zod";

import { LLM_PROVIDER_IDS } from "@/lib/llm-config";

export const QueryRequestSchema = z.object({
  question: z.string().trim().min(1).max(500),
  history: z
    .array(
      z
        .object({
          id: z.string().min(1),
          role: z.enum(["user", "assistant"]),
          content: z.string(),
          sql: z.string().optional(),
          timestamp: z.number().int(),
        })
        .passthrough(),
    )
    .max(100),
  connectionString: z.string().trim().min(1).optional(),
  provider: z.enum(LLM_PROVIDER_IDS),
  model: z.string().trim().min(1).max(120),
  apiKey: z.string().trim().min(1),
});

export type QueryRequestInput = z.infer<typeof QueryRequestSchema>;

export type StreamEvent =
  | "stage"
  | "text_delta"
  | "sql"
  | "query_stats"
  | "final"
  | "error";

export type StreamEmitter = (event: StreamEvent, data: unknown) => void;
