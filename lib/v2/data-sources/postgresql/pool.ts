import "server-only";

import { Pool } from "pg";
import type { ResourceId } from "@/types/v2";

const IDLE_DISPOSE_MS = 10 * 60_000;
type Entry = { pool: Pool; connectionId: ResourceId; credentialVersion: number; lastUsedAt: number };
const pools = new Map<string, Entry>();

function key(connectionId: ResourceId, credentialVersion: number): string {
  return `${connectionId}:${credentialVersion}`;
}

export async function getPostgresPool(connectionId: ResourceId, credentialVersion: number, connectionString: string, address: string, servername: string): Promise<Pool> {
  const poolKey = key(connectionId, credentialVersion);
  const existing = pools.get(poolKey);
  if (existing) {
    existing.lastUsedAt = Date.now();
    return existing.pool;
  }
  await disposePostgresPools(connectionId);
  const pool = new Pool({
    connectionString,
    host: address,
    max: 3,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 8_000,
    allowExitOnIdle: true,
    ssl: { rejectUnauthorized: true, servername },
  });
  pools.set(poolKey, { pool, connectionId, credentialVersion, lastUsedAt: Date.now() });
  return pool;
}

export async function disposePostgresPools(connectionId: ResourceId): Promise<void> {
  const matches = [...pools.entries()].filter(([, entry]) => entry.connectionId === connectionId);
  await Promise.all(matches.map(async ([poolKey, entry]) => {
    pools.delete(poolKey);
    await entry.pool.end();
  }));
}

const evictionTimer = setInterval(() => {
  const cutoff = Date.now() - IDLE_DISPOSE_MS;
  for (const entry of pools.values()) {
    if (entry.lastUsedAt < cutoff) void disposePostgresPools(entry.connectionId);
  }
}, 60_000);
evictionTimer.unref();
