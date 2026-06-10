import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

let pool: Pool | undefined;
let database: ReturnType<typeof drizzle<typeof schema>> | undefined;

function connectionString(): string {
  const value = process.env.QUERYWISE_APP_DATABASE_URL;
  if (!value) throw new Error("QUERYWISE_APP_DATABASE_URL is not configured.");
  return value;
}

export function getAppDbPool(): Pool {
  pool ??= new Pool({ connectionString: connectionString(), max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000 });
  return pool;
}

export function getAppDb() {
  database ??= drizzle(getAppDbPool(), { schema });
  return database;
}

export type AppDb = ReturnType<typeof getAppDb>;
export type AppDbTransaction = Parameters<Parameters<AppDb["transaction"]>[0]>[0];

export async function withAppDbTransaction<T>(operation: (tx: AppDbTransaction) => Promise<T>): Promise<T> {
  return getAppDb().transaction(operation);
}
