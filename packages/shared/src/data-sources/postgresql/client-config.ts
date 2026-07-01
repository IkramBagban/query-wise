
import type { ClientConfig } from "pg";
import type { ParsedPostgresUrl } from "./url";

export function pinnedPostgresConfig(
  parsed: ParsedPostgresUrl,
  address: string,
): ClientConfig {
  return {
    host: address,
    port: parsed.port,
    database: parsed.databaseName,
    user: parsed.user,
    password: parsed.password,
    ssl: { rejectUnauthorized: true, servername: parsed.host },
    connectionTimeoutMillis: 8_000,
  };
}
