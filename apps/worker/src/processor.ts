
import { Prisma } from "@prisma/client";
import type { CanonicalDataSourceMetadata, ResourceId } from "@query-wise/shared/types";
import { getAppDb, withAppDbTransaction } from "@query-wise/shared/app-db";
import { AppError } from "@query-wise/shared/dal/core";
import { createResourceId } from "@query-wise/shared/domain";
import { getDataSourceAdapter, requireCapability } from "@query-wise/shared/data-sources";
import { getConnectionSecretForIngestion } from "@query-wise/shared/connections";
import { devLog, devLogError } from "@query-wise/shared/observability";
import { describeEntities, createEmbeddingRecords } from "./enrichment";
import { computeSchemaFingerprint, summarizeMetadata } from "./fingerprint";
import { getModel, type Provider, withModelFallback } from "./llm";

import { persistSchemaEmbeddings } from "./vector-store";
import { sampleEntityValues } from "./sampling";
import type {
  EnrichedSchemaMetadata,
  SchemaEntityDescription,
  SchemaIngestionJobData,
  SchemaIngestionProgress,
  SchemaIngestionStage,
} from "@query-wise/shared/ingestion";

const DEFAULT_OPTIONS = {
  enableSampling: false,
  maxNamespaces: 100,
  maxEntities: 2_000,
  maxColumnsPerEntity: 500,
  maxRelationships: 10_000,
  timeoutMs: 30_000,
};

function elapsedMs(startedAt: number): number {
  return Date.now() - startedAt;
}

function progress(input: {
  connectionId: ResourceId;
  stage: SchemaIngestionStage;
  schemaFingerprint: string | null;
  descriptions?: Record<string, SchemaEntityDescription>;
  embeddedEntityIds?: string[];
}): SchemaIngestionProgress {
  return {
    schemaVersion: 1,
    stage: input.stage,
    connectionId: input.connectionId,
    schemaFingerprint: input.schemaFingerprint,
    describedEntityIds: Object.keys(input.descriptions ?? {}),
    embeddedEntityIds: input.embeddedEntityIds ?? [],
    updatedAt: new Date().toISOString(),
  };
}

function enrichMetadata(input: {
  metadata: CanonicalDataSourceMetadata;
  connectionId: ResourceId;
  stage: SchemaIngestionStage;
  schemaFingerprint: string | null;
  descriptions?: Record<string, SchemaEntityDescription>;
  embeddedEntityIds?: string[];
}): EnrichedSchemaMetadata {
  const descriptions = input.descriptions ?? {};
  return {
    ...input.metadata,
    ingestion: progress({
      connectionId: input.connectionId,
      stage: input.stage,
      schemaFingerprint: input.schemaFingerprint,
      descriptions,
      embeddedEntityIds: input.embeddedEntityIds,
    }),
    enrichment: {
      schemaVersion: 1,
      descriptions,
      embeddingIndex: (input.embeddedEntityIds ?? []).flatMap((entityId) => [
        { entityId, embeddingKind: "table-summary" as const, text: descriptions[entityId]?.description ?? entityId, dimensions: 384 },
        { entityId, embeddingKind: "question-summary" as const, text: descriptions[entityId]?.sampleQuestions.join("\n") ?? entityId, dimensions: 384 },
      ]),
    },
  };
}

function connectionStatusForStage(stage: SchemaIngestionStage) {
  if (stage === "queued") return "queued";
  if (stage === "introspecting" || stage === "fingerprinting" || stage === "describing" || stage === "embedding") return "running";
  if (stage === "ready") return "ready";
  return "error";
}

async function saveSnapshotProgress(input: {
  snapshotId: ResourceId;
  metadata: CanonicalDataSourceMetadata;
  connectionId: ResourceId;
  stage: SchemaIngestionStage;
  schemaFingerprint: string | null;
  descriptions?: Record<string, SchemaEntityDescription>;
  embeddedEntityIds?: string[];
}): Promise<void> {
  await withAppDbTransaction(async (tx) => {
    await tx.schemaSnapshot.update({
      where: { id: input.snapshotId },
      data: {
        metadata: enrichMetadata(input) as unknown as Prisma.InputJsonValue,
        summary: summarizeMetadata(input.metadata),
        schemaHash: input.schemaFingerprint,
      },
    });
    await tx.databaseConnection.update({
      where: { id: input.connectionId },
      data: { schemaSyncStatus: connectionStatusForStage(input.stage) },
    });
  });
}

function readDescriptions(metadata: unknown): Record<string, SchemaEntityDescription> {
  const maybeMetadata = metadata as Partial<EnrichedSchemaMetadata> | null;
  return maybeMetadata?.enrichment?.descriptions ?? {};
}

