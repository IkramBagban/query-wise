import { randomUUID } from "node:crypto";
import { AppError } from "@/lib/v2/dal/core";
import type { ApiErrorCode } from "@/types/v2";
import type { ZodError } from "zod";
import { devLogError } from "@/lib/v2/observability";

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  AUTHENTICATION_REQUIRED: 401,
  RESOURCE_NOT_FOUND: 404,
  VALIDATION_FAILED: 400,
  CONFLICT: 409,
  IDEMPOTENCY_KEY_REUSED: 409,
  RATE_LIMITED: 429,
  QUERY_CONCURRENCY_LIMITED: 429,
  DATA_SOURCE_CAPABILITY_UNSUPPORTED: 422,
  DATA_SOURCE_UNAVAILABLE: 503,
  DATA_SOURCE_AUTHENTICATION_FAILED: 422,
  DATA_SOURCE_TARGET_BLOCKED: 422,
  SCHEMA_SNAPSHOT_UNAVAILABLE: 409,
  CONTEXT_TOO_LARGE: 413,
  QUERY_GENERATION_FAILED: 502,
  QUERY_VALIDATION_BLOCKED: 422,
  QUERY_EXECUTION_TIMEOUT: 504,
  QUERY_EXECUTION_FAILED: 422,
  RESULT_LIMIT_EXCEEDED: 413,
  SHARE_PASSWORD_REQUIRED: 401,
  SHARE_PASSWORD_INVALID: 401,
  SHARE_REVOKED_OR_NOT_FOUND: 404,
  INTERNAL_ERROR: 500,
};

export const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" };

export function validationError(error?: ZodError): AppError {
  return new AppError(
    "VALIDATION_FAILED",
    error?.issues[0]?.message ?? "The request is invalid.",
  );
}

export function apiErrorResponse(error: unknown): Response {
  const requestId = randomUUID();
  const appError =
    error instanceof AppError
      ? error
      : new AppError("INTERNAL_ERROR", "An unexpected error occurred.", true, error);

  devLogError("api.dashboard.error", "Dashboard or sharing API request failed.", error, {
    requestId,
    errorCode: appError.code,
  });

  return Response.json(
    {
      contractVersion: "querywise.v2",
      error: {
        code: appError.code,
        message: appError.message,
        retryable: appError.retryable,
        requestId,
      },
    },
    { status: STATUS_BY_CODE[appError.code], headers: NO_STORE_HEADERS },
  );
}

export async function parseJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch (error) {
    throw validationError(undefined);
  }
}
