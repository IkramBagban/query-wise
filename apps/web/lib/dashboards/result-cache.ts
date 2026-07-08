import "server-only";

import { createHash } from "node:crypto";
import Redis from "ioredis";
import { devLogError } from "@query-wise/shared/observability";
import type { BoundedResultPreview } from "@query-wise/shared/types";

// SPEC-06 §4.3: a short, connection-scoped result cache so N simultaneous viewers
// of one live dashboard share a single DB execution per widget within the TTL
// (AC #5). Mirrors lib/sharing/public-dashboard-cache.ts: an in-process in-flight
// map dedupes concurrent requests inside one server instance, and Redis (when
// configured) extends that guarantee across instances. Redis is best-effort — if
// it is unavailable the refresh still executes, just without cross-instance
// sharing. This protects the user's database from query amplification.

const CACHE_PREFIX = "querywise:widget-result:v1";
const REDIS_RETRY_DELAY_MS = 30_000;
const MAX_CACHE_BYTES = 2 * 1024 * 1024;
export const WIDGET_RESULT_CACHE_TTL_SECONDS = 60;

let redisClient: Redis | null = null;
let redisConnectPromise: Promise<void> | null = null;
let redisUnavailableUntil = 0;
const inFlight = new Map<string, Promise<BoundedResultPreview>>();

function redisUrl(): string | null {
  const value = process.env.QUERYWISE_REDIS_URL ?? process.env.REDIS_URL;
  return value?.trim() || null;
}

async function getRedis(): Promise<Redis | null> {
  const url = redisUrl();
  if (!url || Date.now() < redisUnavailableUntil) return null;
  if (!redisClient || redisClient.status === "end") {
    redisClient = new Redis(url, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 1_000,
      commandTimeout: 1_000,
      retryStrategy: () => null,
    });
    redisClient.on("error", () => undefined);
  }
  const client = redisClient;
  try {
    if (client.status === "wait") {
      redisConnectPromise ??= client.connect().then(() => undefined);
    }
    if (redisConnectPromise) await redisConnectPromise;
    return client;
  } catch (error) {
    redisUnavailableUntil = Date.now() + REDIS_RETRY_DELAY_MS;
    client.disconnect(false);
    if (redisClient === client) redisClient = null;
    devLogError("widget-result.cache.redis-unavailable", "Widget result cache unavailable; executing directly.", error);
    return null;
  } finally {
    redisConnectPromise = null;
  }
}

/** Cache key over the exact bytes that determine the result: connection + final SQL. */
export function widgetResultCacheKey(input: { connectionId: string; normalizedSql: string }): string {
  const digest = createHash("sha256").update(input.normalizedSql).digest("hex");
  return `${CACHE_PREFIX}:${input.connectionId}:${digest}`;
}

async function readCache(key: string): Promise<BoundedResultPreview | null> {
  try {
    const redis = await getRedis();
    const serialized = await redis?.get(key);
    if (!serialized || Buffer.byteLength(serialized, "utf8") > MAX_CACHE_BYTES) return null;
    const parsed = JSON.parse(serialized) as BoundedResultPreview;
    return parsed && typeof parsed === "object" && parsed.schemaVersion === 1 ? parsed : null;
  } catch (error) {
    devLogError("widget-result.cache.read-failed", "Widget result cache read failed.", error);
    return null;
  }
}

async function writeCache(key: string, value: BoundedResultPreview, ttlSeconds: number): Promise<void> {
  try {
    const serialized = JSON.stringify(value);
    if (Buffer.byteLength(serialized, "utf8") > MAX_CACHE_BYTES) return;
    const redis = await getRedis();
    await redis?.set(key, serialized, "EX", Math.max(1, ttlSeconds));
  } catch (error) {
    devLogError("widget-result.cache.write-failed", "Widget result cache write failed.", error);
  }
}

/**
 * Return a cached preview if fresh; otherwise execute `run` once (deduping
 * concurrent callers) and cache the result. `force` bypasses the read but still
 * populates the cache so a manual "Refresh all" wave still collapses to one
 * execution per widget.
 */
export async function getOrExecuteWidgetResult(
  key: string,
  force: boolean,
  run: () => Promise<BoundedResultPreview>,
  ttlSeconds: number = WIDGET_RESULT_CACHE_TTL_SECONDS,
): Promise<BoundedResultPreview> {
  if (!force) {
    const cached = await readCache(key);
    if (cached) return cached;
  }
  const existing = inFlight.get(key);
  if (existing) return existing;

  const operation = (async () => {
    if (!force) {
      const cached = await readCache(key);
      if (cached) return cached;
    }
    const value = await run();
    await writeCache(key, value, ttlSeconds);
    return value;
  })();

  inFlight.set(key, operation);
  try {
    return await operation;
  } finally {
    if (inFlight.get(key) === operation) inFlight.delete(key);
  }
}
