import {
  SCHEMA_ANALYSIS_CACHE_PREFIX,
  SCHEMA_CACHE_PREFIX,
} from "@/store/app-state/constants";
import type { Dashboard, DbConnection } from "@/types";

export function maskConnectionString(connectionString?: string): string {
  if (!connectionString) return "Demo database";
  try {
    const parsed = new URL(connectionString);
    const host = parsed.hostname;
    const db = parsed.pathname.replace(/^\/+/, "") || "database";
    return `${host}/${db}`;
  } catch {
    return "Custom PostgreSQL";
  }
}

export function getConnectionCacheKey(connection: DbConnection | null) {
  if (!connection) return null;
  return `${connection.type}:${connection.connectionString ?? "demo"}`;
}

export function getSchemaStorageKey(connection: DbConnection | null) {
  const cacheKey = getConnectionCacheKey(connection);
  return cacheKey ? `${SCHEMA_CACHE_PREFIX}${cacheKey}` : null;
}

export function getSchemaAnalysisStorageKey(connection: DbConnection | null) {
  const cacheKey = getConnectionCacheKey(connection);
  return cacheKey ? `${SCHEMA_ANALYSIS_CACHE_PREFIX}${cacheKey}` : null;
}

export function createFallbackDashboard(): Dashboard {
  return {
    id: `dash-${Date.now()}`,
    name: "Primary Dashboard",
    widgets: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}