async function createIngestionSnapshot(input: {
  connectionId: ResourceId;
  ownerUserId: string;
  metadata: CanonicalDataSourceMetadata;
  schemaFingerprint: string;
}): Promise<{ snapshotId: ResourceId; snapshotVersion: number; existingDescriptions: Record<string, SchemaEntityDescription> }> {
  return withAppDbTransaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`schema-ingestion:${input.connectionId}`}))`;
    const latest = await tx.schemaSnapshot.findFirst({
      where: { connectionId: input.connectionId },
      orderBy: { snapshotVersion: "desc" },
    });
    const latestSuccessful = await tx.schemaSnapshot.findFirst({
      where: { connectionId: input.connectionId, status: "succeeded", schemaHash: input.schemaFingerprint },
      orderBy: { snapshotVersion: "desc" },
    });
    const existingDescriptions = readDescriptions(latestSuccessful?.metadata ?? latest?.metadata);
    const snapshotId = createResourceId();
    const snapshotVersion = (latest?.snapshotVersion ?? 0) + 1;
    input.metadata.snapshotVersion = snapshotVersion;
    await tx.schemaSnapshot.create({
      data: {
        id: snapshotId,
        ownerUserId: input.ownerUserId,
        connectionId: input.connectionId,
        snapshotVersion,
        status: "syncing",
        schemaHash: input.schemaFingerprint,
        summary: summarizeMetadata(input.metadata),
        metadata: enrichMetadata({
          metadata: input.metadata,
          connectionId: input.connectionId,
          stage: "fingerprinting",
          schemaFingerprint: input.schemaFingerprint,
          descriptions: existingDescriptions,
        }) as unknown as Prisma.InputJsonValue,
      },
    });
    await tx.databaseConnection.update({
      where: { id: input.connectionId },
      data: { schemaSyncStatus: "ready" },
    });
    return { snapshotId, snapshotVersion, existingDescriptions };
  });
}

async function completeSnapshot(input: {
  connectionId: ResourceId;
  snapshotId: ResourceId;
  metadata: CanonicalDataSourceMetadata;
  schemaFingerprint: string;
  descriptions: Record<string, SchemaEntityDescription>;
  embeddedEntityIds: string[];
}): Promise<void> {
  await withAppDbTransaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`schema-ingestion:${input.connectionId}`}))`;
    await tx.schemaSnapshot.update({
      where: { id: input.snapshotId },
      data: {
        status: "succeeded",
        schemaHash: input.schemaFingerprint,
        summary: summarizeMetadata(input.metadata),
        metadata: enrichMetadata({
          metadata: input.metadata,
          connectionId: input.connectionId,
          stage: "ready",
          schemaFingerprint: input.schemaFingerprint,
          descriptions: input.descriptions,
          embeddedEntityIds: input.embeddedEntityIds,
        }) as unknown as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    });
    const latest = await tx.schemaSnapshot.findFirst({
      where: { connectionId: input.connectionId },
      orderBy: { snapshotVersion: "desc" },
      select: { id: true },
    });
    if (latest?.id === input.snapshotId) {
      await tx.databaseConnection.update({
        where: { id: input.connectionId },
        data: { schemaSyncStatus: "ready", lastSchemaSyncAt: new Date() },
      });
    }
  });
}

