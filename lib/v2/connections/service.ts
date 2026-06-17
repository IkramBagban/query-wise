import "server-only";

import { Prisma, type DatabaseConnection } from "@prisma/client";
import type { ConnectionDto, ResourceId } from "@/types/v2";
import { CONTRACT_VERSION } from "@/types/v2";
import { getAppDb, withAppDbTransaction } from "@/lib/v2/app-db";
import { requireUser } from "@/lib/v2/auth";
import { requireOwnedConnection } from "@/lib/v2/dal/authorization";
import { AppError, decodeCursor, encodeCursor, normalizePageLimit } from "@/lib/v2/dal/core";
import { createResourceId } from "@/lib/v2/domain/ids";
import { encryptSecret } from "@/lib/v2/security/encryption";
import { getDataSourceAdapter, requireCapability } from "@/lib/v2/data-sources";
import { parsePostgresUrl } from "@/lib/v2/data-sources/postgresql/url";
import { enqueueSchemaIngestion } from "@/lib/v2/ingestion";
import { getConnectionSecret } from "./credentials";
import { devLog, devLogError } from "@/lib/v2/observability";

function dto(record: DatabaseConnection): ConnectionDto {
  const adapter = getDataSourceAdapter(record.providerId);
  return {
    contractVersion: CONTRACT_VERSION, id: record.id, providerId: adapter.providerId, dialectId: adapter.dialectId,
    name: record.name, hostDisplay: record.hostDisplay, port: record.port, databaseName: record.databaseName,
    status: record.status === "deleted" ? "deleting" : record.status,
    lastTestedAt: record.lastTestedAt?.toISOString() ?? null, lastSchemaSyncAt: record.lastSchemaSyncAt?.toISOString() ?? null,
    schemaSyncStatus: record.schemaSyncStatus, capabilities: [...adapter.capabilities],
  };
}

