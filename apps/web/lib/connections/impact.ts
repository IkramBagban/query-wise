import "server-only";

import { getAppDb } from "@query-wise/shared/app-db";
import { CONTRACT_VERSION } from "@query-wise/shared/types";
import type { ResourceId } from "@query-wise/shared/types";
import { requireOwnedConnection } from "@/lib/dal/authorization";

export interface ConnectionDeletionImpact {
  contractVersion: typeof CONTRACT_VERSION;
  conversations: number;
  dashboards: number;
  liveShareLinks: number;
  snapshotShareLinks: number;
}

/**
 * SPEC-13 §2: dependent counts shown in the delete-impact dialog before a
 * connection is removed. Ownership is asserted first (requireOwnedConnection), so
 * every count below is already scoped to the caller's own resources.
 *
 * - conversations: active chats bound to this connection (become read-only).
 * - dashboards: dashboards with ≥1 widget on this connection (stop refreshing).
 * - liveShareLinks: active (non-revoked, non-expired) live links on those
 *   dashboards (revoked at delete time).
 * - snapshotShareLinks: active snapshot links on those dashboards (unaffected).
 */
export async function getConnectionDeletionImpact(
  connectionId: ResourceId,
): Promise<ConnectionDeletionImpact> {
  await requireOwnedConnection(connectionId);
  const db = getAppDb();

  const [conversations, widgetDashboards] = await Promise.all([
    db.conversation.count({ where: { connectionId, deletedAt: null } }),
    db.dashboardWidget.findMany({
      where: { connectionId },
      select: { dashboardId: true },
      distinct: ["dashboardId"],
    }),
  ]);

  const dashboardIds = widgetDashboards.map((row) => row.dashboardId);
  if (dashboardIds.length === 0) {
    return {
      contractVersion: CONTRACT_VERSION,
      conversations,
      dashboards: 0,
      liveShareLinks: 0,
      snapshotShareLinks: 0,
    };
  }

  const now = new Date();
  const activeLinkWhere = (mode: "live" | "snapshot") => ({
    dashboardId: { in: dashboardIds },
    revokedAt: null,
    mode,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  });

  const [liveShareLinks, snapshotShareLinks] = await Promise.all([
    db.dashboardShareLink.count({ where: activeLinkWhere("live") }),
    db.dashboardShareLink.count({ where: activeLinkWhere("snapshot") }),
  ]);

  return {
    contractVersion: CONTRACT_VERSION,
    conversations,
    dashboards: dashboardIds.length,
    liveShareLinks,
    snapshotShareLinks,
  };
}
