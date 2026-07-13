import "server-only";

import {
  resolveEffectiveLimits,
  type PlanId,
} from "@query-wise/shared/plans";
import { requireAdmin } from "@/lib/admin-auth";
import {
  displayName,
  resolveClerkUsers,
  searchClerkUserIdsByEmail,
  type ClerkIdentity,
} from "@/lib/clerk";
import { adminDb } from "@/lib/db";
import {
  bigintToNumber,
  hasAnyOverride,
  PAGE_SIZE,
  tokensSum,
} from "@/lib/format";
import { dayPeriodKey, monthPeriodKey } from "@/lib/period-keys";

export type UsersSort =
  | "tokens_month"
  | "questions_month"
  | "created"
  | "last_activity";

export interface UsersListFilters {
  q?: string;
  plan?: "free" | "pro" | "all";
  status?: "active" | "disabled" | "all";
  hasOverrides?: "yes" | "no" | "all";
  sort?: UsersSort;
  page?: number;
}

export interface UserListRow {
  userId: string;
  identity: ClerkIdentity | undefined;
  displayLabel: string;
  planId: PlanId;
  status: "active" | "disabled";
  hasOverrides: boolean;
  questionsToday: number;
  questionsMonth: number;
  limitDay: number;
  limitMonth: number;
  tokensMonth: number;
  connectionsNonDemo: number;
  dashboards: number;
  activeShares: number;
  lastActivityAt: Date | null;
  createdAt: Date;
}

export interface UsersListResult {
  rows: UserListRow[];
  total: number;
  page: number;
  pageSize: number;
}

function isClerkUserId(q: string): boolean {
  return /^user_[A-Za-z0-9]+$/.test(q) || q.startsWith("user_");
}

export async function listUsers(
  filters: UsersListFilters = {},
): Promise<UsersListResult> {
  await requireAdmin();
  const db = adminDb();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = PAGE_SIZE;
  const skip = (page - 1) * pageSize;
  const sort = filters.sort ?? "tokens_month";
  const todayKey = dayPeriodKey();
  const monthKey = monthPeriodKey();

  const where: Record<string, unknown> = {};
  if (filters.plan && filters.plan !== "all") {
    where.planId = filters.plan;
  }
  if (filters.status && filters.status !== "all") {
    where.status = filters.status;
  }
  if (filters.hasOverrides === "yes") {
    where.OR = [
      { questionsPerDayOverride: { not: null } },
      { questionsPerMonthOverride: { not: null } },
      { maxConnectionsOverride: { not: null } },
      { maxDashboardsOverride: { not: null } },
      { schemaRefreshesPerDayOverride: { not: null } },
    ];
  } else if (filters.hasOverrides === "no") {
    where.AND = [
      { questionsPerDayOverride: null },
      { questionsPerMonthOverride: null },
      { maxConnectionsOverride: null },
      { maxDashboardsOverride: null },
      { schemaRefreshesPerDayOverride: null },
    ];
  }

  const q = filters.q?.trim();
  if (q) {
    if (isClerkUserId(q) || !q.includes("@")) {
      // Raw id search (exact or prefix-ish contains).
      where.userId = q.startsWith("user_")
        ? q.includes("%")
          ? undefined
          : { contains: q }
        : { contains: q };
      if (where.userId === undefined) {
        where.userId = { contains: q };
      }
    } else {
      const ids = await searchClerkUserIdsByEmail(q);
      where.userId = { in: ids.length > 0 ? ids : ["__none__"] };
    }
  }

  // For token/question sort we need period joins — load a wider set then sort
  // in app for correctness on the current page window. For large bases, prefer
  // SQL; Phase 2 uses period table lookups per page of plan rows.
  const orderBy =
    sort === "created"
      ? [{ createdAt: "desc" as const }]
      : [{ updatedAt: "desc" as const }];

  // When sorting by usage, fetch all matching ids with periods first.
  if (sort === "tokens_month" || sort === "questions_month") {
    return listUsersSortedByUsage({
      where,
      page,
      pageSize,
      skip,
      sort,
      todayKey,
      monthKey,
    });
  }

  if (sort === "last_activity") {
    return listUsersSortedByActivity({
      where,
      page,
      pageSize,
      skip,
      todayKey,
      monthKey,
    });
  }

  const [total, plans] = await Promise.all([
    db.userPlan.count({ where }),
    db.userPlan.findMany({
      where,
      orderBy,
      skip,
      take: pageSize,
    }),
  ]);

  const rows = await hydrateUserRows(
    plans,
    todayKey,
    monthKey,
  );
  return { rows, total, page, pageSize };
}

