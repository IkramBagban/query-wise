import "server-only";

import { requireAdmin } from "@/lib/admin-auth";
import { adminDb } from "@/lib/db";
import { bigintToNumber } from "@/lib/format";
import {
  dayPeriodKey,
  lastNDayKeys,
  monthPeriodKey,
  utcDayStart,
} from "@/lib/period-keys";

export interface OverviewKpis {
  questionsToday: number;
  questionsMonth: number;
  llmInputTokensMonth: number;
  llmOutputTokensMonth: number;
  llmCachedTokensMonth: number;
  activeUsersToday: number;
  activeUsers7d: number;
  activeUsers30d: number;
  newPlansThisMonth: number;
  quotaBlocksToday: number;
  questionsAccepted7d: number;
  questionsFailed7d: number;
  questionErrorRate7d: number | null;
}

export interface TokensByProviderModel {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  calls: number;
}

export interface TopConsumer {
  userId: string;
  inputTokens: number;
  outputTokens: number;
  questionsAccepted: number;
}

export interface QuestionsPerDay {
  dayKey: string;
  questionsAccepted: number;
}

export interface PlanDistribution {
  free: number;
  pro: number;
  disabled: number;
}

export interface RecentEvent {
  id: string;
  eventType: string;
  userId: string | null;
  createdAt: Date;
  resourceId: string | null;
}

export interface OverviewData {
  kpis: OverviewKpis;
  tokensByProviderModel: TokensByProviderModel[];
  topConsumers: TopConsumer[];
  questionsPerDay: QuestionsPerDay[];
  planDistribution: PlanDistribution;
  recentEvents: RecentEvent[];
}

export async function getOverviewData(): Promise<OverviewData> {
  await requireAdmin();
  const db = adminDb();
  const now = new Date();
  const todayKey = dayPeriodKey(now);
  const monthKey = monthPeriodKey(now);
  const last30 = lastNDayKeys(30, now);
  const last7 = lastNDayKeys(7, now);
  const todayStart = utcDayStart(todayKey);
  const monthStart = new Date(`${monthKey}-01T00:00:00.000Z`);

  const [
    dayAgg,
    monthAgg,
    activeToday,
    active7dRows,
    active30dRows,
    newPlans,
    quotaBlocks,
    weekAgg,
    llmGroups,
    topMonth,
    freeCount,
    proCount,
    disabledCount,
    recentEvents,
  ] = await Promise.all([
    db.userUsagePeriod.aggregate({
      where: { periodType: "day", periodKey: todayKey },
      _sum: { questionsAccepted: true },
    }),
    db.userUsagePeriod.aggregate({
      where: { periodType: "month", periodKey: monthKey },
      _sum: {
        questionsAccepted: true,
        llmInputTokens: true,
        llmOutputTokens: true,
        llmCachedInputTokens: true,
      },
    }),
    db.userUsagePeriod.count({
      where: {
        periodType: "day",
        periodKey: todayKey,
        questionsAccepted: { gt: 0 },
      },
    }),
    db.userUsagePeriod.findMany({
      where: {
        periodType: "day",
        periodKey: { in: last7 },
        questionsAccepted: { gt: 0 },
      },
      select: { userId: true },
      distinct: ["userId"],
    }),
    db.userUsagePeriod.findMany({
      where: {
        periodType: "day",
        periodKey: { in: last30 },
        questionsAccepted: { gt: 0 },
      },
      select: { userId: true },
      distinct: ["userId"],
    }),
    db.userPlan.count({ where: { createdAt: { gte: monthStart } } }),
    db.metricEvent.count({
      where: {
        eventType: "question.quota_blocked",
        createdAt: { gte: todayStart },
      },
    }),
    db.userUsagePeriod.aggregate({
      where: { periodType: "day", periodKey: { in: last7 } },
      _sum: { questionsAccepted: true, questionsFailed: true },
    }),
    db.llmUsageRecord.groupBy({
      by: ["provider", "model"],
      where: { createdAt: { gte: monthStart } },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        cachedInputTokens: true,
      },
      _count: { _all: true },
      orderBy: { _sum: { inputTokens: "desc" } },
      take: 20,
    }),
    db.userUsagePeriod.findMany({
      where: { periodType: "month", periodKey: monthKey },
      orderBy: [{ llmInputTokens: "desc" }, { llmOutputTokens: "desc" }],
      take: 10,
      select: {
        userId: true,
        llmInputTokens: true,
        llmOutputTokens: true,
        questionsAccepted: true,
      },
    }),
    db.userPlan.count({ where: { planId: "free", status: "active" } }),
    db.userPlan.count({ where: { planId: "pro", status: "active" } }),
    db.userPlan.count({ where: { status: "disabled" } }),
    db.metricEvent.findMany({
      where: {
        eventType: {
          in: [
            "question.quota_blocked",
            "schema.sync_failed",
            "schema.refresh_blocked",
          ],
        },
        createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: {
        id: true,
        eventType: true,
        userId: true,
        createdAt: true,
        resourceId: true,
      },
    }),
  ]);

  const dayRows = await db.userUsagePeriod.groupBy({
    by: ["periodKey"],
    where: { periodType: "day", periodKey: { in: last30 } },
    _sum: { questionsAccepted: true },
  });
  const dayMap = new Map<string, number>(
    dayRows.map((r) => [r.periodKey, Number(r._sum.questionsAccepted ?? 0)]),
  );

  const accepted7d = weekAgg._sum.questionsAccepted ?? 0;
  const failed7d = weekAgg._sum.questionsFailed ?? 0;

  return {
    kpis: {
      questionsToday: dayAgg._sum.questionsAccepted ?? 0,
      questionsMonth: monthAgg._sum.questionsAccepted ?? 0,
      llmInputTokensMonth: bigintToNumber(monthAgg._sum.llmInputTokens),
      llmOutputTokensMonth: bigintToNumber(monthAgg._sum.llmOutputTokens),
      llmCachedTokensMonth: bigintToNumber(monthAgg._sum.llmCachedInputTokens),
      activeUsersToday: activeToday,
      activeUsers7d: active7dRows.length,
      activeUsers30d: active30dRows.length,
      newPlansThisMonth: newPlans,
      quotaBlocksToday: quotaBlocks,
      questionsAccepted7d: accepted7d,
      questionsFailed7d: failed7d,
      questionErrorRate7d:
        accepted7d > 0 ? failed7d / accepted7d : null,
    },
    tokensByProviderModel: llmGroups.map((g) => ({
      provider: g.provider,
      model: g.model,
      inputTokens: g._sum.inputTokens ?? 0,
      outputTokens: g._sum.outputTokens ?? 0,
      cachedTokens: g._sum.cachedInputTokens ?? 0,
      calls: g._count._all,
    })),
    topConsumers: topMonth.map((r) => ({
      userId: r.userId,
      inputTokens: bigintToNumber(r.llmInputTokens),
      outputTokens: bigintToNumber(r.llmOutputTokens),
      questionsAccepted: r.questionsAccepted,
    })),
    questionsPerDay: last30.map((key) => ({
      dayKey: key,
      questionsAccepted: dayMap.get(key) ?? 0,
    })),
    planDistribution: {
      free: freeCount,
      pro: proCount,
      disabled: disabledCount,
    },
    recentEvents,
  };
}
