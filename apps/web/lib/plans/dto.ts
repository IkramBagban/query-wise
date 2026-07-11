import "server-only";

import type { ResolvedUserPlan } from "@query-wise/shared/plans";
import { getPlanDefinition, readUsageSnapshot, type UsageSnapshot } from "@query-wise/shared/plans";
import {
  countActiveShareLinks,
  countDashboards,
  countNonDemoConnections,
} from "./service";

/** Response shape for GET /api/me/plan. Powers in-app meters and upgrade teasers. */
export interface PlanUsageDto {
  contractVersion: "querywise.v2";
  plan: {
    id: "free" | "pro";
    displayName: string;
    status: "active" | "disabled";
  };
  limits: {
    questionsPerDay: number;
    questionsPerMonth: number;
    maxConnectionsNonDemo: number;
    maxDashboards: number;
    maxActiveShareLinks: number;
    allowPasswordShares: boolean;
    schemaRefreshesPerDay: number;
  };
  usage: {
    questionsToday: number;
    questionsThisMonth: number;
    schemaRefreshesToday: number;
    connectionsNonDemo: number;
    dashboards: number;
    activeShareLinks: number;
    llmInputTokensThisMonth: number;
    llmOutputTokensThisMonth: number;
    chartsGeneratedThisMonth: number;
  };
  remaining: {
    questionsToday: number;
    questionsThisMonth: number;
    schemaRefreshesToday: number;
    connectionsNonDemo: number;
    dashboards: number;
    activeShareLinks: number;
  };
  billing: {
    selfServeUpgradeAvailable: false;
    proCheckoutStatus: "coming_soon";
    paymentProvider: "razorpay";
  };
}

/** remaining never goes negative even if a grandfathered account is over a cap. */
function floor0(value: number): number {
  return value < 0 ? 0 : value;
}

/**
 * Assemble the plan + usage snapshot for the signed-in user. Resource counts are
 * derived live from the primary tables; period counters come from the usage rows.
 */
export async function buildPlanUsageDto(plan: ResolvedUserPlan): Promise<PlanUsageDto> {
  const [snapshot, connectionsNonDemo, dashboards, activeShareLinks]: [
    UsageSnapshot,
    number,
    number,
    number,
  ] = await Promise.all([
    readUsageSnapshot(plan.userId),
    countNonDemoConnections(plan.userId),
    countDashboards(plan.userId),
    countActiveShareLinks(plan.userId),
  ]);

  const limits = plan.limits;
  const displayName = getPlanDefinition(plan.planId).displayName;

  return {
    contractVersion: "querywise.v2",
    plan: { id: plan.planId, displayName, status: plan.status },
    limits: {
      questionsPerDay: limits.questionsPerDay,
      questionsPerMonth: limits.questionsPerMonth,
      maxConnectionsNonDemo: limits.maxConnectionsNonDemo,
      maxDashboards: limits.maxDashboards,
      maxActiveShareLinks: limits.maxActiveShareLinks,
      allowPasswordShares: limits.allowPasswordShares,
      schemaRefreshesPerDay: limits.schemaRefreshesPerDay,
    },
    usage: {
      questionsToday: snapshot.questionsToday,
      questionsThisMonth: snapshot.questionsThisMonth,
      schemaRefreshesToday: snapshot.schemaRefreshesToday,
      connectionsNonDemo,
      dashboards,
      activeShareLinks,
      llmInputTokensThisMonth: snapshot.llmInputTokensThisMonth,
      llmOutputTokensThisMonth: snapshot.llmOutputTokensThisMonth,
      chartsGeneratedThisMonth: snapshot.chartsGeneratedThisMonth,
    },
    remaining: {
      questionsToday: floor0(limits.questionsPerDay - snapshot.questionsToday),
      questionsThisMonth: floor0(limits.questionsPerMonth - snapshot.questionsThisMonth),
      schemaRefreshesToday: floor0(limits.schemaRefreshesPerDay - snapshot.schemaRefreshesToday),
      connectionsNonDemo: floor0(limits.maxConnectionsNonDemo - connectionsNonDemo),
      dashboards: floor0(limits.maxDashboards - dashboards),
      activeShareLinks: floor0(limits.maxActiveShareLinks - activeShareLinks),
    },
    billing: {
      selfServeUpgradeAvailable: false,
      proCheckoutStatus: "coming_soon",
      paymentProvider: "razorpay",
    },
  };
}
