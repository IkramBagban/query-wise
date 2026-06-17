import "server-only";

import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { CONTRACT_VERSION, type ResourceId } from "@/types/v2";
import { getAppDb, withAppDbTransaction } from "@/lib/v2/app-db";
import { AppError } from "@/lib/v2/dal/core";
import { requireOwnedConnection } from "@/lib/v2/dal/authorization";
import { createResourceId } from "@/lib/v2/domain/ids";
import { getDataSourceAdapter, requireCapability } from "@/lib/v2/data-sources";
import { getConnectionSecret } from "@/lib/v2/connections/credentials";
import { enqueueSchemaIngestion } from "@/lib/v2/ingestion";
import { devLog, devLogError } from "@/lib/v2/observability";

const DEFAULT_OPTIONS = {
  enableSampling: false, maxNamespaces: 100, maxEntities: 2_000, maxColumnsPerEntity: 500,
  maxRelationships: 10_000, timeoutMs: 30_000,
};

export async function refreshConnectionSchema(connectionId: ResourceId) {
  const record = await requireOwnedConnection(connectionId);
  await enqueueSchemaIngestion({ connectionId, ownerUserId: record.ownerUserId, intent: "manual-refresh" });
  return { contractVersion: CONTRACT_VERSION, connectionId, status: "queued" as const, summary: "Schema ingestion queued." };
}

export async function refreshConnectionSchemaInline(connectionId: ResourceId) {
  devLog("info", "schema.refresh.started", "Schema refresh started.", { connectionId });
  const { record, secret } = await getConnectionSecret(connectionId);
  const adapter = getDataSourceAdapter(record.providerId);
  requireCapability(adapter, "metadata-introspection");
  const snapshotId = createResourceId();
  const snapshotVersion = await withAppDbTransaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`schema-refresh:${connectionId}`}))`;
    const latest = await tx.schemaSnapshot.findFirst({ where: { connectionId }, orderBy: { snapshotVersion: "desc" } });
    const version = (latest?.snapshotVersion ?? 0) + 1;
    await tx.schemaSnapshot.create({
      data: { id: snapshotId, ownerUserId: record.ownerUserId, connectionId, snapshotVersion: version, status: "syncing" },
    });
    await tx.databaseConnection.update({ where: { id: connectionId }, data: { schemaSyncStatus: "running" } });
    return version;
  });
  try {
    const metadata = await adapter.introspectMetadata(secret, DEFAULT_OPTIONS);
    metadata.snapshotVersion = snapshotVersion;
    const serialized = JSON.stringify(metadata);
    const summary = `${metadata.namespaces.length} schemas, ${metadata.entities.length} entities, ${metadata.relationships.length} relationships`;
    await withAppDbTransaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`schema-refresh:${connectionId}`}))`;
      await tx.schemaSnapshot.update({
        where: { id: snapshotId }, data: {
          status: "succeeded", metadata: metadata as unknown as Prisma.InputJsonValue, summary,
          schemaHash: createHash("sha256").update(serialized).digest("hex"), completedAt: new Date(),
        },
      });
      const latest = await tx.schemaSnapshot.findFirst({ where: { connectionId }, orderBy: { snapshotVersion: "desc" }, select: { id: true } });
      if (latest?.id === snapshotId) {
        await tx.databaseConnection.update({
          where: { id: connectionId }, data: { schemaSyncStatus: "ready", lastSchemaSyncAt: new Date() },
        });
      }
    });
    devLog("info", "schema.refresh.succeeded", "Schema refresh completed.", {
      connectionId,
      snapshotVersion,
      entityCount: metadata.entities.length,
      relationshipCount: metadata.relationships.length,
    });
    return { contractVersion: CONTRACT_VERSION, connectionId, snapshotVersion, status: "ready" as const, summary };
  } catch (error) {
    const code = error instanceof AppError ? error.code : "INTERNAL_ERROR";
    devLogError("schema.refresh.failed", "Schema refresh failed.", error, {
      connectionId,
      snapshotVersion,
      errorCode: code,
    });
    await withAppDbTransaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`schema-refresh:${connectionId}`}))`;
      await tx.schemaSnapshot.update({ where: { id: snapshotId }, data: { status: "failed", errorCode: code, completedAt: new Date() } });
      const latest = await tx.schemaSnapshot.findFirst({ where: { connectionId }, orderBy: { snapshotVersion: "desc" }, select: { id: true } });
      if (latest?.id === snapshotId) {
        await tx.databaseConnection.update({ where: { id: connectionId }, data: { schemaSyncStatus: "error" } });
      }
    });
    throw error;
  }
}

export async function getLatestConnectionSchema(connectionId: ResourceId) {
  const record = await requireOwnedConnection(connectionId);
  const snapshot = await getAppDb().schemaSnapshot.findFirst({
    where: { connectionId, ownerUserId: record.ownerUserId, status: "succeeded" },
    orderBy: { snapshotVersion: "desc" },
  });
  if (!snapshot?.metadata) throw new AppError("SCHEMA_SNAPSHOT_UNAVAILABLE", "No usable schema snapshot is available.", true);
  return {
    contractVersion: CONTRACT_VERSION, connectionId, snapshotVersion: snapshot.snapshotVersion,
    measuredAt: snapshot.completedAt?.toISOString() ?? snapshot.updatedAt.toISOString(), summary: snapshot.summary,
    metadata: snapshot.metadata,
  };
}
