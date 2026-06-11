import { randomUUID } from "node:crypto";
import { ZodError, type ZodType } from "zod";
import { AppError } from "@/lib/v2/dal/core";
import { CONTRACT_VERSION } from "@/types/v2";

const headers = { "Cache-Control": "private, no-store" };
const statusByCode: Record<string, number> = {
  AUTHENTICATION_REQUIRED: 401, RESOURCE_NOT_FOUND: 404, VALIDATION_FAILED: 400, CONFLICT: 409,
  IDEMPOTENCY_KEY_REUSED: 409, DATA_SOURCE_CAPABILITY_UNSUPPORTED: 422, DATA_SOURCE_AUTHENTICATION_FAILED: 422,
  DATA_SOURCE_TARGET_BLOCKED: 422, DATA_SOURCE_UNAVAILABLE: 503, SCHEMA_SNAPSHOT_UNAVAILABLE: 409,
  QUERY_VALIDATION_BLOCKED: 422, QUERY_EXECUTION_TIMEOUT: 504, QUERY_EXECUTION_FAILED: 422,
  RESULT_LIMIT_EXCEEDED: 413,
};

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers });
}

export async function parseJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  try {
    return schema.parse(await request.json());
  } catch (error) {
    if (error instanceof ZodError) throw error;
    throw new AppError("VALIDATION_FAILED", "A valid JSON request body is required.");
  }
}

export async function handle(operation: () => Promise<Response>): Promise<Response> {
  try {
    return await operation();
  } catch (error) {
    const requestId = randomUUID();
    if (error instanceof ZodError) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of error.issues) {
        const key = issue.path.join(".") || "request";
        fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
      }
      return json({ contractVersion: CONTRACT_VERSION, error: { code: "VALIDATION_FAILED", message: "The request is invalid.", retryable: false, requestId, fieldErrors } }, 400);
    }
    const appError = error instanceof AppError ? error : new AppError("INTERNAL_ERROR", "An internal operation failed.", true, error);
    return json({
      contractVersion: CONTRACT_VERSION,
      error: { code: appError.code, message: appError.message, retryable: appError.retryable, requestId },
    }, statusByCode[appError.code] ?? 500);
  }
}
