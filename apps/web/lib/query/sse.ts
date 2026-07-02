import type { QueryRunStatus } from "@query-wise/shared/types";

export type QueryStreamType =
  | "status"
  | "text-delta"
  | "sql-preview"
  | "query-stats"
  | "activity"
  | "completed"
  | "failed";
export type QueryStreamEmitter = (type: QueryStreamType, data: unknown) => void;

export function querySseResponse(queryRunId: string, execute: (emit: QueryStreamEmitter) => Promise<void>): Response {
  const encoder = new TextEncoder();
  let sequence = 0;
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit: QueryStreamEmitter = (type, data) => {
        if (closed) return;
        sequence += 1;
        try {
          controller.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify({
            contractVersion: "querywise.v2",
            queryRunId,
            sequence,
            type,
            occurredAt: new Date().toISOString(),
            data,
          })}\n\n`));
        } catch {
          // Disconnecting the transport must not turn durable query execution into a failure.
          closed = true;
        }
      };
      void execute(emit).catch(() => undefined).finally(() => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // The consumer may have cancelled between the closed check and close call.
        }
      });
    },
    cancel() {
      closed = true;
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
