import { randomUUID } from "node:crypto";
import { AppError } from "@query-wise/shared/dal/core";
import type { ApiErrorCode, ApiErrorResponse } from "@query-wise/shared/types";
import { devLogError } from "@query-wise/shared/observability";

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
  SHARE_EXPIRED: 410,
  SHARE_REVOKED_OR_NOT_FOUND: 404,
  INTERNAL_ERROR: 500,
};

export const privateNoStoreHeaders = { "Cache-Control": "private, no-store" };

export function apiError(error: unknown): Response {
  const appError =
    error instanceof AppError
      ? error
      : new AppError("INTERNAL_ERROR", "An unexpected error occurred.", true, error);
  const requestId = randomUUID();
  devLogError("api.query.error", "Query API request failed.", error, {
    requestId,
    errorCode: appError.code,
  });
  const body: ApiErrorResponse = {
    contractVersion: "querywise.v2",
    error: {
      code: appError.code,
      message: appError.message,
      retryable: appError.retryable,
      requestId,
    },
  };
  return Response.json(body, {
    status: STATUS_BY_CODE[appError.code],
    headers: privateNoStoreHeaders,
  });
}

export function jsonData(data: unknown, status = 200): Response {
  return Response.json(
    { contractVersion: "querywise.v2", data },
    { status, headers: privateNoStoreHeaders },
  );
}
