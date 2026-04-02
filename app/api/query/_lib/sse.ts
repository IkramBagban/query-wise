import { toUserFriendlyMessage } from "./error-mapping";
import type { StreamEmitter } from "./contracts";

export function sseResponse(
  execute: (emit: StreamEmitter) => Promise<void>,
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit: StreamEmitter = (event, data) => {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      };

      void (async () => {
        try {
          await execute(emit);
        } catch (error) {
          emit("error", { message: toUserFriendlyMessage(error) });
        } finally {
          controller.close();
        }
      })();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
