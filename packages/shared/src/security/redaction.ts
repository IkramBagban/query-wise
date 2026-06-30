
const SENSITIVE_KEY = /(api[-_]?key|authorization|cookie|credential|encrypted.?secret|password|secret|token|connection.?string|database.?url)/i;
const REDACTED = "[REDACTED]";

export function redactSensitive<T>(value: T): T {
  if (Array.isArray(value)) return value.map(redactSensitive) as T;
  if (!value || typeof value !== "object") return value;
  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) output[key] = SENSITIVE_KEY.test(key) ? REDACTED : redactSensitive(nested);
  return output as T;
}

export function safeErrorMessage(error: unknown): string {
  void error;
  return "An internal operation failed.";
}
