import { getAppDb, type AppDbTransaction } from "../app-db";
import { createResourceId } from "../domain";
import {
  type EffectiveLimits,
  type PlanId,
  type PlanLimitOverrides,
  resolveEffectiveLimits,
} from "./catalog";

export type PlanStatus = "active" | "disabled";
export type PlanSource = "default" | "manual";

/** Resolved plan for one user: catalog + overrides folded into effective limits. */
export interface ResolvedUserPlan {
  userId: string;
  planId: PlanId;
  status: PlanStatus;
  source: PlanSource;
  proGrantedAt: Date | null;
  overrides: PlanLimitOverrides;
  limits: EffectiveLimits;
}

type Db = ReturnType<typeof getAppDb> | AppDbTransaction;

function toResolved(row: {
  userId: string;
  planId: string;
  status: string;
  source: string;
  proGrantedAt: Date | null;
  questionsPerDayOverride: number | null;
  questionsPerMonthOverride: number | null;
  maxConnectionsOverride: number | null;
  maxDashboardsOverride: number | null;
  schemaRefreshesPerDayOverride: number | null;
}): ResolvedUserPlan {
  const planId = (row.planId === "pro" ? "pro" : "free") as PlanId;
  const overrides: PlanLimitOverrides = {
    questionsPerDayOverride: row.questionsPerDayOverride,
    questionsPerMonthOverride: row.questionsPerMonthOverride,
    maxConnectionsOverride: row.maxConnectionsOverride,
    maxDashboardsOverride: row.maxDashboardsOverride,
    schemaRefreshesPerDayOverride: row.schemaRefreshesPerDayOverride,
  };
  return {
    userId: row.userId,
    planId,
    status: (row.status === "disabled" ? "disabled" : "active") as PlanStatus,
    source: (row.source === "manual" ? "manual" : "default") as PlanSource,
    proGrantedAt: row.proGrantedAt,
    overrides,
    limits: resolveEffectiveLimits(planId, overrides),
  };
}

/**
 * Resolve a user's plan, lazily creating a Free row on first authenticated
 * enforcement (there is no signup hook). A missing row is always treated as
 * Free. Also lazily seeds the lifetime totals row.
 *
 * Callers in the web app should wrap this in a per-request cache to avoid an
 * upsert per API call.
 */
export async function getUserPlan(userId: string, db: Db = getAppDb()): Promise<ResolvedUserPlan> {
  const existing = await db.userPlan.findUnique({ where: { userId } });
  if (existing) return toResolved(existing);

  // Lazy backfill. upsert keeps this safe under concurrent first requests.
  const created = await db.userPlan.upsert({
    where: { userId },
    create: { id: createResourceId(), userId },
    update: {},
  });
  await db.userUsageTotals
    .upsert({ where: { userId }, create: { userId }, update: {} })
    .catch(() => undefined);
  return toResolved(created);
}
