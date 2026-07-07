
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { AppDbTransaction } from "../app-db";
import { getAppDb, withAppDbTransaction } from "../app-db";
import { devLog, devLogError } from "../observability";
import type { ResourceId } from "../types";
import {
  SCHEMA_INGESTION_JOB_TYPE,
  SCHEMA_INGESTION_PAYLOAD_VERSION,
  SCHEMA_INGESTION_QUEUE_NAME,
  SCHEMA_REFRESH_JOB_NAME,
  SCHEMA_REFRESH_QUEUE_NAME,
  type SchemaIngestionIntent,
  type SchemaIngestionJobData,
} from "./types";

type BullMqQueueConstructor = new (name: string, options: { connection: unknown }) => {
  add: (name: string, data: unknown, options: Record<string, unknown>) => Promise<unknown>;
  close?: () => Promise<void>;
};

async function optionalBullMq(): Promise<{ Queue: BullMqQueueConstructor } | null> {
  try {
    const dynamicImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<{ Queue: BullMqQueueConstructor }>;
    return await dynamicImport("bullmq");
  } catch {
    return null;
  }
}

function redisConnectionOptions(): unknown | null {
  const url = process.env.QUERYWISE_REDIS_URL ?? process.env.REDIS_URL;
  return url ? { url } : null;
}

