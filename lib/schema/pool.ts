import { Pool } from "pg";

const pools = new Map<string, Pool>();

function resolveConnectionString(connectionString?: string): string {
  const resolved = connectionString ?? process.env.DEMO_DATABASE_URL;
  if (!resolved) {
    throw new Error("Database connection string is not configured.");
  }
  return resolved;
}

export function getSchemaPool(connectionString?: string): Pool {
  const key = connectionString ?? "demo";
  if (!pools.has(key)) {
    pools.set(
      key,
      new Pool({
        connectionString: resolveConnectionString(connectionString),
        ssl: { rejectUnauthorized: false },
        max: connectionString ? 3 : 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
      }),
    );
  }

  const pool = pools.get(key);
  if (!pool) {
    throw new Error("Failed to initialize schema pool.");
  }

  return pool;
}
