import type { QueryRequest, QueryResponse } from "@/types";

import {
  parseQuerySseEvent,
  parseSseBlock,
  type QuerySseEvent,
} from "./query-sse-events";

export async function consumeQuerySse(
  payload: QueryRequest,
  onEvent: (event: QuerySseEvent) => void,
): Promise<QueryResponse> {
  const response = await fetch("/api/query", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(errorBody?.error ?? "Query failed");
  }

  if (!response.body) {
    throw new Error("Stream was not available.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalPayload: QueryResponse | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    let boundaryIndex = buffer.indexOf("\n\n");
    while (boundaryIndex >= 0) {
      const block = buffer.slice(0, boundaryIndex);
      buffer = buffer.slice(boundaryIndex + 2);
      boundaryIndex = buffer.indexOf("\n\n");

      const parsedEvent = parseSseBlock(block);
      if (!parsedEvent) continue;

      const parsedData = JSON.parse(parsedEvent.data) as Record<string, unknown>;
      const event = parseQuerySseEvent(parsedEvent.event, parsedData);
      onEvent(event);

      if (event.type === "final") {
        finalPayload = event.payload;
      }
    }
  }

  if (buffer.trim()) {
    const parsedEvent = parseSseBlock(buffer);
    if (parsedEvent?.event === "final") {
      const parsedData = JSON.parse(parsedEvent.data) as QueryResponse;
      finalPayload = parsedData;
    }
  }

  if (!finalPayload) {
    throw new Error("No final response received from stream.");
  }

  return finalPayload;
}
