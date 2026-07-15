import "server-only";

import type { PlanId } from "@query-wise/shared/plans";
import { resolveEffectiveLimits } from "@query-wise/shared/plans";
import { requireAdmin } from "@/lib/admin-auth";
import {
  displayName,
  resolveClerkUsers,
  type ClerkIdentity,
} from "@/lib/clerk";
import { adminDb } from "@/lib/db";
import { bigintToNumber, hasAnyOverride, PAGE_SIZE } from "@/lib/format";
import { dayPeriodKey, lastNDayKeys, monthPeriodKey } from "@/lib/period-keys";

export interface UserDetailData {
  userId: string;
  identity: ClerkIdentity | undefined;
  displayLabel: string;
  plan: {
    planId: PlanId;
    status: "active" | "disabled";
    source: string;
    proGrantedAt: Date | null;
    notes: string | null;
    overrides: {
      questionsPerDayOverride: number | null;
      questionsPerMonthOverride: number | null;
      maxConnectionsOverride: number | null;
      maxDashboardsOverride: number | null;
      schemaRefreshesPerDayOverride: number | null;
    };
    hasOverrides: boolean;
    limits: ReturnType<typeof resolveEffectiveLimits>;
    createdAt: Date;
    updatedAt: Date;
  };
  usage: {
    questionsToday: number;
    questionsMonth: number;
    schemaRefreshesToday: number;
    tokensMonthInput: number;
    tokensMonthOutput: number;
    tokensMonthCached: number;
    connectionsNonDemo: number;
    dashboards: number;
    activeShares: number;
    conversations: number;
    lastConversationActivity: Date | null;
  };
  planHistory: Array<{
    id: string;
    fromPlanId: string;
    toPlanId: string;
    source: string;
    actorLabel: string | null;
    notes: string | null;
    createdAt: Date;
  }>;
  trend30d: Array<{
    dayKey: string;
    questionsAccepted: number;
    inputTokens: number;
    outputTokens: number;
  }>;
  llmByTask: Array<{
    task: string;
    calls: number;
    inputTokens: number;
    outputTokens: number;
    failures: number;
  }>;
  llmByProviderModel: Array<{
    provider: string;
    model: string;
    calls: number;
    inputTokens: number;
    outputTokens: number;
    failures: number;
  }>;
  runs: {
    rows: Array<{
      id: string;
      status: string;
      createdAt: Date;
      finishedAt: Date | null;
      executionTimeMs: number | null;
      connectionName: string | null;
      agentSteps: number | null;
      sqlAttempts: number | null;
      chartType: string | null;
      inputTokens: number;
      outputTokens: number;
      errorCode: string | null;
    }>;
    total: number;
    page: number;
    pageSize: number;
  };
  connections: Array<{
    id: string;
    name: string;
    hostDisplay: string;
    isDemo: boolean;
    status: string;
    schemaSyncStatus: string;
    lastSchemaSyncAt: Date | null;
    createdAt: Date;
  }>;
  dashboards: Array<{
    id: string;
    name: string;
    mode: string;
    widgetCount: number;
    createdAt: Date;
  }>;
  shares: Array<{
    id: string;
    dashboardId: string;
    dashboardName: string;
    createdAt: Date;
    expiresAt: Date | null;
    revokedAt: Date | null;
    passwordProtected: boolean;
    viewCount: number;
  }>;
  conversationsSummary: {
    count: number;
    lastActivityAt: Date | null;
  };
  adminAudit: Array<{
    id: string;
    action: string;
    actorUserId: string | null;
    outcome: string;
    createdAt: Date;
    metadata: unknown;
  }>;
}

