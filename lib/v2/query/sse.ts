import type { QueryRunStatus } from "@/types/v2";

export type QueryStreamType = "status" | "text-delta" | "sql-preview" | "query-stats" | "completed" | "failed";
export type QueryStreamEmitter = (type: QueryStreamType, data: unknown) => void;

export function querySseResponse(queryRunId: string, execute: (emit: QueryStreamEmitter) => Promise<void>): Response {
  const encoder = new TextEncoder();
  let sequence = 0;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit: QueryStreamEmitter = (type, data) => {
        sequence += 1;
        controller.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify({
          contractVersion: "querywise.v2",
          queryRunId,
          sequence,
          type,
          occurredAt: new Date().toISOString(),
          data,
        })}\n\n`));
      };
      void execute(emit).finally(() => controller.close());
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "private, no-store, no-transform",
      Connection: "keep-alive",
    },
  });
}

export function statusEvent(status: QueryRunStatus, statusVersion: number) {
  return { status, statusVersion };
}