function deterministicJobRowId(idempotencyKey: string): string {
  const hex = createHash("sha256").update(idempotencyKey).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function schemaIngestionJobId(input: Pick<SchemaIngestionJobData, "connectionId" | "intent" | "requestIdempotencyKey" | "schemaFingerprint" | "requestedAt">): string {
  const dedupeKey = input.requestIdempotencyKey ?? input.schemaFingerprint ?? `${input.intent}:${input.requestedAt}`;
  const dedupeHash = createHash("sha256").update(dedupeKey).digest("hex").slice(0, 16);
  return `schema-ingestion-${input.connectionId}-${dedupeHash}`;
}

export function schemaIngestionIdempotencyKey(input: Pick<SchemaIngestionJobData, "connectionId" | "intent" | "requestIdempotencyKey" | "schemaFingerprint" | "requestedAt">): string {
  return createHash("sha256").update(schemaIngestionJobId(input)).digest("hex");
}

export async function publishSchemaIngestionJob(data: SchemaIngestionJobData): Promise<"published" | "not-configured"> {
  const connection = redisConnectionOptions();
  const bullmq = await optionalBullMq();
  if (!connection || !bullmq) {
    devLog("warn", "schema-ingestion.publish.not-configured", "Schema ingestion job could not be published because Redis or BullMQ is unavailable.", {
      connectionId: data.connectionId,
      intent: data.intent,
      hasRedisConnection: Boolean(connection),
      hasBullMq: Boolean(bullmq),
    });
    return "not-configured";
  }

  const queue = new bullmq.Queue(SCHEMA_INGESTION_QUEUE_NAME, { connection });
  try {
    await queue.add(SCHEMA_INGESTION_JOB_TYPE, data, {
      jobId: schemaIngestionJobId(data),
      attempts: 5,
      backoff: { type: "exponential", delay: 30_000 },
      removeOnComplete: { age: 86_400, count: 1_000 },
      removeOnFail: { age: 604_800 },
    });
    devLog("info", "schema-ingestion.publish.succeeded", "Schema ingestion job published to BullMQ.", {
      connectionId: data.connectionId,
      intent: data.intent,
      jobId: schemaIngestionJobId(data),
    });
    return "published";
  } catch (error) {
    devLogError("schema-ingestion.publish.failed", "Schema ingestion job publish failed.", error, {
      connectionId: data.connectionId,
      intent: data.intent,
      jobId: schemaIngestionJobId(data),
    });
    throw error;
  } finally {
    await queue.close?.();
  }
}

async function createOutboxJob(tx: AppDbTransaction, data: SchemaIngestionJobData): Promise<void> {
  const idempotencyKey = schemaIngestionIdempotencyKey(data);
  const id = deterministicJobRowId(idempotencyKey);
  await tx.durableJob.upsert({
    where: { id },
    create: {
      id,
      type: SCHEMA_INGESTION_JOB_TYPE,
      payloadVersion: SCHEMA_INGESTION_PAYLOAD_VERSION,
      payload: data as unknown as Prisma.InputJsonValue,
      idempotencyKey,
      status: "queued",
      maxAttempts: 5,
    },
    update: {},
  });
}

export async function enqueueSchemaIngestion(input: {
  connectionId: ResourceId;
  ownerUserId?: string;
  intent: SchemaIngestionIntent;
  requestIdempotencyKey?: string;
  schemaFingerprint?: string;
}): Promise<{ jobId: string; published: boolean }> {
  const data: SchemaIngestionJobData = {
    connectionId: input.connectionId,
    ownerUserId: input.ownerUserId,
    intent: input.intent,
    requestIdempotencyKey: input.requestIdempotencyKey,
    schemaFingerprint: input.schemaFingerprint,
    requestedAt: new Date().toISOString(),
  };

  await withAppDbTransaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`schema-ingestion-enqueue:${input.connectionId}`}))`;
    await createOutboxJob(tx, data);
    await tx.databaseConnection.update({
      where: { id: input.connectionId },
      data: { schemaSyncStatus: "queued" },
    });
  });
  devLog("info", "schema-ingestion.enqueue.outbox-created", "Schema ingestion outbox job created.", {
    connectionId: data.connectionId,
    intent: data.intent,
    jobId: schemaIngestionJobId(data),
  });

  const publishResult = await publishSchemaIngestionJob(data);
  devLog(publishResult === "published" ? "info" : "warn", "schema-ingestion.enqueue.completed", "Schema ingestion enqueue completed.", {
    connectionId: data.connectionId,
    intent: data.intent,
    jobId: schemaIngestionJobId(data),
    published: publishResult === "published",
  });
  return { jobId: schemaIngestionJobId(data), published: publishResult === "published" };
}

export async function publishQueuedSchemaIngestionOutbox(limit = 25): Promise<number> {
  const jobs = await getAppDb().durableJob.findMany({
    where: { type: SCHEMA_INGESTION_JOB_TYPE, status: "queued" },
    orderBy: [{ priority: "desc" }, { availableAt: "asc" }, { id: "asc" }],
    take: limit,
  });
  let published = 0;
  let failed = 0;
  devLog("debug", "schema-ingestion.outbox-relay.started", "Schema ingestion outbox relay started.", { queuedCount: jobs.length, limit });
  for (const job of jobs) {
    try {
      const result = await publishSchemaIngestionJob(job.payload as unknown as SchemaIngestionJobData);
      if (result === "published") {
        await getAppDb().durableJob.update({ where: { id: job.id }, data: { status: "succeeded", completedAt: new Date() } });
        published += 1;
      }
    } catch (error) {
      failed += 1;
      devLogError("schema-ingestion.outbox-relay.job-failed", "Outbox relay failed to publish one job — continuing with remaining jobs.", error, { jobId: job.id });
    }
  }
  devLog("debug", "schema-ingestion.outbox-relay.completed", "Schema ingestion outbox relay completed.", { queuedCount: jobs.length, published, failed });
  return published;
}

/**
 * SPEC-03 §6.2 — registers (idempotently) a BullMQ repeatable job that periodically scans for schema
 * drift. Enrichment only re-runs for changed entities thanks to per-entity fingerprint reuse, so this
 * is pure wiring. Gated by the caller on `QUERYWISE_SCHEMA_REFRESH_CRON`.
 */
export async function scheduleSchemaRefreshRepeatable(cronPattern: string): Promise<"scheduled" | "not-configured"> {
  const connection = redisConnectionOptions();
  const bullmq = await optionalBullMq();
  if (!connection || !bullmq) {
    devLog("warn", "schema-refresh.schedule.not-configured", "Scheduled schema refresh could not be registered (Redis/BullMQ unavailable).", {
      hasRedisConnection: Boolean(connection),
      hasBullMq: Boolean(bullmq),
    });
    return "not-configured";
  }
  const queue = new bullmq.Queue(SCHEMA_REFRESH_QUEUE_NAME, { connection });
  try {
    await queue.add(
      SCHEMA_REFRESH_JOB_NAME,
      {},
      {
        repeat: { pattern: cronPattern },
        jobId: "schema-refresh-scheduler",
        removeOnComplete: { count: 10 },
        removeOnFail: { count: 50 },
      },
    );
    devLog("info", "schema-refresh.schedule.registered", "Scheduled schema refresh registered.", { cronPattern });
    return "scheduled";
  } finally {
    await queue.close?.();
  }
}

/**
 * Scans every active connection and enqueues a schema-ingestion refresh. Re-introspection compares
 * the fingerprint and only re-enriches changed entities (per-entity fingerprint reuse). Invoked by
 * the repeatable job registered via {@link scheduleSchemaRefreshRepeatable}.
 */
export async function enqueueScheduledSchemaRefresh(): Promise<{ scanned: number; enqueued: number }> {
  const connections = await getAppDb().databaseConnection.findMany({
    where: { deletedAt: null, status: "connected" },
    select: { id: true, ownerUserId: true },
  });
  let enqueued = 0;
  for (const connection of connections) {
    try {
      await enqueueSchemaIngestion({
        connectionId: connection.id as ResourceId,
        ownerUserId: connection.ownerUserId,
        intent: "scheduled-refresh",
      });
      enqueued += 1;
    } catch (error) {
      devLogError("schema-refresh.enqueue-failed", "Scheduled refresh failed to enqueue a connection; continuing.", error, {
        connectionId: connection.id,
      });
    }
  }
  devLog("info", "schema-refresh.scan.completed", "Scheduled schema refresh scan completed.", { scanned: connections.length, enqueued });
  return { scanned: connections.length, enqueued };
}
