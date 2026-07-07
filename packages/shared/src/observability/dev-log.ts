
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { redactSensitive } from "../security/redaction";

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

function isEnabled(): boolean {
  return process.env.NODE_ENV === "development" || process.env.QUERYWISE_LOG_ENABLED === "1";
}
const logDirectory = path.join(process.cwd(), "logs");
const logPath = path.join(logDirectory, "querywise-development.log");
let writeQueue = Promise.resolve();

function redactText(value: string): string {
  return value
    .replace(/\b(?:postgres(?:ql)?):\/\/[^\s"'`]+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/\bredis(?:s)?:\/\/[^\s"'`]+/gi, "[REDACTED_REDIS_URL]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED_TOKEN]")
    .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, "[REDACTED_API_KEY]")
    .replace(/\b(?:sk|pk)_(?:test|live)_[0-9A-Za-z_-]+\b/g, "[REDACTED_KEY]")
    .replace(/\bsk-ant-[A-Za-z0-9._-]{20,}\b/g, "[REDACTED_API_KEY]")
    .replace(/\bsk-proj-[A-Za-z0-9._-]{20,}\b/g, "[REDACTED_API_KEY]");
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
  return isEnabled() ? logPath : null;
}

function emitToConsole(entry: DevLogEntry): void {
  // const line = JSON.stringify(entry);
  const line = entry
  if (entry.level === "error") {
    console.error(line);
  } else if (entry.level === "warn") {
    console.warn(line);
  } else if (entry.level === "debug") {
    console.debug(line);
  } else {
    console.info(line);
  }
}

function enqueueFileWrite(entry: DevLogEntry): Promise<void> {
  if (!isEnabled()) return Promise.resolve();
  const line = `${JSON.stringify(entry)}\n`;
  writeQueue = writeQueue
    .then(async () => {
      await mkdir(logDirectory, { recursive: true });
      await appendFile(logPath, line, "utf8");
    })
    .catch((writeError) => {
      console.error("[querywise-dev-log] Failed to write development log.", writeError);
    });
  return writeQueue;
}

function createEntry(
  level: DevLogLevel,
  event: string,
  message: string,
  context?: Record<string, unknown>,
  error?: unknown,
): DevLogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    event,
    message: redactText(message),
    context: safeContext(context),
    error: safeError(error),
  };
}

export function devLog(
  level: DevLogLevel,
  event: string,
  message: string,
  context?: Record<string, unknown>,
  error?: unknown,
): void {
  if (!isEnabled()) return;
  const entry = createEntry(level, event, message, context, error);
  emitToConsole(entry);
  void enqueueFileWrite(entry);
}

export async function devLogAsync(
  level: DevLogLevel,
  event: string,
  message: string,
  context?: Record<string, unknown>,
  error?: unknown,
): Promise<void> {
  if (!isEnabled()) return;
  const entry = createEntry(level, event, message, context, error);
  emitToConsole(entry);
  await enqueueFileWrite(entry);
}

export function devLogError(
  event: string,
  message: string,
  error: unknown,
  context?: Record<string, unknown>,
): void {
  devLog("error", event, message, context, error);
}
