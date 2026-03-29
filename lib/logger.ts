import fs from "fs";
import path from "path";

const LOG_PATH = path.join(process.cwd(), "logs", "conversation.log");

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
  const line = JSON.stringify(event) + "\n";
  fs.appendFile(LOG_PATH, line, (err) => {
    if (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to write log:", err);
    }
  });
}
