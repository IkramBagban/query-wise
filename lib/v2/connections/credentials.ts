import "server-only";

import type { DatabaseConnection } from "@prisma/client";
import type { DataSourceSecret, EncryptedPayload, ResourceId } from "@/types/v2";
import { requireOwnedConnection } from "@/lib/v2/dal/authorization";
import { AppError } from "@/lib/v2/dal/core";
import { decryptSecret } from "@/lib/v2/security/encryption";

export async function getConnectionSecret(connectionId: ResourceId): Promise<{ record: DatabaseConnection; secret: DataSourceSecret }> {
  const record = await requireOwnedConnection(connectionId);
  if (!record.encryptedSecret) throw new AppError("DATA_SOURCE_UNAVAILABLE", "The data source credentials are unavailable.", false);
  const connectionString = await decryptSecret(record.encryptedSecret as unknown as EncryptedPayload);
  return { record, secret: { connectionString } };
}
