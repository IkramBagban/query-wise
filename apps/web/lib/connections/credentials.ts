import "server-only";

import type { DatabaseConnection } from "@prisma/client";
import type { DataSourceSecret, EncryptedPayload, ResourceId } from "@query-wise/shared/types";
import { getAppDb } from "@query-wise/shared/app-db";
import { AppError } from "@query-wise/shared/dal/core";
import { decryptSecret } from "@query-wise/shared/security";

export async function getConnectionSecret(connectionId: ResourceId): Promise<{ record: DatabaseConnection; secret: DataSourceSecret }> {
  const { requireOwnedConnection } = await import("@/lib/dal/authorization");
  const record = await requireOwnedConnection(connectionId);
  if (!record.encryptedSecret) throw new AppError("DATA_SOURCE_UNAVAILABLE", "The data source credentials are unavailable.", false);
  const connectionString = await decryptSecret(record.encryptedSecret as unknown as EncryptedPayload);
  return { record, secret: { connectionString } };
}

export async function getConnectionSecretForIngestion(connectionId: ResourceId): Promise<{ record: DatabaseConnection; secret: DataSourceSecret }> {
  const record = await getAppDb().databaseConnection.findFirst({
    where: { id: connectionId, deletedAt: null, status: { not: "deleted" } },
  });
  if (!record?.encryptedSecret) throw new AppError("DATA_SOURCE_UNAVAILABLE", "The data source credentials are unavailable.", false);
  const connectionString = await decryptSecret(record.encryptedSecret as unknown as EncryptedPayload);
  return { record, secret: { connectionString } };
}

export async function getConnectionSecretForOwner(
  connectionId: ResourceId,
  ownerUserId: string,
): Promise<{ record: DatabaseConnection; secret: DataSourceSecret }> {
  const record = await getAppDb().databaseConnection.findFirst({
    where: { id: connectionId, ownerUserId, deletedAt: null, status: { not: "deleted" } },
  });
  if (!record?.encryptedSecret) {
    throw new AppError("DATA_SOURCE_UNAVAILABLE", "The data source credentials are unavailable.", false);
  }
  const connectionString = await decryptSecret(record.encryptedSecret as unknown as EncryptedPayload);
  return { record, secret: { connectionString } };
}
