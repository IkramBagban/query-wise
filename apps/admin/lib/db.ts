import "server-only";

import { getAppDb, withAppDbTransaction } from "@query-wise/shared/app-db";
import type { AppDb, AppDbTransaction } from "@query-wise/shared/app-db";

/**
 * Ensure DATABASE_URL is visible as QUERYWISE_APP_DATABASE_URL before Prisma
 * connects (instrumentation may not have run yet in all entry points).
 */
function ensureDbUrl(): void {
  if (
    process.env.DATABASE_URL &&
    !process.env.QUERYWISE_APP_DATABASE_URL
  ) {
    process.env.QUERYWISE_APP_DATABASE_URL = process.env.DATABASE_URL;
  }
}

export function adminDb(): AppDb {
  ensureDbUrl();
  return getAppDb();
}

export async function adminTransaction<T>(
  operation: (tx: AppDbTransaction) => Promise<T>,
): Promise<T> {
  ensureDbUrl();
  return withAppDbTransaction(operation);
}

export type { AppDb, AppDbTransaction };
