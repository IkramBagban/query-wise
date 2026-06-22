import "server-only";

import type { DatabaseConnection } from "@prisma/client";
import type { DataSourceSecret, EncryptedPayload, ResourceId } from "@/types/v2";
import { getAppDb } from "@/lib/v2/app-db";
import { AppError } from "@/lib/v2/dal/core";
import { decryptSecret } from "@/lib/v2/security/encryption";

export async function getConnectionSecret(connectionId: ResourceId): Promise<{ record: DatabaseConnection; secret: DataSourceSecret }> {
  const { requireOwnedConnection } = await import("@/lib/v2/dal/authorization");
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