async function listUsersSortedByUsage(params: {
  where: Record<string, unknown>;
  page: number;
  pageSize: number;
  skip: number;
  sort: "tokens_month" | "questions_month";
  todayKey: string;
  monthKey: string;
}): Promise<UsersListResult> {
  const db = adminDb();
  const plans = await db.userPlan.findMany({ where: params.where });
  const userIds = plans.map((p) => p.userId);
  if (userIds.length === 0) {
    return { rows: [], total: 0, page: params.page, pageSize: params.pageSize };
  }

  const monthRows = await db.userUsagePeriod.findMany({
    where: {
      userId: { in: userIds },
      periodType: "month",
      periodKey: params.monthKey,
    },
  });
  const monthByUser = new Map(monthRows.map((r) => [r.userId, r]));

  const scored = plans.map((p) => {
    const m = monthByUser.get(p.userId);
    const tokens = m
      ? tokensSum(m.llmInputTokens, m.llmOutputTokens)
      : 0;
    const questions = m?.questionsAccepted ?? 0;
    return { plan: p, tokens, questions };
  });

  scored.sort((a, b) => {
    if (params.sort === "tokens_month") return b.tokens - a.tokens;
    return b.questions - a.questions;
  });

  const total = scored.length;
  const slice = scored.slice(params.skip, params.skip + params.pageSize);
  const rows = await hydrateUserRows(
    slice.map((s) => s.plan),
    params.todayKey,
    params.monthKey,
    monthByUser,
  );
  return { rows, total, page: params.page, pageSize: params.pageSize };
}

async function listUsersSortedByActivity(params: {
  where: Record<string, unknown>;
  page: number;
  pageSize: number;
  skip: number;
  todayKey: string;
  monthKey: string;
}): Promise<UsersListResult> {
  const db = adminDb();
  const plans = await db.userPlan.findMany({ where: params.where });
  const userIds = plans.map((p) => p.userId);
  if (userIds.length === 0) {
    return { rows: [], total: 0, page: params.page, pageSize: params.pageSize };
  }

  const convs = await db.conversation.groupBy({
    by: ["ownerUserId"],
    where: { ownerUserId: { in: userIds }, deletedAt: null },
    _max: { lastActivityAt: true },
  });
  const activity = new Map(
    convs.map((c) => [c.ownerUserId, c._max.lastActivityAt]),
  );

  const scored = plans.map((p) => ({
    plan: p,
    last: activity.get(p.userId) ?? p.updatedAt,
  }));
  scored.sort((a, b) => b.last.getTime() - a.last.getTime());

  const total = scored.length;
  const slice = scored.slice(params.skip, params.skip + params.pageSize);
  const rows = await hydrateUserRows(
    slice.map((s) => s.plan),
    params.todayKey,
    params.monthKey,
  );
  // Overlay activity from our map.
  for (const row of rows) {
    row.lastActivityAt = activity.get(row.userId) ?? row.lastActivityAt;
  }
  return { rows, total, page: params.page, pageSize: params.pageSize };
}

