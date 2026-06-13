import { devLog } from "@/lib/v2/observability";

export type LogEventType =
  | "USER_QUERY"
  | "LLM_RESPONSE"
  | "SQL_QUERY"
  | "CHART_RENDER"
  | "ERROR"
  | "INFO";

export interface LogEvent {
  type: LogEventType;
  timestamp: string;
  message: string;
  meta?: Record<string, unknown>;
}

export function logEvent(event: LogEvent) {
  devLog(
    event.type === "ERROR" ? "error" : "info",
    `legacy.${event.type.toLowerCase()}`,
    event.message,
    event.meta,
  );
}