export async function getUserDetail(
  userId: string,
  runsPage = 1,
): Promise<UserDetailData | null> {
  await requireAdmin();
  const db = adminDb();
  const plan = await db.userPlan.findUnique({ where: { userId } });
  if (!plan) return null;

  const todayKey = dayPeriodKey();
  const monthKey = monthPeriodKey();
  const last30 = lastNDayKeys(30);
  const monthStart = new Date(`${monthKey}-01T00:00:00.000Z`);
  const pageSize = PAGE_SIZE;
  const skip = (Math.max(1, runsPage) - 1) * pageSize;

  const planId = (plan.planId === "pro" ? "pro" : "free") as PlanId;
  const overrides = {
    questionsPerDayOverride: plan.questionsPerDayOverride,
    questionsPerMonthOverride: plan.questionsPerMonthOverride,
    maxConnectionsOverride: plan.maxConnectionsOverride,
    maxDashboardsOverride: plan.maxDashboardsOverride,
    schemaRefreshesPerDayOverride: plan.schemaRefreshesPerDayOverride,
  };
  const limits = resolveEffectiveLimits(planId, overrides);

  const [
    identities,
    dayUsage,
    monthUsage,
    planHistory,
    trendRows,
    llmTask,
    llmPm,
    runsTotal,
    runs,
    connections,
    dashboards,
    conversationAgg,
    adminAudit,
  ] = await Promise.all([
    resolveClerkUsers([userId]),
    db.userUsagePeriod.findUnique({
      where: {
        userId_periodType_periodKey: {
          userId,
          periodType: "day",
          periodKey: todayKey,
        },
      },
    }),
    db.userUsagePeriod.findUnique({
      where: {
        userId_periodType_periodKey: {
          userId,
          periodType: "month",
          periodKey: monthKey,
        },
      },
    }),
    db.planChangeLog.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.userUsagePeriod.findMany({
      where: {
        userId,
        periodType: "day",
        periodKey: { in: last30 },
      },
    }),
    db.llmUsageRecord.groupBy({
      by: ["task"],
      where: { userId, createdAt: { gte: monthStart } },
      _sum: { inputTokens: true, outputTokens: true },
      _count: { _all: true },
    }),
    db.llmUsageRecord.groupBy({
      by: ["provider", "model"],
      where: { userId, createdAt: { gte: monthStart } },
      _sum: { inputTokens: true, outputTokens: true },
      _count: { _all: true },
    }),
    db.queryRun.count({ where: { ownerUserId: userId } }),
    db.queryRun.findMany({
      where: { ownerUserId: userId },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      select: {
        id: true,
        status: true,
        createdAt: true,
        finishedAt: true,
        executionTimeMs: true,
        connectionId: true,
        errorCode: true,
      },
    }),
    db.databaseConnection.findMany({
      where: { ownerUserId: userId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        hostDisplay: true,
        isDemo: true,
        status: true,
        schemaSyncStatus: true,
        lastSchemaSyncAt: true,
        createdAt: true,
      },
    }),
    db.dashboard.findMany({
      where: { ownerUserId: userId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, mode: true, createdAt: true },
    }),
    db.conversation.aggregate({
      where: { ownerUserId: userId, deletedAt: null },
      _count: { _all: true },
      _max: { lastActivityAt: true },
    }),
    db.auditLog.findMany({
      where: {
        resourceId: userId,
        action: { startsWith: "admin." },
      },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
  ]);

  const connectionIds = runs.map((r) => r.connectionId);
  const dashIds = dashboards.map((d) => d.id);
  const runIds = runs.map((r) => r.id);

  const [connNames, widgetCounts, shareRows, runUsage, llmFailuresTask, llmFailuresPm] =
    await Promise.all([
      connectionIds.length
        ? db.databaseConnection.findMany({
            where: { id: { in: connectionIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([] as Array<{ id: string; name: string }>),
      dashIds.length
        ? db.dashboardWidget.groupBy({
            by: ["dashboardId"],
            where: { dashboardId: { in: dashIds } },
            _count: { _all: true },
          })
        : Promise.resolve(
            [] as Array<{ dashboardId: string; _count: { _all: number } }>,
          ),
      dashIds.length
        ? db.dashboardShareLink.findMany({
            where: { dashboardId: { in: dashIds } },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              dashboardId: true,
              createdAt: true,
              expiresAt: true,
              revokedAt: true,
              passwordHash: true,
              viewCount: true,
            },
          })
        : Promise.resolve([]),
      runIds.length
        ? db.queryRunUsage.findMany({ where: { queryRunId: { in: runIds } } })
        : Promise.resolve([]),
      db.llmUsageRecord.groupBy({
        by: ["task"],
        where: { userId, createdAt: { gte: monthStart }, success: false },
        _count: { _all: true },
      }),
      db.llmUsageRecord.groupBy({
        by: ["provider", "model"],
        where: { userId, createdAt: { gte: monthStart }, success: false },
        _count: { _all: true },
      }),
    ]);

  const nameByConn = new Map<string, string>(connNames.map((c) => [c.id, c.name]));
  const widgetsByDash = new Map<string, number>(
    widgetCounts.map((w) => [w.dashboardId, w._count._all]),
  );
  const usageByRun = new Map<string, (typeof runUsage)[number]>(runUsage.map((u) => [u.queryRunId, u]));
  const dashName = new Map<string, string>(dashboards.map((d) => [d.id, d.name]));
  const failTask = new Map<string, number>(llmFailuresTask.map((f) => [f.task, f._count._all]));
  const failPm = new Map<string, number>(
    llmFailuresPm.map((f) => [`${f.provider}\0${f.model}`, f._count._all]),
  );

  const trendMap = new Map<string, { questionsAccepted: number; inputTokens: number; outputTokens: number }>(
    trendRows.map((r) => [
      r.periodKey,
      {
        questionsAccepted: r.questionsAccepted,
        inputTokens: bigintToNumber(r.llmInputTokens),
        outputTokens: bigintToNumber(r.llmOutputTokens),
      },
    ]),
  );

  const activeShares = shareRows.filter(
    (s) =>
      !s.revokedAt && (!s.expiresAt || s.expiresAt.getTime() > Date.now()),
  ).length;

  const identity = identities.get(userId);

  return {
    userId,
    identity,
    displayLabel: displayName(identity, userId),
    plan: {
      planId,
      status: plan.status === "disabled" ? "disabled" : "active",
      source: plan.source,
      proGrantedAt: plan.proGrantedAt,
      notes: plan.notes,
      overrides,
      hasOverrides: hasAnyOverride(overrides),
      limits,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    },
    usage: {
      questionsToday: dayUsage?.questionsAccepted ?? 0,
      questionsMonth: monthUsage?.questionsAccepted ?? 0,
      schemaRefreshesToday: dayUsage?.schemaRefreshes ?? 0,
      tokensMonthInput: bigintToNumber(monthUsage?.llmInputTokens),
      tokensMonthOutput: bigintToNumber(monthUsage?.llmOutputTokens),
      tokensMonthCached: bigintToNumber(monthUsage?.llmCachedInputTokens),
      connectionsNonDemo: connections.filter((c) => !c.isDemo).length,
      dashboards: dashboards.length,
      activeShares,
      conversations: conversationAgg._count._all,
      lastConversationActivity: conversationAgg._max.lastActivityAt,
    },
    planHistory: planHistory.map((h) => ({
      id: h.id,
      fromPlanId: h.fromPlanId,
      toPlanId: h.toPlanId,
      source: h.source,
      actorLabel: h.actorLabel,
      notes: h.notes,
      createdAt: h.createdAt,
    })),
    trend30d: last30.map((key) => ({
      dayKey: key,
      questionsAccepted: trendMap.get(key)?.questionsAccepted ?? 0,
      inputTokens: trendMap.get(key)?.inputTokens ?? 0,
      outputTokens: trendMap.get(key)?.outputTokens ?? 0,
    })),
    llmByTask: llmTask.map((g) => ({
      task: g.task,
      calls: g._count._all,
      inputTokens: g._sum.inputTokens ?? 0,
      outputTokens: g._sum.outputTokens ?? 0,
      failures: failTask.get(g.task) ?? 0,
    })),
    llmByProviderModel: llmPm.map((g) => ({
      provider: g.provider,
      model: g.model,
      calls: g._count._all,
      inputTokens: g._sum.inputTokens ?? 0,
      outputTokens: g._sum.outputTokens ?? 0,
      failures: failPm.get(`${g.provider}\0${g.model}`) ?? 0,
    })),
    runs: {
      rows: runs.map((r) => {
        const u = usageByRun.get(r.id);
        return {
          id: r.id,
          status: r.status,
          createdAt: r.createdAt,
          finishedAt: r.finishedAt,
          executionTimeMs: r.executionTimeMs,
          connectionName: nameByConn.get(r.connectionId) ?? null,
          agentSteps: u?.agentSteps ?? null,
          sqlAttempts: u?.sqlAttempts ?? null,
          chartType: u?.chartType ?? null,
          inputTokens: u?.inputTokens ?? 0,
          outputTokens: u?.outputTokens ?? 0,
          errorCode: r.errorCode,
        };
      }),
      total: runsTotal,
      page: Math.max(1, runsPage),
      pageSize,
    },
    connections,
    dashboards: dashboards.map((d) => ({
      id: d.id,
      name: d.name,
      mode: d.mode,
      widgetCount: widgetsByDash.get(d.id) ?? 0,
      createdAt: d.createdAt,
    })),
    shares: shareRows.map((s) => ({
      id: s.id,
      dashboardId: s.dashboardId,
      dashboardName: dashName.get(s.dashboardId) ?? s.dashboardId,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      revokedAt: s.revokedAt,
      // Boolean only — never the hash or token.
      passwordProtected: Boolean(s.passwordHash),
      viewCount: s.viewCount,
    })),
    conversationsSummary: {
      count: conversationAgg._count._all,
      lastActivityAt: conversationAgg._max.lastActivityAt,
    },
    adminAudit: adminAudit.map((a) => ({
      id: a.id,
      action: a.action,
      actorUserId: a.actorUserId,
      outcome: a.outcome,
      createdAt: a.createdAt,
      metadata: a.metadata,
    })),
  };
}