async function hydrateUserRows(
  plans: Array<{
    userId: string;
    planId: string;
    status: string;
    questionsPerDayOverride: number | null;
    questionsPerMonthOverride: number | null;
    maxConnectionsOverride: number | null;
    maxDashboardsOverride: number | null;
    schemaRefreshesPerDayOverride: number | null;
    createdAt: Date;
    updatedAt: Date;
  }>,
  todayKey: string,
  monthKey: string,
  monthByUser?: Map<
    string,
    {
      llmInputTokens: bigint;
      llmOutputTokens: bigint;
      questionsAccepted: number;
    }
  >,
): Promise<UserListRow[]> {
  if (plans.length === 0) return [];
  const db = adminDb();
  const userIds = plans.map((p) => p.userId);

  const [identities, dayRows, monthRows, connections, dashboards, userDashRows, convs] =
    await Promise.all([
      resolveClerkUsers(userIds),
      db.userUsagePeriod.findMany({
        where: {
          userId: { in: userIds },
          periodType: "day",
          periodKey: todayKey,
        },
      }),
      monthByUser
        ? Promise.resolve([])
        : db.userUsagePeriod.findMany({
            where: {
              userId: { in: userIds },
              periodType: "month",
              periodKey: monthKey,
            },
          }),
      db.databaseConnection.groupBy({
        by: ["ownerUserId"],
        where: {
          ownerUserId: { in: userIds },
          deletedAt: null,
          isDemo: false,
        },
        _count: { _all: true },
      }),
      db.dashboard.groupBy({
        by: ["ownerUserId"],
        where: { ownerUserId: { in: userIds }, deletedAt: null },
        _count: { _all: true },
      }),
      db.dashboard.findMany({
        where: { ownerUserId: { in: userIds }, deletedAt: null },
        select: { id: true, ownerUserId: true },
      }),
      db.conversation.groupBy({
        by: ["ownerUserId"],
        where: { ownerUserId: { in: userIds }, deletedAt: null },
        _max: { lastActivityAt: true },
      }),
    ]);

  const dashIdToOwner = new Map(userDashRows.map((d) => [d.id, d.ownerUserId]));
  const dashIds = userDashRows.map((d) => d.id);
  const now = new Date();
  const activeShareLinks =
    dashIds.length === 0
      ? []
      : await db.dashboardShareLink.findMany({
          where: {
            dashboardId: { in: dashIds },
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          select: { dashboardId: true },
        });
  const shareByUser = new Map<string, number>();
  for (const s of activeShareLinks) {
    const owner = dashIdToOwner.get(s.dashboardId);
    if (!owner) continue;
    shareByUser.set(owner, (shareByUser.get(owner) ?? 0) + 1);
  }

  const dayByUser = new Map(dayRows.map((r) => [r.userId, r]));
  const monthMap =
    monthByUser ??
    new Map(
      (monthRows as Array<{
        userId: string;
        llmInputTokens: bigint;
        llmOutputTokens: bigint;
        questionsAccepted: number;
      }>).map((r) => [r.userId, r]),
    );
  const connByUser = new Map(
    connections.map((c) => [c.ownerUserId, c._count._all]),
  );
  const dashByUser = new Map(
    dashboards.map((d) => [d.ownerUserId, d._count._all]),
  );
  const activityByUser = new Map(
    convs.map((c) => [c.ownerUserId, c._max.lastActivityAt]),
  );

  return plans.map((p) => {
    const planId = (p.planId === "pro" ? "pro" : "free") as PlanId;
    const overrides = {
      questionsPerDayOverride: p.questionsPerDayOverride,
      questionsPerMonthOverride: p.questionsPerMonthOverride,
      maxConnectionsOverride: p.maxConnectionsOverride,
      maxDashboardsOverride: p.maxDashboardsOverride,
      schemaRefreshesPerDayOverride: p.schemaRefreshesPerDayOverride,
    };
    const limits = resolveEffectiveLimits(planId, overrides);
    const day = dayByUser.get(p.userId);
    const month = monthMap.get(p.userId);
    const identity = identities.get(p.userId);
    return {
      userId: p.userId,
      identity,
      displayLabel: displayName(identity, p.userId),
      planId,
      status: p.status === "disabled" ? "disabled" : "active",
      hasOverrides: hasAnyOverride(overrides),
      questionsToday: day?.questionsAccepted ?? 0,
      questionsMonth: month?.questionsAccepted ?? 0,
      limitDay: limits.questionsPerDay,
      limitMonth: limits.questionsPerMonth,
      tokensMonth: month
        ? tokensSum(month.llmInputTokens, month.llmOutputTokens)
        : 0,
      connectionsNonDemo: connByUser.get(p.userId) ?? 0,
      dashboards: dashByUser.get(p.userId) ?? 0,
      activeShares: shareByUser.get(p.userId) ?? 0,
      lastActivityAt: activityByUser.get(p.userId) ?? p.updatedAt,
      createdAt: p.createdAt,
    };
  });
}
