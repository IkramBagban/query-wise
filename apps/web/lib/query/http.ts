import { randomUUID } from "node:crypto";
import { AppError } from "@query-wise/shared/dal/core";
import type { ApiErrorCode, ApiErrorResponse } from "@query-wise/shared/types";
import { quotaRetryAfterSeconds } from "@query-wise/shared/plans";
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
  QUOTA_EXCEEDED_DAILY: 429,
  QUOTA_EXCEEDED_MONTHLY: 429,
  QUOTA_EXCEEDED_SCHEMA_REFRESH: 429,
  PLAN_LIMIT_CONNECTIONS: 403,
  PLAN_LIMIT_DASHBOARDS: 403,
  PLAN_LIMIT_SHARES: 403,
  PLAN_FEATURE_PASSWORD_SHARES: 403,
  PLAN_FEATURE_MODEL: 403,
  ACCOUNT_DISABLED: 403,
  COUPON_NOT_FOUND: 404,
  COUPON_INACTIVE: 403,
  COUPON_EXPIRED: 410,
  COUPON_FULLY_REDEEMED: 409,
  COUPON_ALREADY_REDEEMED: 409,
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
  const retryAfterSeconds = quotaRetryAfterSeconds(appError.code);
  const body: ApiErrorResponse = {
    contractVersion: "querywise.v2",
    error: {
      code: appError.code,
      message: appError.message,
      retryable: appError.retryable,
      requestId,
      ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
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