export async function listConnections(input: { cursor?: string; limit?: number }) {
  const { userId } = await requireUser();
  const limit = normalizePageLimit(input.limit);
  const sort = input.cursor ? decodeCursor(input.cursor, "connections", userId) : null;
  const cursorDate = sort?.[0] ? new Date(String(sort[0])) : null;
  const cursorId = sort?.[1] ? String(sort[1]) : null;
  const records = await getAppDb().databaseConnection.findMany({
    where: {
      ownerUserId: userId, deletedAt: null,
      ...(cursorDate && cursorId ? { OR: [{ updatedAt: { lt: cursorDate } }, { updatedAt: cursorDate, id: { lt: cursorId } }] } : {}),
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });
  const hasMore = records.length > limit;
  const items = records.slice(0, limit);
  const last = items.at(-1);
  return {
    contractVersion: CONTRACT_VERSION, items: items.map(dto),
    pageInfo: { hasMore, limit, nextCursor: hasMore && last ? encodeCursor("connections", userId, [last.updatedAt.toISOString(), last.id]) : null },
  };
}

export async function getConnection(connectionId: ResourceId): Promise<ConnectionDto> {
  return dto(await requireOwnedConnection(connectionId));
}

export async function createConnection(input: { name: string; providerId: "postgresql"; connectionString: string }): Promise<ConnectionDto> {
  const { userId } = await requireUser();
  const adapter = getDataSourceAdapter(input.providerId);
  requireCapability(adapter, "connection-test");
  const parsed = parsePostgresUrl(input.connectionString);
  devLog("info", "connection.create.started", "Connection creation started.", {
    providerId: input.providerId,
    host: parsed.hostDisplay,
    databaseName: parsed.databaseName,
  });
  const encryptedSecret = await encryptSecret(parsed.connectionString);
  const id = createResourceId();
  let record = await getAppDb().databaseConnection.create({
    data: {
      id, ownerUserId: userId, providerId: adapter.providerId, dialectId: adapter.dialectId, name: input.name,
      hostDisplay: parsed.hostDisplay, port: parsed.port, databaseName: parsed.databaseName,
      encryptedSecret: encryptedSecret as unknown as Prisma.InputJsonValue,
    },
  });
  const result = await adapter.testConnection({ connectionString: parsed.connectionString });
  devLog(result.success ? "info" : "warn", "connection.test.completed", "Connection test completed.", {
    connectionId: id,
    success: result.success,
    latencyMs: result.latencyMs,
    errorCode: result.errorCode,
  });
  record = await getAppDb().databaseConnection.update({
    where: { id }, data: {
      status: result.success ? "connected" : "error", lastTestedAt: new Date(),
      lastTestErrorCode: result.errorCode, schemaSyncStatus: result.success ? "queued" : "never",
    },
  });
  if (result.success) {
    await enqueueSchemaIngestion({ connectionId: id, ownerUserId: userId, intent: "initial-connect" }).catch((error) => {
      devLogError("connection.initial-schema-enqueue.failed", "Initial schema ingestion enqueue failed.", error, {
        connectionId: id,
      });
    });
    record = await requireOwnedConnection(id);
  }
  devLog("info", "connection.create.completed", "Connection creation completed.", {
    connectionId: id,
    status: record.status,
    schemaSyncStatus: record.schemaSyncStatus,
  });
  return dto(record);
}

export async function createDemoConnection(): Promise<ConnectionDto> {
  const configuredUrl = process.env.DEMO_DATABASE_URL;
  if (!configuredUrl) {
    throw new AppError("DATA_SOURCE_UNAVAILABLE", "The demo database is not configured.");
  }
  const url = new URL(configuredUrl);
  url.searchParams.set("sslmode", "verify-full");
  const { userId } = await requireUser();
  const existing = await getAppDb().databaseConnection.findFirst({
    where: {
      ownerUserId: userId,
      name: "QueryWise Demo (Ecommerce)",
      deletedAt: null,
    },
  });
  if (existing) return dto(existing);
  return createConnection({
    name: "QueryWise Demo (Ecommerce)",
    providerId: "postgresql",
    connectionString: url.toString(),
  });
}

export async function updateConnection(connectionId: ResourceId, input: { name?: string; connectionString?: string }): Promise<ConnectionDto> {
  const current = await requireOwnedConnection(connectionId);
  const adapter = getDataSourceAdapter(current.providerId);
  let credentialData: Prisma.DatabaseConnectionUpdateInput = {};
  if (input.connectionString) {
    const parsed = parsePostgresUrl(input.connectionString);
    credentialData = {
      hostDisplay: parsed.hostDisplay, port: parsed.port, databaseName: parsed.databaseName,
      encryptedSecret: await encryptSecret(parsed.connectionString) as unknown as Prisma.InputJsonValue,
      credentialVersion: { increment: 1 }, status: "pending", lastTestErrorCode: null, schemaSyncStatus: "queued",
    };
    await adapter.dispose(connectionId);
  }
  let record = await withAppDbTransaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`connection:${connectionId}`}))`;
    if (input.connectionString) {
      await tx.schemaSnapshot.updateMany({
        where: { connectionId, status: { in: ["queued", "syncing", "succeeded"] } },
        data: { status: "superseded" },
      });
    }
    return tx.databaseConnection.update({
      where: { id: connectionId },
      data: { ...credentialData, ...(input.name ? { name: input.name } : {}) },
    });
  });
  if (input.connectionString) {
    await enqueueSchemaIngestion({ connectionId, ownerUserId: current.ownerUserId, intent: "credential-refresh" }).catch((error) => {
      devLogError("connection.updated-schema-enqueue.failed", "Updated schema ingestion enqueue failed.", error, {
        connectionId,
      });
    });
    record = await requireOwnedConnection(connectionId);
  }
  return dto(record);
}

export async function testSavedConnection(connectionId: ResourceId) {
  const record = await requireOwnedConnection(connectionId);
  const adapter = getDataSourceAdapter(record.providerId);
  requireCapability(adapter, "connection-test");
  const { secret } = await getConnectionSecret(connectionId);
  const result = await adapter.testConnection(secret);
  await getAppDb().databaseConnection.update({
    where: { id: connectionId },
    data: { status: result.success ? "connected" : "error", lastTestedAt: new Date(), lastTestErrorCode: result.errorCode },
  });
  return { contractVersion: CONTRACT_VERSION, ...result };
}

export async function deleteConnection(connectionId: ResourceId): Promise<void> {
  const record = await requireOwnedConnection(connectionId);
  await withAppDbTransaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`connection:${connectionId}`}))`;
    await tx.schemaSnapshot.updateMany({ where: { connectionId, status: { in: ["queued", "syncing"] } }, data: { status: "superseded" } });
    const deleted = await tx.databaseConnection.updateMany({
      where: { id: connectionId, ownerUserId: record.ownerUserId, deletedAt: null },
      data: { status: "deleted", deletedAt: new Date(), encryptedSecret: Prisma.JsonNull },
    });
    if (deleted.count !== 1) throw new AppError("CONFLICT", "The connection changed while it was being deleted.");
  });
  await getDataSourceAdapter(record.providerId).dispose(connectionId);
}
