import "server-only";

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { AppDbTransaction } from "@/lib/v2/app-db";
import { getAppDb, withAppDbTransaction } from "@/lib/v2/app-db";
import type { ResourceId } from "@/types/v2";
import {
  SCHEMA_INGESTION_JOB_TYPE,
  SCHEMA_INGESTION_PAYLOAD_VERSION,
  SCHEMA_INGESTION_QUEUE_NAME,
  type SchemaIngestionIntent,
  type SchemaIngestionJobData,
} from "./types";

type BullMqQueueConstructor = new (name: string, options: { connection: unknown }) => {
  add: (name: string, data: SchemaIngestionJobData, options: Record<string, unknown>) => Promise<unknown>;
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

export function schemaIngestionJobId(input: Pick<SchemaIngestionJobData, "connectionId" | "intent" | "schemaFingerprint" | "requestedAt">): string {
  const dedupeKey = input.schemaFingerprint ?? `${input.intent}:${input.requestedAt}`;
  return `schema-ingestion:${input.connectionId}:${dedupeKey}`;
}

export function schemaIngestionIdempotencyKey(input: Pick<SchemaIngestionJobData, "connectionId" | "intent" | "schemaFingerprint" | "requestedAt">): string {
  return createHash("sha256").update(schemaIngestionJobId(input)).digest("hex");
}

export async function publishSchemaIngestionJob(data: SchemaIngestionJobData): Promise<"published" | "not-configured"> {
  const connection = redisConnectionOptions();
  const bullmq = await optionalBullMq();
  if (!connection || !bullmq) return "not-configured";

  const queue = new bullmq.Queue(SCHEMA_INGESTION_QUEUE_NAME, { connection });
  try {
    await queue.add(SCHEMA_INGESTION_JOB_TYPE, data, {
      jobId: schemaIngestionJobId(data),
      attempts: 5,
      backoff: { type: "exponential", delay: 30_000 },
      removeOnComplete: { age: 86_400, count: 1_000 },
      removeOnFail: { age: 604_800 },
    });
    return "published";
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
  schemaFingerprint?: string;
}): Promise<{ jobId: string; published: boolean }> {
  const data: SchemaIngestionJobData = {
    connectionId: input.connectionId,
    ownerUserId: input.ownerUserId,
    intent: input.intent,
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

  const publishResult = await publishSchemaIngestionJob(data);
  return { jobId: schemaIngestionJobId(data), published: publishResult === "published" };
}

export async function publishQueuedSchemaIngestionOutbox(limit = 25): Promise<number> {
  const jobs = await getAppDb().durableJob.findMany({
    where: { type: SCHEMA_INGESTION_JOB_TYPE, status: "queued" },
    orderBy: [{ priority: "desc" }, { availableAt: "asc" }, { id: "asc" }],
    take: limit,
  });
  let published = 0;
  for (const job of jobs) {
    const result = await publishSchemaIngestionJob(job.payload as unknown as SchemaIngestionJobData);
    if (result === "published") {
      await getAppDb().durableJob.update({ where: { id: job.id }, data: { status: "succeeded", completedAt: new Date() } });
      published += 1;
    }
  }
  return published;
}
