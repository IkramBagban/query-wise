import { getAppDb, type AppDbTransaction } from "../app-db";
import { createResourceId } from "../domain";
import {
  applyCouponGrants,
  type ActiveGrantDeltas,
  type EffectiveLimits,
  type PlanId,
  type PlanLimitOverrides,
  resolveEffectiveLimits,
} from "./catalog";

export type PlanStatus = "active" | "disabled";
export type PlanSource = "default" | "manual";

/**
 * SPEC-12: a read-only summary of one currently-active coupon grant. Powers UI
 * (the "Active boosts" list and countdowns); never consulted for enforcement —
 * `ResolvedUserPlan.limits` already folds these in.
 */
export interface ActiveGrantSummary {
  couponCode: string;
  grantExpiresAt: Date;
  questionsPerDayDelta: number;
  questionsPerMonthDelta: number;
  maxConnectionsDelta: number;
  maxDashboardsDelta: number;
  grantsPro: boolean;
}

/** Resolved plan for one user: catalog + overrides + active coupon grants folded into effective limits. */
export interface ResolvedUserPlan {
  userId: string;
  planId: PlanId;
  status: PlanStatus;
  source: PlanSource;
  proGrantedAt: Date | null;
  overrides: PlanLimitOverrides;
  limits: EffectiveLimits;
  /** Currently-active coupon grants (display only; already folded into `limits`). */
  activeGrants: ActiveGrantSummary[];
}

type Db = ReturnType<typeof getAppDb> | AppDbTransaction;

interface PlanRow {
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
}

interface GrantRow {
  couponId: string;
  grantExpiresAt: Date;
  questionsPerDayDelta: number;
  questionsPerMonthDelta: number;
  maxConnectionsDelta: number;
  maxDashboardsDelta: number;
  grantsPro: boolean;
  coupon?: { code: string } | null;
}

/**
 * Fold a plan row plus its active coupon grants into effective limits.
 *
 * - Pro is a boolean OR: a coupon Pro grant raises the base plan to Pro but a
 *   real (`source = manual`) Pro user is never downgraded by the absence of one.
 * - Numeric deltas stack additively on top of `override ?? catalog[effectivePlanId]`.
 * - Expiry is read-time only: callers pass grants already filtered to
 *   `grantExpiresAt > now()`.
 */
export function foldUserPlan(row: PlanRow, grants: GrantRow[]): ResolvedUserPlan {
  const basePlanId = (row.planId === "pro" ? "pro" : "free") as PlanId;
  const anyProGrant = grants.some((g) => g.grantsPro);
  const effectivePlanId: PlanId = basePlanId === "pro" || anyProGrant ? "pro" : "free";

  const overrides: PlanLimitOverrides = {
    questionsPerDayOverride: row.questionsPerDayOverride,
    questionsPerMonthOverride: row.questionsPerMonthOverride,
    maxConnectionsOverride: row.maxConnectionsOverride,
    maxDashboardsOverride: row.maxDashboardsOverride,
    schemaRefreshesPerDayOverride: row.schemaRefreshesPerDayOverride,
  };

  const base = resolveEffectiveLimits(effectivePlanId, overrides);
  const deltas: ActiveGrantDeltas[] = grants.map((g) => ({
    questionsPerDayDelta: g.questionsPerDayDelta,
    questionsPerMonthDelta: g.questionsPerMonthDelta,
    maxConnectionsDelta: g.maxConnectionsDelta,
    maxDashboardsDelta: g.maxDashboardsDelta,
  }));

  return {
    userId: row.userId,
    planId: effectivePlanId,
    status: (row.status === "disabled" ? "disabled" : "active") as PlanStatus,
    source: (row.source === "manual" ? "manual" : "default") as PlanSource,
    proGrantedAt: row.proGrantedAt,
    overrides,
    limits: applyCouponGrants(base, deltas),
    activeGrants: grants.map((g) => ({
      couponCode: g.coupon?.code ?? "",
      grantExpiresAt: g.grantExpiresAt,
      questionsPerDayDelta: g.questionsPerDayDelta,
      questionsPerMonthDelta: g.questionsPerMonthDelta,
      maxConnectionsDelta: g.maxConnectionsDelta,
      maxDashboardsDelta: g.maxDashboardsDelta,
      grantsPro: g.grantsPro,
    })),
  };
}

/** Load the user's currently-active (unexpired) coupon grants. Indexed on [userId, grantExpiresAt]. */
async function loadActiveGrants(userId: string, db: Db, now: Date): Promise<GrantRow[]> {
  return db.couponRedemption.findMany({
    where: { userId, grantExpiresAt: { gt: now } },
    include: { coupon: { select: { code: true } } },
  });
}

/**
 * Resolve a user's plan, lazily creating a Free row on first authenticated
 * enforcement (there is no signup hook). A missing row is always treated as
 * Free. Also lazily seeds the lifetime totals row. Active coupon grants (SPEC-12)
 * are folded into `limits` at read time — no cron, no plan mutation on expiry.
 *
 * Callers in the web app should wrap this in a per-request cache to avoid an
 * upsert + grant query per API call.
 */
export async function getUserPlan(userId: string, db: Db = getAppDb()): Promise<ResolvedUserPlan> {
  const now = new Date();
  const existing = await db.userPlan.findUnique({ where: { userId } });
  if (existing) {
    const grants = await loadActiveGrants(userId, db, now);
    return foldUserPlan(existing, grants);
  }

  // Lazy backfill. upsert keeps this safe under concurrent first requests.
  const created = await db.userPlan.upsert({
    where: { userId },
    create: { id: createResourceId(), userId },
    update: {},
  });
  await db.userUsageTotals
    .upsert({ where: { userId }, create: { userId }, update: {} })
    .catch(() => undefined);
  // A brand-new user cannot have grants yet, but query for symmetry/correctness
  // in the rare race where a redemption landed between the two statements.
  const grants = await loadActiveGrants(userId, db, now);
  return foldUserPlan(created, grants);
}
