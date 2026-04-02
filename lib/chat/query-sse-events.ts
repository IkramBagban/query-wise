import type { QueryResponse } from "@/types";

export type QuerySseEvent =
  | { type: "stage"; label: string }
  | { type: "text_delta"; chunk: string }
  | { type: "sql"; sql: string }
  | { type: "query_stats"; rowCount: number; executionTimeMs: number }
  | { type: "final"; payload: QueryResponse }
  | { type: "error"; message: string };

export function createMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isApiKeyErrorMessage(message: string): boolean {
  const value = message.toLowerCase();
  return (
    value.includes("missing llm api key") ||
    value.includes("api_key_invalid") ||
    value.includes("invalid api key") ||
    value.includes("api key not valid") ||
    value.includes("please pass a valid api key")
  );
}

export function parseSseBlock(
  block: string,
): { event: string; data: string } | null {
  const lines = block
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean);
  if (lines.length === 0) return null;

  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join("\n") };
}

export function parseQuerySseEvent(
  eventName: string,
  parsedData: Record<string, unknown>,
): QuerySseEvent {
  return eventName === "stage"
    ? { type: "stage", label: String(parsedData.label ?? "") }
    : eventName === "text_delta"
      ? { type: "text_delta", chunk: String(parsedData.chunk ?? "") }
      : eventName === "sql"
        ? { type: "sql", sql: String(parsedData.sql ?? "") }
        : eventName === "query_stats"
          ? {
              type: "query_stats",
              rowCount: Number(parsedData.rowCount ?? 0),
              executionTimeMs: Number(parsedData.executionTimeMs ?? 0),
            }
          : eventName === "final"
            ? { type: "final", payload: parsedData as unknown as QueryResponse }
            : eventName === "error"
              ? { type: "error", message: String(parsedData.message ?? "Unknown error") }
              : ({ type: "stage", label: "" } as const);
}
