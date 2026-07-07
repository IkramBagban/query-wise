
import { Prisma } from "@prisma/client";
import type { CanonicalDataSourceMetadata, MetadataEntity, MetadataRelationship, ResourceId } from "@query-wise/shared/types";
import { getAppDb, withAppDbTransaction } from "@query-wise/shared/app-db";
import { AppError } from "@query-wise/shared/dal/core";
import { createResourceId } from "@query-wise/shared/domain";
import { getDataSourceAdapter, requireCapability } from "@query-wise/shared/data-sources";
import { getConnectionSecretForIngestion } from "@query-wise/shared/connections";
import { devLog, devLogError } from "@query-wise/shared/observability";
import { describeEntities, createEmbeddingRecords } from "./enrichment";
import { computeEntityFingerprint, computeSchemaFingerprint, summarizeMetadata } from "./fingerprint";
import { loadEmbeddingResumeState, persistSchemaEmbeddings } from "./vector-store";
import { sampleEntityValues } from "./sampling";
import { profileEntities } from "./profiling";
import { inferJoinRelationships } from "./join-inference";
import { scoreAndRankEntities } from "./importance";
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

/** Persist a snapshot checkpoint at most once every N invocations to bound DB write amplification. */
function throttle(persist: () => Promise<void>, everyN = 15): () => Promise<void> {
  let count = 0;
  return async () => {
    count += 1;
    if (count % everyN === 0) await persist();
  };
}

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
  // Introspection/fingerprinting run before a snapshot exists, so the connection is not yet queryable.
  if (stage === "introspecting" || stage === "fingerprinting") return "running";
  // Progressive readiness (P0): once a snapshot exists, the schema is queryable. Profiling, sampling,
  // describing, and embedding are background enrichment that must not flip the connection back to
  // un-queryable.
  if (stage === "profiling" || stage === "sampling" || stage === "describing" || stage === "embedding" || stage === "ready") {
    return "ready";
  }
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

function readEntities(metadata: unknown): MetadataEntity[] {
  const maybeMetadata = metadata as Partial<CanonicalDataSourceMetadata> | null;
  return Array.isArray(maybeMetadata?.entities) ? (maybeMetadata!.entities as MetadataEntity[]) : [];
}

function readRelationships(metadata: unknown): MetadataRelationship[] {
  const maybeMetadata = metadata as Partial<CanonicalDataSourceMetadata> | null;
  return Array.isArray(maybeMetadata?.relationships) ? (maybeMetadata!.relationships as MetadataRelationship[]) : [];
}

/**
 * SPEC-03 §2 resumability: carry per-entity profile/sample enrichment and prior inferred join edges
 * forward from the last snapshot for entities whose structural fingerprint is unchanged, so retries
 * skip already-done work. Mutates `metadata.entities` in place and returns carried inferred edges.
 */
function carryForwardEnrichment(metadata: CanonicalDataSourceMetadata, priorMetadata: unknown): MetadataRelationship[] {
  const priorEntities = readEntities(priorMetadata);
  if (priorEntities.length === 0) return [];

  const priorByFingerprint = new Map<string, MetadataEntity>();
  const priorById = new Map<string, MetadataEntity>();
  for (const entity of priorEntities) {
    priorByFingerprint.set(computeEntityFingerprint(entity), entity);
    priorById.set(entity.id, entity);
  }

  const unchangedEntityIds = new Set<string>();
  const currentEntityIds = new Set<string>();
  for (const entity of metadata.entities) {
    currentEntityIds.add(entity.id);
    const fingerprint = computeEntityFingerprint(entity);
    const match = priorByFingerprint.get(fingerprint);
    const priorSameId = priorById.get(entity.id);
    if (priorSameId && computeEntityFingerprint(priorSameId) === fingerprint) unchangedEntityIds.add(entity.id);
    if (!match) continue;
    if (match.columnProfiles && match.profiledFingerprint === fingerprint) {
      entity.columnProfiles = match.columnProfiles;
      entity.profiledFingerprint = fingerprint;
      entity.profiledAt = match.profiledAt;
    }
    if (match.topValues && match.sampledFingerprint === fingerprint) {
      entity.topValues = match.topValues;
      entity.sampledFingerprint = fingerprint;
      entity.sampledAt = match.sampledAt;
    }
  }

  // Reuse prior inferred edges only when both endpoints are unchanged and still present.
  return readRelationships(priorMetadata).filter(
    (relationship) =>
      relationship.inferred === true &&
      currentEntityIds.has(relationship.fromEntityId) &&
      currentEntityIds.has(relationship.toEntityId) &&
      unchangedEntityIds.has(relationship.fromEntityId) &&
      unchangedEntityIds.has(relationship.toEntityId),
  );
}

