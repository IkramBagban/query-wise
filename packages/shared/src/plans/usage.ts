import { getAppDb, type AppDbTransaction } from "../app-db";
import { createResourceId } from "../domain";
import { AppError } from "../dal/core";
import {
  dayPeriodKey,
  monthPeriodKey,
  type PeriodType,
  secondsUntilNextUtcMidnight,
  secondsUntilNextUtcMonth,
} from "./periods";

type Db = ReturnType<typeof getAppDb> | AppDbTransaction;

/** Ensure the (user, periodType, periodKey) counter row exists. */
async function ensurePeriodRow(db: Db, userId: string, periodType: PeriodType, key: string): Promise<void> {
  await db.userUsagePeriod.upsert({
    where: { userId_periodType_periodKey: { userId, periodType, periodKey: key } },
    create: { id: createResourceId(), userId, periodType, periodKey: key },
    update: {},
  });
}

/**
 * Reserve one question against the daily and monthly caps. Fail-closed: runs
 * inside the caller's accept transaction, BEFORE any expensive LLM work. The
 * conditional `updateMany` (increment where current < limit) is the atomic
 * check-and-increment; a zero count means the cap is already reached, and
 * throwing rolls back the whole accept transaction (including a day increment
 * that preceded a monthly rejection).
 *
 * Order: day first, then month. Idempotent retries must NOT call this — the
 * caller skips it when returning an existing run.
 */
export async function reserveQuestionQuota(
  tx: Db,
  params: { userId: string; questionsPerDay: number; questionsPerMonth: number; now?: Date },
): Promise<void> {
  const now = params.now ?? new Date();
  const dayKey = dayPeriodKey(now);
  const monthKey = monthPeriodKey(now);

  await ensurePeriodRow(tx, params.userId, "day", dayKey);
  await ensurePeriodRow(tx, params.userId, "month", monthKey);

  const day = await tx.userUsagePeriod.updateMany({
    where: {
      userId: params.userId,
      periodType: "day",
      periodKey: dayKey,
      questionsAccepted: { lt: params.questionsPerDay },
    },
    data: { questionsAccepted: { increment: 1 } },
  });
  if (day.count === 0) {
    throw new AppError(
      "QUOTA_EXCEEDED_DAILY",
      `Daily free limit reached (${params.questionsPerDay} questions). Try again tomorrow (UTC), or use a Pro account.`,
      true,
    );
  }

  const month = await tx.userUsagePeriod.updateMany({
    where: {
      userId: params.userId,
      periodType: "month",
      periodKey: monthKey,
      questionsAccepted: { lt: params.questionsPerMonth },
    },
    data: { questionsAccepted: { increment: 1 } },
  });
  if (month.count === 0) {
    throw new AppError(
      "QUOTA_EXCEEDED_MONTHLY",
      `Monthly limit reached (${params.questionsPerMonth} questions). It resets on the 1st (UTC), or use a Pro account.`,
      true,
    );
  }
}

/** `retryAfterSeconds` for a daily/monthly quota error. */
export function quotaRetryAfterSeconds(code: string, now: Date = new Date()): number | undefined {
  if (code === "QUOTA_EXCEEDED_DAILY" || code === "QUOTA_EXCEEDED_SCHEMA_REFRESH") {
    return secondsUntilNextUtcMidnight(now);
  }
  if (code === "QUOTA_EXCEEDED_MONTHLY") return secondsUntilNextUtcMonth(now);
  return undefined;
}

/**
 * Reserve one manual schema refresh against the daily cap. Fail-closed before
 * queueing the durable job.
 */
export async function reserveSchemaRefresh(
  db: Db,
  params: { userId: string; schemaRefreshesPerDay: number; now?: Date },
): Promise<void> {
  const now = params.now ?? new Date();
  const dayKey = dayPeriodKey(now);
  await ensurePeriodRow(db, params.userId, "day", dayKey);
  const result = await db.userUsagePeriod.updateMany({
    where: {
      userId: params.userId,
      periodType: "day",
      periodKey: dayKey,
      schemaRefreshes: { lt: params.schemaRefreshesPerDay },
    },
    data: { schemaRefreshes: { increment: 1 } },
  });
  if (result.count === 0) {
    throw new AppError(
      "QUOTA_EXCEEDED_SCHEMA_REFRESH",
      `Daily schema re-sync limit reached (${params.schemaRefreshesPerDay}). Try again tomorrow (UTC), or use a Pro account.`,
      true,
    );
  }
}

/** Increment a question terminal counter (succeeded|failed). Best-effort. */
export async function recordQuestionTerminal(
  userId: string,
  outcome: "succeeded" | "failed",
  now: Date = new Date(),
): Promise<void> {
  const dayKey = dayPeriodKey(now);
  const monthKey = monthPeriodKey(now);
  const db = getAppDb();
  // Explicit branches (not computed keys) so Prisma's generated input types apply.
  const periodData =
    outcome === "succeeded"
      ? { questionsSucceeded: { increment: 1 } }
      : { questionsFailed: { increment: 1 } };
  await Promise.all([
    ensurePeriodRow(db, userId, "day", dayKey),
    ensurePeriodRow(db, userId, "month", monthKey),
  ]);
  await Promise.all([
    db.userUsagePeriod.updateMany({
      where: { userId, periodType: "day", periodKey: dayKey },
      data: periodData,
    }),
    db.userUsagePeriod.updateMany({
      where: { userId, periodType: "month", periodKey: monthKey },
      data: periodData,
    }),
    outcome === "succeeded"
      ? db.userUsageTotals.upsert({
          where: { userId },
          create: { userId, questionsSucceeded: 1 },
          update: { questionsSucceeded: { increment: 1 } },
        })
      : db.userUsageTotals.upsert({
          where: { userId },
          create: { userId, questionsFailed: 1 },
          update: { questionsFailed: { increment: 1 } },
        }),
  ]);
}

export interface UsageSnapshot {
  questionsToday: number;
  questionsThisMonth: number;
  schemaRefreshesToday: number;
  llmInputTokensThisMonth: number;
  llmOutputTokensThisMonth: number;
  chartsGeneratedThisMonth: number;
}

/** Read the day/month counters that back the plan/usage endpoint. */
export async function readUsageSnapshot(userId: string, now: Date = new Date()): Promise<UsageSnapshot> {
  const db = getAppDb();
  const [day, month] = await Promise.all([
    db.userUsagePeriod.findUnique({
      where: { userId_periodType_periodKey: { userId, periodType: "day", periodKey: dayPeriodKey(now) } },
    }),
    db.userUsagePeriod.findUnique({
      where: { userId_periodType_periodKey: { userId, periodType: "month", periodKey: monthPeriodKey(now) } },
    }),
  ]);
  return {
    questionsToday: day?.questionsAccepted ?? 0,
    questionsThisMonth: month?.questionsAccepted ?? 0,
    schemaRefreshesToday: day?.schemaRefreshes ?? 0,
    llmInputTokensThisMonth: Number(month?.llmInputTokens ?? BigInt(0)),
    llmOutputTokensThisMonth: Number(month?.llmOutputTokens ?? BigInt(0)),
    chartsGeneratedThisMonth: month?.chartsGenerated ?? 0,
  };
}
