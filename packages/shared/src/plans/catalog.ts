/**
 * The plan catalog is the version-controlled single source of truth for
 * enforcement limits. Entitlements depend only on the plan id (and optional
 * per-user overrides), never on payment state in this phase.
 */

export type PlanId = "free" | "pro";
export type AgentBudgetProfileName = "standard" | "extended";

// Product decision (2026-07-11): no plan-based model tiering — every plan uses
// the same model routing chains. If tiering ever returns, add a `modelTier`
// field back here and resolve it in the model router's chain selection.

export interface PlanDefinition {
  id: PlanId;
  displayName: string;
  priceUsdMonthly: number;
  questionsPerMonth: number;
  questionsPerDay: number;
  maxConnectionsNonDemo: number;
  maxDashboards: number;
  maxActiveShareLinks: number;
  allowPasswordShares: boolean;
  schemaRefreshesPerDay: number;
  maxAgentBudgetProfile: AgentBudgetProfileName;
  maxDashboardsHard: number;
}

export const PLAN_CATALOG: Record<PlanId, PlanDefinition> = {
  free: {
    id: "free",
    displayName: "Free",
    priceUsdMonthly: 0,
    questionsPerMonth: 25,
    questionsPerDay: 5,
    maxConnectionsNonDemo: 1,
    maxDashboards: 1,
    maxActiveShareLinks: 1,
    allowPasswordShares: false,
    schemaRefreshesPerDay: 1,
    maxAgentBudgetProfile: "standard",
    maxDashboardsHard: 1,
  },
  pro: {
    id: "pro",
    displayName: "Pro",
    priceUsdMonthly: 29,
    questionsPerMonth: 500,
    questionsPerDay: 50,
    maxConnectionsNonDemo: 5,
    maxDashboards: 100,
    maxActiveShareLinks: 20,
    allowPasswordShares: true,
    schemaRefreshesPerDay: 20,
    maxAgentBudgetProfile: "extended",
    maxDashboardsHard: 100,
  },
} as const;

export function getPlanDefinition(planId: PlanId): PlanDefinition {
  return PLAN_CATALOG[planId] ?? PLAN_CATALOG.free;
}

/**
 * Nullable per-user limit overrides, set by ops. `null`/`undefined` means "use
 * the catalog value". Overrides are user-scoped (they survive plan changes) and
 * only the entitlement service reads them.
 */
export interface PlanLimitOverrides {
  questionsPerDayOverride?: number | null;
  questionsPerMonthOverride?: number | null;
  maxConnectionsOverride?: number | null;
  maxDashboardsOverride?: number | null;
  schemaRefreshesPerDayOverride?: number | null;
}

/** The effective, enforced limits for a user: `override ?? catalog[planId]`. */
export interface EffectiveLimits {
  questionsPerDay: number;
  questionsPerMonth: number;
  maxConnectionsNonDemo: number;
  maxDashboards: number;
  maxActiveShareLinks: number;
  allowPasswordShares: boolean;
  schemaRefreshesPerDay: number;
  maxAgentBudgetProfile: AgentBudgetProfileName;
}

function pick(override: number | null | undefined, fallback: number): number {
  return override === null || override === undefined ? fallback : override;
}

/**
 * SPEC-12: the additive deltas one active coupon grant contributes. Summed on
 * top of the resolved base limits by {@link applyCouponGrants}. Pro is handled
 * separately (a boolean OR on the plan id), never as a delta.
 */
export interface ActiveGrantDeltas {
  questionsPerDayDelta: number;
  questionsPerMonthDelta: number;
  maxConnectionsDelta: number;
  maxDashboardsDelta: number;
}

/**
 * Sum the active grant deltas on top of the resolved base limits. Pure and
 * unit-testable: `base` already accounts for plan id + per-user overrides; this
 * only adds the coupon contributions. Empty grants → base unchanged. Feature
 * gates (password shares, share-link cap, agent budget) are untouched — a Pro
 * grant unlocks those via the base plan id, not here.
 */
export function applyCouponGrants(
  base: EffectiveLimits,
  grants: ActiveGrantDeltas[],
): EffectiveLimits {
  if (grants.length === 0) return base;
  const sum = (pickDelta: (g: ActiveGrantDeltas) => number) =>
    grants.reduce((total, g) => total + pickDelta(g), 0);
  return {
    ...base,
    questionsPerDay: base.questionsPerDay + sum((g) => g.questionsPerDayDelta),
    questionsPerMonth: base.questionsPerMonth + sum((g) => g.questionsPerMonthDelta),
    maxConnectionsNonDemo: base.maxConnectionsNonDemo + sum((g) => g.maxConnectionsDelta),
    maxDashboards: base.maxDashboards + sum((g) => g.maxDashboardsDelta),
  };
}

/**
 * Resolve enforced limits from the catalog plus any per-user overrides. The
 * share-link cap and password-share gate have no override column, so they
 * always come from the catalog.
 */
export function resolveEffectiveLimits(
  planId: PlanId,
  overrides: PlanLimitOverrides = {},
): EffectiveLimits {
  const plan = getPlanDefinition(planId);
  return {
    questionsPerDay: pick(overrides.questionsPerDayOverride, plan.questionsPerDay),
    questionsPerMonth: pick(overrides.questionsPerMonthOverride, plan.questionsPerMonth),
    maxConnectionsNonDemo: pick(overrides.maxConnectionsOverride, plan.maxConnectionsNonDemo),
    maxDashboards: pick(overrides.maxDashboardsOverride, plan.maxDashboards),
    maxActiveShareLinks: plan.maxActiveShareLinks,
    allowPasswordShares: plan.allowPasswordShares,
    schemaRefreshesPerDay: pick(overrides.schemaRefreshesPerDayOverride, plan.schemaRefreshesPerDay),
    maxAgentBudgetProfile: plan.maxAgentBudgetProfile,
  };
}
