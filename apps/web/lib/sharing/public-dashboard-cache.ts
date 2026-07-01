import "server-only";

import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import { devLogError } from "@query-wise/shared/observability";
import type { PublicDashboardDto } from "@query-wise/shared/types";

const CACHE_PREFIX = "querywise:public-dashboard:v1";
const MAX_CACHE_BYTES = 2 * 1024 * 1024;
const REDIS_RETRY_DELAY_MS = 30_000;
const LOCK_TTL_MS = 35_000;
const LOCK_WAIT_MS = 2_000;
const LOCK_POLL_MS = 100;

let redisClient: Redis | null = null;
let redisConnectPromise: Promise<void> | null = null;
let redisUnavailableUntil = 0;
const inFlight = new Map<string, Promise<PublicDashboardDto>>();

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
    devLogError(
      "public-dashboard.cache.redis-unavailable",
      "Public dashboard cache is unavailable; request will execute without it.",
      error,
    );
    return null;
  } finally {
    redisConnectPromise = null;
  }
}

export function publicDashboardCacheKey(input: {
  shareId: string;
  shareVersion: number;
  dashboardUpdatedAt: Date;
  widgetsUpdatedAt: Date | null;
}): string {
  return [
    CACHE_PREFIX,
    input.shareId,
    input.shareVersion,
    input.dashboardUpdatedAt.getTime(),
    input.widgetsUpdatedAt?.getTime() ?? 0,
  ].join(":");
}

function isPublicDashboardDto(value: unknown): value is PublicDashboardDto {
  if (!value || typeof value !== "object") return false;
  const dto = value as Partial<PublicDashboardDto>;
  if (dto.contractVersion !== "querywise.v2" || !dto.dashboard || !dto.share) return false;
  if (
    typeof dto.dashboard.name !== "string" ||
    typeof dto.dashboard.updatedAt !== "string" ||
    !Array.isArray(dto.dashboard.widgets) ||
    dto.dashboard.widgets.length > 50 ||
    !(dto.share.expiresAt === null || typeof dto.share.expiresAt === "string")
  ) {
    return false;
  }
  return dto.dashboard.widgets.every((widget) =>
    Boolean(widget) &&
    typeof widget.id === "string" &&
    typeof widget.title === "string" &&
    Boolean(widget.chartConfig) &&
    Boolean(widget.layout) &&
    (widget.result === null || typeof widget.result === "object") &&
    (widget.error === null ||
      (typeof widget.error?.code === "string" && typeof widget.error.message === "string")),
  );
}

async function readCache(key: string): Promise<PublicDashboardDto | null> {
  try {
    const redis = await getRedis();
    const serialized = await redis?.get(key);
    if (!serialized || Buffer.byteLength(serialized, "utf8") > MAX_CACHE_BYTES) return null;
    const parsed: unknown = JSON.parse(serialized);
    return isPublicDashboardDto(parsed) ? parsed : null;
  } catch (error) {
    devLogError("public-dashboard.cache.read-failed", "Public dashboard cache read failed.", error);
    return null;
  }
}

async function writeCache(
  key: string,
  dto: PublicDashboardDto,
  ttlSeconds: number,
): Promise<void> {
  try {
    const serialized = JSON.stringify(dto);
    if (Buffer.byteLength(serialized, "utf8") > MAX_CACHE_BYTES) return;
    const redis = await getRedis();
    await redis?.set(key, serialized, "EX", Math.max(1, ttlSeconds));
  } catch (error) {
    devLogError("public-dashboard.cache.write-failed", "Public dashboard cache write failed.", error);
  }
}

type LockResult =
  | { status: "acquired"; redis: Redis; token: string }
  | { status: "contended" }
  | { status: "unavailable" };

async function acquireLock(key: string): Promise<LockResult> {
  try {
    const redis = await getRedis();
    if (!redis) return { status: "unavailable" };
    const token = randomUUID();
    const acquired = await redis.set(`${key}:lock`, token, "PX", LOCK_TTL_MS, "NX");
    return acquired === "OK"
      ? { status: "acquired", redis, token }
      : { status: "contended" };
  } catch (error) {
    devLogError("public-dashboard.cache.lock-failed", "Public dashboard cache lock failed.", error);
    return { status: "unavailable" };
  }
}

async function releaseLock(
  key: string,
  lock: Extract<LockResult, { status: "acquired" }>,
): Promise<void> {
  try {
    // Compare-and-delete prevents an expired lock holder from deleting a newer lease.
    await lock.redis.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      1,
      `${key}:lock`,
      lock.token,
    );
  } catch (error) {
    devLogError("public-dashboard.cache.unlock-failed", "Public dashboard cache lock release failed.", error);
  }
}

async function waitForCache(key: string): Promise<PublicDashboardDto | null> {
  const deadline = Date.now() + LOCK_WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, LOCK_POLL_MS));
    const cached = await readCache(key);
    if (cached) return cached;
  }
  return null;
}

export async function getOrCreatePublicDashboard(
  key: string,
  ttlSeconds: number,
  create: () => Promise<PublicDashboardDto>,
): Promise<PublicDashboardDto> {
  const cached = await readCache(key);
  if (cached) return cached;

  const existing = inFlight.get(key);
  if (existing) return existing;

  const operation = (async () => {
    const lock = await acquireLock(key);
    if (lock.status === "contended") {
      const populated = await waitForCache(key);
      if (populated) return populated;
    }

    try {
      const populated = await readCache(key);
      if (populated) return populated;
      const dto = await create();
      await writeCache(key, dto, ttlSeconds);
      return dto;
    } finally {
      if (lock.status === "acquired") await releaseLock(key, lock);
    }
  })();

  inFlight.set(key, operation);
  try {
    return await operation;
  } finally {
    if (inFlight.get(key) === operation) inFlight.delete(key);
  }
}
