import { AppError } from "@query-wise/shared/dal/core";

/** SPEC-13 §4: a connection is "deleted" once its soft-delete timestamp is set. */
export function isConnectionDeleted(connection: { deletedAt: Date | null }): boolean {
  return connection.deletedAt !== null;
}

/**
 * SPEC-13 §4 (defense in depth): write/execute paths hard-reject a conversation
 * whose bound data source was deleted. Read paths never call this — they degrade
 * to read-only history via `isConnectionDeleted` instead.
 */
export function assertConnectionNotDeleted(connection: { deletedAt: Date | null }): void {
  if (isConnectionDeleted(connection)) {
    throw new AppError(
      "CONNECTION_DELETED",
      "This chat's data source was deleted. You can view its history but can't ask new questions.",
    );
  }
}
