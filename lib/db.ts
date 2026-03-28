import { Pool, type PoolClient, type QueryResult as PgQueryResult } from "pg";
import type { QueryResult } from "@/types";

const pools = new Map<string, Pool>();

function resolveConnectionString(connectionString?: string): string {
  const resolved = connectionString ?? process.env.DEMO_DATABASE_URL;
  if (!resolved) {
    throw new Error("Database connection string is not configured.");
  }
  return resolved;
}

function getPool(connectionString?: string): Pool {
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
      })
    );
  }

  const pool = pools.get(key);
  if (!pool) {
    throw new Error("Failed to initialize database pool.");
  }

  return pool;
}

export function validateAndSanitizeSql(sql: string): {
  valid: boolean;
  reason?: string;
} {
  const trimmed = sql.trim();
  if (!trimmed) {
    return { valid: false, reason: "Query is empty." };
  }

  if (!/^(SELECT|WITH)\b/i.test(trimmed)) {
    return {
      valid: false,
      reason: "Only SELECT queries are allowed.",
    };
  }

  const uppercaseSql = trimmed.toUpperCase();
  const blockedTokens = [
    "DROP",
    "DELETE",
    "TRUNCATE",
    "UPDATE",
    "INSERT",
    "ALTER",
    "CREATE",
    "GRANT",
    "REVOKE",
    "EXECUTE",
    "EXEC",
    "CALL",
    "MERGE",
    "XP_",
  ];

  for (const token of blockedTokens) {
    const tokenRegex = new RegExp(`\\b${token}\\b`, "i");
    if (tokenRegex.test(uppercaseSql)) {
      return {
        valid: false,
        reason: `Query contains blocked keyword: ${token}`,
      };
    }
  }

  // Block SQL comments explicitly.
  if (uppercaseSql.includes("--") || uppercaseSql.includes("/*")) {
    return {
      valid: false,
      reason: "Query contains blocked SQL comment syntax.",
    };
  }

  return { valid: true };
}

function toQueryResult(result: PgQueryResult<Record<string, unknown>>, start: number): QueryResult {
  return {
    columns: result.fields.map((field) => field.name),
    rows: result.rows,
    rowCount: result.rows.length,
    executionTimeMs: Date.now() - start,
  };
}

export async function executeQuery(
  sql: string,
  connectionString?: string,
  timeoutMs = 15_000
): Promise<QueryResult> {
  const validation = validateAndSanitizeSql(sql);
  if (!validation.valid) {
    throw new Error(validation.reason ?? "Query blocked");
  }

  const pool = getPool(connectionString);
  const client: PoolClient = await pool.connect();
  const start = Date.now();
  const safeTimeout = Number.isFinite(timeoutMs)
    ? Math.min(Math.max(Math.floor(timeoutMs), 1_000), 60_000)
    : 15_000;

  try {
    await client.query(`SET statement_timeout = ${safeTimeout}`);
    await client.query("BEGIN TRANSACTION READ ONLY");

    const safeSql = `SELECT * FROM (${sql}) AS _querywise_result LIMIT 500`;
    const result = await client.query<Record<string, unknown>>(safeSql);

    await client.query("COMMIT");
    return toQueryResult(result, start);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function testConnection(connectionString?: string): Promise<{
  success: boolean;
  error?: string;
}> {
  let client: PoolClient | null = null;

  try {
    const pool = getPool(connectionString);
    client = await pool.connect();
    await client.query("SELECT 1");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to connect to database.";
    return { success: false, error: message };
  } finally {
    client?.release();
  }
}
