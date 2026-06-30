
import { AppError } from "../dal/core";

export function mapPostgresError(error: unknown): AppError {
  const code = typeof error === "object" && error && "code" in error
    ? String(error.code)
    : "";

  if (code === "28P01" || code === "28000") {
    return new AppError("DATA_SOURCE_AUTHENTICATION_FAILED", "The data source credentials were rejected.", false, error);
  }
  if (code === "57014") {
    return new AppError("QUERY_EXECUTION_TIMEOUT", "The data source operation timed out.", true, error);
  }
  return new AppError("DATA_SOURCE_UNAVAILABLE", "The data source is unavailable.", true, error);
}