async function failSnapshot(input: { connectionId: ResourceId; snapshotId: ResourceId; errorCode: string }): Promise<void> {
  await withAppDbTransaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`schema-ingestion:${input.connectionId}`}))`;
    await tx.schemaSnapshot.update({
      where: { id: input.snapshotId },
      data: { status: "failed", errorCode: input.errorCode, completedAt: new Date() },
    });
    const latest = await tx.schemaSnapshot.findFirst({
      where: { connectionId: input.connectionId },
      orderBy: { snapshotVersion: "desc" },
      select: { id: true },
    });
    if (latest?.id === input.snapshotId) {
      await tx.databaseConnection.update({ where: { id: input.connectionId }, data: { schemaSyncStatus: "error" } });
    }
  });
}

export async function processSchemaIngestionJob(data: SchemaIngestionJobData): Promise<{
  connectionId: ResourceId;
  schemaFingerprint: string;
  entityCount: number;
  embeddingPersistence: "persisted" | "metadata-only";
}> {
  devLog("info", "schema-ingestion.started", "Schema ingestion job started.", {
    connectionId: data.connectionId,
    intent: data.intent,
  });
  const { record, secret } = await getConnectionSecretForIngestion(data.connectionId);
  const adapter = getDataSourceAdapter(record.providerId);
  requireCapability(adapter, "metadata-introspection");

  let snapshotId: ResourceId | null = null;
  try {
    const startedAt = Date.now();
    await getAppDb().databaseConnection.update({
      where: { id: data.connectionId },
      data: { schemaSyncStatus: "running" },
    });

    const introspectionStartedAt = Date.now();
    devLog("info", "schema-ingestion.introspection.started", "Schema ingestion metadata introspection started.", {
      connectionId: data.connectionId,
    });
    const metadata = await adapter.introspectMetadata(secret, DEFAULT_OPTIONS);
    devLog("info", "schema-ingestion.introspection.completed", "Schema ingestion metadata introspection completed.", {
      connectionId: data.connectionId,
      durationMs: elapsedMs(introspectionStartedAt),
      entityCount: metadata.entities.length,
      relationshipCount: metadata.relationships.length,
    });

    const fingerprintStartedAt = Date.now();
    const schemaFingerprint = computeSchemaFingerprint(metadata);
    devLog("info", "schema-ingestion.fingerprint.completed", "Schema ingestion schema fingerprint computed.", {
      connectionId: data.connectionId,
      durationMs: elapsedMs(fingerprintStartedAt),
      schemaFingerprint,
    });

    const snapshot = await createIngestionSnapshot({
      connectionId: data.connectionId,
      ownerUserId: record.ownerUserId,
      metadata,
      schemaFingerprint,
    });
    snapshotId = snapshot.snapshotId;
    
    const samplingPromise = sampleEntityValues(data.connectionId, metadata, async (nextMetadata) => {
      // in-place mutation of metadata will be picked up by the next saveSnapshotProgress call
    }).catch(e => {});

    await saveSnapshotProgress({
      snapshotId,
      metadata,
      connectionId: data.connectionId,
      stage: "describing",
      schemaFingerprint,
      descriptions: snapshot.existingDescriptions,
    });

    const descriptionStartedAt = Date.now();
    devLog("info", "schema-ingestion.descriptions.started", "Schema ingestion entity description stage started.", {
      connectionId: data.connectionId,
      entityCount: metadata.entities.length,
      existingDescriptionCount: Object.keys(snapshot.existingDescriptions).length,
    });
    const descriptions = await describeEntities(metadata.entities, snapshot.existingDescriptions, async (nextDescriptions) => {
      await saveSnapshotProgress({
        snapshotId: snapshot.snapshotId,
        metadata,
        connectionId: data.connectionId,
        stage: "describing",
        schemaFingerprint,
        descriptions: nextDescriptions,
      });
      devLog("debug", "schema-ingestion.descriptions.progress", "Schema ingestion entity descriptions progressed.", {
        connectionId: data.connectionId,
        describedEntityCount: Object.keys(nextDescriptions).length,
        totalEntityCount: metadata.entities.length,
      });
    });
    devLog("info", "schema-ingestion.descriptions.completed", "Schema ingestion entity description stage completed.", {
      connectionId: data.connectionId,
      durationMs: elapsedMs(descriptionStartedAt),
      describedEntityCount: Object.keys(descriptions).length,
    });

    const embeddingStartedAt = Date.now();
    devLog("info", "schema-ingestion.embeddings.started", "Schema ingestion embedding stage started.", {
      connectionId: data.connectionId,
      entityCount: metadata.entities.length,
    });
    const embeddings = await createEmbeddingRecords({
      connectionId: data.connectionId,
      schemaFingerprint,
      entities: metadata.entities,
      descriptions,
    });

    const embeddedEntityIds = [...new Set(embeddings.map((embedding) => embedding.entityId))];
    await saveSnapshotProgress({
      snapshotId,
      metadata,
      connectionId: data.connectionId,
      stage: "embedding",
      schemaFingerprint,
      descriptions,
      embeddedEntityIds,
    });

    const embeddingPersistence = await withAppDbTransaction(async (tx) => persistSchemaEmbeddings(tx, embeddings));
    devLog("info", "schema-ingestion.embeddings.completed", "Schema ingestion embedding stage completed.", {
      connectionId: data.connectionId,
      durationMs: elapsedMs(embeddingStartedAt),
      embeddingRecordCount: embeddings.length,
      embeddedEntityCount: embeddedEntityIds.length,
      embeddingPersistence,
    });

    const completionStartedAt = Date.now();
    await samplingPromise;
    await completeSnapshot({
      connectionId: data.connectionId,
      snapshotId,
      metadata,
      schemaFingerprint,
      descriptions,
      embeddedEntityIds,
    });
    devLog("info", "schema-ingestion.snapshot.completed", "Schema ingestion snapshot completed.", {
      connectionId: data.connectionId,
      snapshotId,
      durationMs: elapsedMs(completionStartedAt),
    });
    devLog("info", "schema-ingestion.succeeded", "Schema ingestion job completed.", {
      connectionId: data.connectionId,
      schemaFingerprint,
      entityCount: metadata.entities.length,
      embeddingPersistence,
      durationMs: elapsedMs(startedAt),
    });
    return { connectionId: data.connectionId, schemaFingerprint, entityCount: metadata.entities.length, embeddingPersistence };
  } catch (error) {
    const errorCode = error instanceof AppError ? error.code : "INTERNAL_ERROR";
    devLogError("schema-ingestion.failed", "Schema ingestion job failed.", error, {
      connectionId: data.connectionId,
      snapshotId,
      errorCode,
    });
    if (snapshotId) {
      await failSnapshot({ connectionId: data.connectionId, snapshotId, errorCode });
    } else {
      await getAppDb().databaseConnection.update({ where: { id: data.connectionId }, data: { schemaSyncStatus: "error" } });
    }
    throw error;
  }
}
