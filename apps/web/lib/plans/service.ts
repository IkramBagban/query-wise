import "server-only";

import { cache } from "react";
import { getAppDb } from "@query-wise/shared/app-db";
import { AppError } from "@query-wise/shared/dal/core";
import { getUserPlan, type ResolvedUserPlan } from "@query-wise/shared/plans";
import { requireUser } from "@/lib/auth";

/**
 * Resolve the signed-in user's plan once per request. `cache` memoizes the call
 * for the lifetime of a single server request so repeated enforcement checks do
 * not each hit the database or re-run the lazy upsert.
 */
export const requireUserPlan = cache(async (): Promise<{ userId: string; plan: ResolvedUserPlan }> => {
  const { userId } = await requireUser();
  const plan = await getUserPlan(userId);
  return { userId, plan };
});

/** Same resolution keyed by an already-authenticated user id (no extra auth call). */
export const getPlanForUser = cache((userId: string): Promise<ResolvedUserPlan> => getUserPlan(userId));

/**
 * Block every plan-enforced mutation when an operator has disabled the account.
 * Reads stay allowed (callers only invoke this on write paths). Idempotent.
 */
export function assertAccountActive(plan: ResolvedUserPlan): void {
  if (plan.status === "disabled") {
    throw new AppError("ACCOUNT_DISABLED", "This account is disabled. Contact support.");
  }
}

/** Count the user's non-demo, non-deleted connections (the demo is slot-exempt). */
export async function countNonDemoConnections(userId: string): Promise<number> {
  return getAppDb().databaseConnection.count({
    where: { ownerUserId: userId, deletedAt: null, isDemo: false },
  });
}

export async function assertConnectionQuota(userId: string, plan: ResolvedUserPlan): Promise<void> {
  const count = await countNonDemoConnections(userId);
  if (count >= plan.limits.maxConnectionsNonDemo) {
    throw new AppError(
      "PLAN_LIMIT_CONNECTIONS",
      `Your plan allows ${plan.limits.maxConnectionsNonDemo} database connection${plan.limits.maxConnectionsNonDemo === 1 ? "" : "s"}. Delete one to add another, or use a Pro account.`,
    );
  }
}

export async function countDashboards(userId: string): Promise<number> {
  return getAppDb().dashboard.count({ where: { ownerUserId: userId, deletedAt: null } });
}

export async function assertDashboardQuota(userId: string, plan: ResolvedUserPlan): Promise<void> {
  const count = await countDashboards(userId);
  if (count >= plan.limits.maxDashboards) {
    throw new AppError(
      "PLAN_LIMIT_DASHBOARDS",
      `Your plan allows ${plan.limits.maxDashboards} dashboard${plan.limits.maxDashboards === 1 ? "" : "s"}. Delete one to add another, or use a Pro account.`,
    );
  }
}

/** IDs of the user's non-deleted dashboards — the scope for the share-link cap. */
async function ownedDashboardIds(userId: string): Promise<string[]> {
  const rows = await getAppDb().dashboard.findMany({
    where: { ownerUserId: userId, deletedAt: null },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

/** Count active (non-revoked, non-expired) public share links across the user's dashboards. */
export async function countActiveShareLinks(userId: string, now: Date = new Date()): Promise<number> {
  const dashboardIds = await ownedDashboardIds(userId);
  if (dashboardIds.length === 0) return 0;
  return getAppDb().dashboardShareLink.count({
    where: {
      dashboardId: { in: dashboardIds },
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  });
}

export async function assertShareQuota(userId: string, plan: ResolvedUserPlan): Promise<void> {
  const count = await countActiveShareLinks(userId);
  if (count >= plan.limits.maxActiveShareLinks) {
    throw new AppError(
      "PLAN_LIMIT_SHARES",
      `Your plan allows ${plan.limits.maxActiveShareLinks} active public share${plan.limits.maxActiveShareLinks === 1 ? " link" : " links"}. Revoke one to create another, or use a Pro account.`,
    );
  }
}

/** Password-protected shares are a Pro feature. */
export function assertPasswordShareAllowed(plan: ResolvedUserPlan, wantsPassword: boolean): void {
  if (wantsPassword && !plan.limits.allowPasswordShares) {
    throw new AppError(
      "PLAN_FEATURE_PASSWORD_SHARES",
      "Password-protected shares are available on Pro (coming soon for self-serve).",
    );
  }
}
