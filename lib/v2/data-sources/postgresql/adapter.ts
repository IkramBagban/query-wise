import "server-only";

import { Client } from "pg";
import type { BoundedQueryResult, ConnectionTestResult, DataSourceCapability, SqlDataSourceAdapter } from "@/types/v2";
import { AppError } from "@/lib/v2/dal/core";
import { enforcePublicEndpoint } from "./network-policy";
import { parsePostgresUrl } from "./url";
import { getPostgresPool, disposePostgresPools } from "./pool";
import { validatePostgresQuery } from "./validation";
import { introspectPostgresMetadata } from "./metadata";
import { canonicalType, jsonValue } from "./json";
import { mapPostgresError } from "../errors";

const capabilities = new Set<DataSourceCapability>([
  "connection-test", "metadata-introspection", "relationships", "estimated-row-counts",
  "sql-generation", "sql-preview", "sql-validation", "read-sql-execution",
]);

export const postgresqlAdapter: SqlDataSourceAdapter = {
  providerId: "postgresql",
  dialectId: "postgresql",
  capabilities,
  async testConnection(secret): Promise<ConnectionTestResult> {
    const parsed = parsePostgresUrl(secret.connectionString);
    await enforcePublicEndpoint(parsed.host);
    const startedAt = Date.now();
    const client = new Client({ connectionString: secret.connectionString, ssl: { rejectUnauthorized: true }, connectionTimeoutMillis: 8_000 });
    try {
      await client.connect();
      const result = await client.query<{ server_version: string }>("SHOW server_version");
      return { success: true, latencyMs: Date.now() - startedAt, serverVersion: result.rows[0]?.server_version ?? null, errorCode: null };
    } catch (error) {
      const mapped = mapPostgresError(error);
      return { success: false, latencyMs: Date.now() - startedAt, serverVersion: null, errorCode: mapped.code };
    } finally {
      await client.end().catch(() => undefined);
    }
  },
  introspectMetadata: (secret, options) => introspectPostgresMetadata(secret.connectionString, options),
  validateQuery: async (query, policy) => validatePostgresQuery(query, policy),
  async executeReadQuery(connectionId, credentialVersion, secret, query, options): Promise<BoundedQueryResult> {
    const parsed = parsePostgresUrl(secret.connectionString);
    await enforcePublicEndpoint(parsed.host);
    const validation = validatePostgresQuery(query, {
      schemaVersion: 1, readOnly: true, singleStatement: true, blockComments: true,
      blockSystemCatalogs: true, maxExecutionMs: options.timeoutMs, maxReturnedRows: options.maxRows,
    });
    if (!validation.valid || !validation.normalizedQuery) {
      throw new AppError("QUERY_VALIDATION_BLOCKED", "The SQL query violates the read-only safety policy.");
    }
    const pool = await getPostgresPool(connectionId, credentialVersion, secret.connectionString);
    const client = await pool.connect();
    const startedAt = Date.now();
    try {
      await client.query("BEGIN READ ONLY");
      await client.query(`SET LOCAL statement_timeout = ${Math.max(1_000, Math.min(options.timeoutMs, 60_000))}`);
      await client.query("SET LOCAL lock_timeout = '2s'");
      await client.query("SET LOCAL idle_in_transaction_session_timeout = '20s'");
      const result = await client.query(
        `SELECT * FROM (${validation.normalizedQuery.text}) AS querywise_bounded_result LIMIT ${Math.min(options.maxRows, 500) + 1}`,
      );
      const truncated = result.rows.length > options.maxRows;
      const rows = result.rows.slice(0, options.maxRows).map((row) => jsonValue(row) as Record<string, import("@/types/v2").JsonValue>);
      const bytesReturned = Buffer.byteLength(JSON.stringify(rows), "utf8");
      if (bytesReturned > options.maxBytes) throw new AppError("RESULT_LIMIT_EXCEEDED", "The bounded query result is too large.");
      return {
        columns: result.fields.map((field) => ({ name: field.name, canonicalType: canonicalType(String(field.dataTypeID)), nullable: true })),
        rows, returnedRowCount: rows.length, totalRowCount: null, truncated,
        executionTimeMs: Date.now() - startedAt, bytesReturned,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw mapPostgresError(error);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  },
  dispose: disposePostgresPools,
};
