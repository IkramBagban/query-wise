import "server-only";

import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { redactSensitive } from "@/lib/v2/security/redaction";

type DevLogLevel = "debug" | "info" | "warn" | "error";

interface DevLogEntry {
  timestamp: string;
  level: DevLogLevel;
  event: string;
  message: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    code?: string;
    stack?: string;
    cause?: { name: string; message: string; code?: string };
  };
}

const enabled = process.env.NODE_ENV === "development";
const logDirectory = path.join(process.cwd(), "logs");
const logPath = path.join(logDirectory, "querywise-development.log");
let writeQueue = Promise.resolve();

function redactText(value: string): string {
  return value
    .replace(/\b(?:postgres(?:ql)?):\/\/[^\s"'`]+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, "[REDACTED_API_KEY]")
    .replace(/\b(?:sk|pk)_(?:test|live)_[0-9A-Za-z_-]+\b/g, "[REDACTED_KEY]");
}

function safeContext(context?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!context) return undefined;
  return redactSensitive(context);
}

function safeError(error: unknown): DevLogEntry["error"] | undefined {
  if (!(error instanceof Error)) return undefined;
  const code =
    "code" in error && typeof error.code === "string"
      ? error.code
      : undefined;
  const cause =
    "cause" in error && error.cause instanceof Error
      ? {
          name: error.cause.name,
          message: redactText(error.cause.message),
          code:
            "code" in error.cause && typeof error.cause.code === "string"
              ? error.cause.code
              : undefined,
        }
      : undefined;
  return {
    name: error.name,
    message: redactText(error.message),
    code,
    stack: error.stack ? redactText(error.stack) : undefined,
    cause,
  };
}

export function getDevelopmentLogPath(): string | null {
  return enabled ? logPath : null;
}

export function devLog(
  level: DevLogLevel,
  event: string,
  message: string,
  context?: Record<string, unknown>,
  error?: unknown,
): void {
  if (!enabled) return;
  const entry: DevLogEntry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    message: redactText(message),
    context: safeContext(context),
    error: safeError(error),
  };
  const line = `${JSON.stringify(entry)}\n`;
  writeQueue = writeQueue
    .then(async () => {
      await mkdir(logDirectory, { recursive: true });
      await appendFile(logPath, line, "utf8");
    })
    .catch((writeError) => {
      console.error("[querywise-dev-log] Failed to write development log.", writeError);
    });
}

export function devLogError(
  event: string,
  message: string,
  error: unknown,
  context?: Record<string, unknown>,
): void {
  devLog("error", event, message, context, error);
}
