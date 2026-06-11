import "server-only";

import { Prisma } from "@prisma/client";
import type {
  Conversation,
  Dashboard,
  DatabaseConnection,
} from "@prisma/client";
import { getAppDb } from "@/lib/v2/app-db";
import { requireUser } from "@/lib/v2/auth";
import {
  activeOwnedResourceWhere,
  requireFound,
  resourceNotFound,
} from "@/lib/v2/dal/core";
import type { ResourceId } from "@/types/v2";
import { claimPendingEmailGrants } from "@/lib/v2/sharing/grants";

export type ConnectionSecretRecord = DatabaseConnection;
export type AuthorizedConversationRecord = Conversation;
export type AuthorizedDashboardRecord = Dashboard;
export type DashboardPermission = "view" | "edit";

export async function requireOwnedConnection(
  connectionId: ResourceId,
): Promise<ConnectionSecretRecord> {
  const { userId } = await requireUser();
  const connection = await getAppDb().databaseConnection.findFirst({
    where: activeOwnedResourceWhere(userId, connectionId),
  });

  return requireFound(connection);
}

export async function requireConversationAccess(
  conversationId: ResourceId,
): Promise<AuthorizedConversationRecord> {
  const { userId } = await requireUser();
  const conversation = await getAppDb().conversation.findFirst({
    where: activeOwnedResourceWhere(userId, conversationId),
  });

  return requireFound(conversation);
}

export async function requireDashboardAccess(
  dashboardId: ResourceId,
  permission: DashboardPermission,
): Promise<AuthorizedDashboardRecord> {
  const { userId } = await requireUser();
  await claimPendingEmailGrants(userId);
  const db = getAppDb();
  const ownedDashboard = await db.dashboard.findFirst({
    where: activeOwnedResourceWhere(userId, dashboardId),
  });

  if (ownedDashboard) {
    return ownedDashboard;
  }

  if (permission === "edit") {
    throw resourceNotFound();
  }

  const [grantedDashboard] = await db.$queryRaw<Dashboard[]>(Prisma.sql`
    SELECT
      dashboard.id,
      dashboard.owner_user_id AS "ownerUserId",
      dashboard.name,
      dashboard.deleted_at AS "deletedAt",
      dashboard.created_at AS "createdAt",
      dashboard.updated_at AS "updatedAt"
    FROM v2_dashboards AS dashboard
    INNER JOIN v2_dashboard_access_grants AS access_grant
      ON access_grant.dashboard_id = dashboard.id
    WHERE dashboard.id = ${dashboardId}::uuid
      AND dashboard.deleted_at IS NULL
      AND access_grant.recipient_user_id = ${userId}
      AND access_grant.permission = 'view'
    LIMIT 1
  `);

  return requireFound(grantedDashboard);
}
