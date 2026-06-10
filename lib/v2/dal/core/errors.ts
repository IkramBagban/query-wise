import "server-only";
import type { ApiErrorCode } from "@/types/v2";

export class AppError extends Error {
  constructor(public readonly code: ApiErrorCode, message: string, public readonly retryable = false, public readonly cause?: unknown) {
    super(message);
    this.name = "AppError";
  }
}

export function resourceNotFound(cause?: unknown): AppError {
  return new AppError("RESOURCE_NOT_FOUND", "The requested resource was not found.", false, cause);
}

export function requireFound<T>(value: T | null | undefined): T {
  if (value == null) throw resourceNotFound();
  return value;
}