async function createIngestionSnapshot(input: {
  connectionId: ResourceId;
  ownerUserId: string;
  metadata: CanonicalDataSourceMetadata;
  schemaFingerprint: string;
}): Promise<{ snapshotId: ResourceId; snapshotVersion: number; existingDescriptions: Record<string, SchemaEntityDescription>; carriedInferred: MetadataRelationship[] }> {
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
    const priorMetadata = latestSuccessful?.metadata ?? latest?.metadata;
    const existingDescriptions = readDescriptions(priorMetadata);
    // Carry profile/sample enrichment + inferred edges forward before persisting the first snapshot.
    const carriedInferred = carryForwardEnrichment(input.metadata, priorMetadata);
    if (carriedInferred.length > 0) input.metadata.relationships.push(...carriedInferred);

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
    return { snapshotId, snapshotVersion, existingDescriptions, carriedInferred };
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

    // ── Stage: introspect (the ONLY stage whose failure fails the whole job). ─────────────────────
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

    // Fingerprint is computed from declared introspection only, before any inferred edges are added,
    // so it stays stable across runs and inferred joins never perturb per-entity reuse.
    const schemaFingerprint = computeSchemaFingerprint(metadata);

    // ── Stage: importance scoring (§1) — orders every downstream enrichment stage. ────────────────
    const ranked = scoreAndRankEntities(metadata.entities, metadata.relationships);

    const snapshot = await createIngestionSnapshot({
      connectionId: data.connectionId,
      ownerUserId: record.ownerUserId,
      metadata,
      schemaFingerprint,
    });
    snapshotId = snapshot.snapshotId;
    const existingDescriptions = snapshot.existingDescriptions;
    // Snapshot is now queryable (progressive readiness preserved). Every stage below is individually
    // failure-tolerant: it catches its own errors and continues so one stage never blocks the next.

    // ── Stage: profile (§3) — pg_stats then bounded MIN/MAX, importance-ordered, resumable. ───────
    const profileStartedAt = Date.now();
    try {
      await profileEntities(
        data.connectionId,
        ranked,
        throttle(() =>
          saveSnapshotProgress({
            snapshotId: snapshot.snapshotId,
            metadata,
            connectionId: data.connectionId,
            stage: "profiling",
            schemaFingerprint,
            descriptions: existingDescriptions,
          }),
        ),
      );
    } catch (error) {
      devLogError("schema-ingestion.profiling.stage-failed", "Profiling stage failed; continuing.", error, { connectionId: data.connectionId });
    }
    await saveSnapshotProgress({ snapshotId, metadata, connectionId: data.connectionId, stage: "profiling", schemaFingerprint, descriptions: existingDescriptions });
    devLog("info", "schema-ingestion.profiling.completed", "Schema ingestion profiling stage completed.", { connectionId: data.connectionId, durationMs: elapsedMs(profileStartedAt) });

    // ── Stage: join inference (§5) — runs in the profile/sample window; appends inferred edges. ───
    try {
      const inference = await inferJoinRelationships(data.connectionId, metadata.entities, metadata.relationships);
      if (inference.added.length > 0) {
        metadata.relationships.push(...inference.added);
        await saveSnapshotProgress({ snapshotId, metadata, connectionId: data.connectionId, stage: "profiling", schemaFingerprint, descriptions: existingDescriptions });
      }
    } catch (error) {
      devLogError("schema-ingestion.join-inference.stage-failed", "Join inference stage failed; continuing.", error, { connectionId: data.connectionId });
    }

    // ── Stage: sample (§4) — importance-ordered, per-table budget, concurrent, resumable. ─────────
    const sampleStartedAt = Date.now();
    try {
      await sampleEntityValues(
        data.connectionId,
        ranked,
        throttle(() =>
          saveSnapshotProgress({
            snapshotId: snapshot.snapshotId,
            metadata,
            connectionId: data.connectionId,
            stage: "sampling",
            schemaFingerprint,
            descriptions: existingDescriptions,
          }),
        ),
      );
    } catch (error) {
      devLogError("schema-ingestion.sampling.stage-failed", "Sampling stage failed; continuing.", error, { connectionId: data.connectionId });
    }
    await saveSnapshotProgress({ snapshotId, metadata, connectionId: data.connectionId, stage: "sampling", schemaFingerprint, descriptions: existingDescriptions });
    devLog("info", "schema-ingestion.sampling.completed", "Schema ingestion sampling stage completed.", { connectionId: data.connectionId, durationMs: elapsedMs(sampleStartedAt) });

    // ── Stage: describe (§2) — importance-ordered; per-entity fingerprint reuse already built in. ─
    const descriptionStartedAt = Date.now();
    devLog("info", "schema-ingestion.descriptions.started", "Schema ingestion entity description stage started.", {
      connectionId: data.connectionId,
      entityCount: metadata.entities.length,
      existingDescriptionCount: Object.keys(existingDescriptions).length,
    });
    let descriptions = existingDescriptions;
    try {
      descriptions = await describeEntities(ranked, existingDescriptions, async (nextDescriptions) => {
        await saveSnapshotProgress({
          snapshotId: snapshot.snapshotId,
          metadata,
          connectionId: data.connectionId,
          stage: "describing",
          schemaFingerprint,
          descriptions: nextDescriptions,
        });
      });
    } catch (error) {
      devLogError("schema-ingestion.descriptions.stage-failed", "Description stage failed; continuing with existing/fallback descriptions.", error, { connectionId: data.connectionId });
    }
    devLog("info", "schema-ingestion.descriptions.completed", "Schema ingestion entity description stage completed.", {
      connectionId: data.connectionId,
      durationMs: elapsedMs(descriptionStartedAt),
      describedEntityCount: Object.keys(descriptions).length,
    });

    // ── Stage: embed (§2/§6.1) — importance-ordered, resumable, model-drift-safe. ─────────────────
    const embeddingStartedAt = Date.now();
    const currentEmbeddingModel = process.env.QUERYWISE_EMBEDDING_MODEL ?? null;
    let embeddedEntityIds: string[] = [];
    let embeddingPersistence: "persisted" | "metadata-only" = "metadata-only";
    try {
      const resume = await loadEmbeddingResumeState({ connectionId: data.connectionId, schemaFingerprint, currentModel: currentEmbeddingModel });
      if (resume.driftModels.length > 0) {
        devLog("warn", "schema-ingestion.embedding-model-drift", "Existing embeddings use a different model; re-embedding all entities.", {
          connectionId: data.connectionId,
          currentModel: currentEmbeddingModel,
          priorModels: resume.driftModels,
        });
      }
      // On model drift, force a full re-embed so retrieval never silently degrades to a stale model.
      const alreadyEmbeddedEntityIds = resume.driftModels.length > 0 ? new Set<string>() : resume.alreadyEmbedded;
      const embeddings = await createEmbeddingRecords({
        connectionId: data.connectionId,
        schemaFingerprint,
        entities: ranked,
        descriptions,
        alreadyEmbeddedEntityIds,
      });
      embeddedEntityIds = [...new Set([...alreadyEmbeddedEntityIds, ...embeddings.map((embedding) => embedding.entityId)])];
      embeddingPersistence = await withAppDbTransaction(async (tx) => persistSchemaEmbeddings(tx, embeddings));
      devLog("info", "schema-ingestion.embeddings.completed", "Schema ingestion embedding stage completed.", {
        connectionId: data.connectionId,
        durationMs: elapsedMs(embeddingStartedAt),
        embeddingRecordCount: embeddings.length,
        embeddedEntityCount: embeddedEntityIds.length,
        embeddingPersistence,
      });
    } catch (error) {
      devLogError("schema-ingestion.embeddings.stage-failed", "Embedding stage failed; snapshot still completes.", error, { connectionId: data.connectionId });
    }
    await saveSnapshotProgress({ snapshotId, metadata, connectionId: data.connectionId, stage: "embedding", schemaFingerprint, descriptions, embeddedEntityIds });

    // ── Stage: complete. ──────────────────────────────────────────────────────────────────────────
    const completionStartedAt = Date.now();
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
