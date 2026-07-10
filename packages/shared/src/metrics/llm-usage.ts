import { getAppDb } from "../app-db";
import { createResourceId } from "../domain";
import { devLogError } from "../observability";
import { dayPeriodKey, monthPeriodKey } from "../plans/periods";

/** Canonical task labels for a persisted model call. */
export type LlmUsageTask =
  | "agent"
  | "utility"
  | "title"
  | "memory"
  | "verify"
  | "ingest"
  | "embedding"
  | "chart_hint"
  | "other";

export interface LlmUsageInput {
  userId: string;
  queryRunId?: string | null;
  connectionId?: string | null;
  task: LlmUsageTask | string;
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number | null;
  success?: boolean;
  latencyMs?: number;
  attemptIndex?: number;
  callOrdinal?: number;
}

function n(value: number | undefined | null): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

/**
 * Persist one model call and roll it up into the per-user period counters, the
 * lifetime totals, and (when tied to a question) the per-run aggregate. Metrics
 * writes are best-effort: a failure here must never fail the user request whose
 * primary work already succeeded, so everything is wrapped and logged.
 */
export async function recordLlmUsage(input: LlmUsageInput): Promise<void> {
  const inputTokens = n(input.inputTokens);
  const outputTokens = n(input.outputTokens);
  const cachedInputTokens = n(input.cachedInputTokens);
  const totalTokens = inputTokens + outputTokens;
  const db = getAppDb();
  try {
    await db.llmUsageRecord.create({
      data: {
        id: createResourceId(),
        userId: input.userId,
        queryRunId: input.queryRunId ?? null,
        connectionId: input.connectionId ?? null,
        task: String(input.task),
        provider: input.provider,
        model: input.model,
        inputTokens,
        outputTokens,
        totalTokens,
        cachedInputTokens,
        reasoningTokens: input.reasoningTokens ?? null,
        success: input.success ?? true,
        latencyMs: input.latencyMs ?? null,
        attemptIndex: input.attemptIndex ?? null,
        callOrdinal: input.callOrdinal ?? null,
      },
    });

    const now = new Date();
    const periodTokenData = {
      llmInputTokens: { increment: BigInt(inputTokens) },
      llmOutputTokens: { increment: BigInt(outputTokens) },
      llmCachedInputTokens: { increment: BigInt(cachedInputTokens) },
      llmCallCount: { increment: 1 },
    };
    await Promise.all([
      db.userUsagePeriod.upsert({
        where: { userId_periodType_periodKey: { userId: input.userId, periodType: "day", periodKey: dayPeriodKey(now) } },
        create: {
          id: createResourceId(),
          userId: input.userId,
          periodType: "day",
          periodKey: dayPeriodKey(now),
          llmInputTokens: BigInt(inputTokens),
          llmOutputTokens: BigInt(outputTokens),
          llmCachedInputTokens: BigInt(cachedInputTokens),
          llmCallCount: 1,
        },
        update: periodTokenData,
      }),
      db.userUsagePeriod.upsert({
        where: { userId_periodType_periodKey: { userId: input.userId, periodType: "month", periodKey: monthPeriodKey(now) } },
        create: {
          id: createResourceId(),
          userId: input.userId,
          periodType: "month",
          periodKey: monthPeriodKey(now),
          llmInputTokens: BigInt(inputTokens),
          llmOutputTokens: BigInt(outputTokens),
          llmCachedInputTokens: BigInt(cachedInputTokens),
          llmCallCount: 1,
        },
        update: periodTokenData,
      }),
      db.userUsageTotals.upsert({
        where: { userId: input.userId },
        create: {
          userId: input.userId,
          llmInputTokens: BigInt(inputTokens),
          llmOutputTokens: BigInt(outputTokens),
          llmCachedInputTokens: BigInt(cachedInputTokens),
          llmCallCount: 1,
        },
        update: periodTokenData,
      }),
    ]);

    if (input.queryRunId) {
      await db.queryRunUsage.upsert({
        where: { queryRunId: input.queryRunId },
        create: {
          queryRunId: input.queryRunId,
          userId: input.userId,
          inputTokens,
          outputTokens,
          cachedInputTokens,
          llmCallCount: 1,
          primaryProvider: input.provider,
          primaryModel: input.model,
        },
        update: {
          inputTokens: { increment: inputTokens },
          outputTokens: { increment: outputTokens },
          cachedInputTokens: { increment: cachedInputTokens },
          llmCallCount: { increment: 1 },
        },
      });
    }
  } catch (error) {
    devLogError("metrics.llm-usage.failed", "Failed to record LLM usage.", error, {
      task: String(input.task),
      queryRunId: input.queryRunId ?? undefined,
    });
  }
}

export interface QueryRunUsageFinalizeInput {
  queryRunId: string;
  userId: string;
  agentSteps?: number;
  sqlAttempts?: number;
  budgetProfile?: string;
  chartGenerated?: boolean;
  chartType?: string | null;
}

/**
 * Fold per-question agent metadata (steps, SQL attempts, budget profile, chart)
 * into the per-run aggregate at completion, and bump the per-period charts
 * counter when a chart was produced. Best-effort.
 */
export async function finalizeQueryRunUsage(input: QueryRunUsageFinalizeInput): Promise<void> {
  const db = getAppDb();
  try {
    await db.queryRunUsage.upsert({
      where: { queryRunId: input.queryRunId },
      create: {
        queryRunId: input.queryRunId,
        userId: input.userId,
        agentSteps: input.agentSteps ?? null,
        sqlAttempts: input.sqlAttempts ?? null,
        budgetProfile: input.budgetProfile ?? null,
        chartGenerated: input.chartGenerated ?? false,
        chartType: input.chartType ?? null,
      },
      update: {
        agentSteps: input.agentSteps ?? null,
        sqlAttempts: input.sqlAttempts ?? null,
        budgetProfile: input.budgetProfile ?? null,
        chartGenerated: input.chartGenerated ?? false,
        chartType: input.chartType ?? null,
      },
    });

    if (input.chartGenerated) {
      const now = new Date();
      await Promise.all([
        db.userUsagePeriod.updateMany({
          where: { userId: input.userId, periodType: "day", periodKey: dayPeriodKey(now) },
          data: { chartsGenerated: { increment: 1 } },
        }),
        db.userUsagePeriod.updateMany({
          where: { userId: input.userId, periodType: "month", periodKey: monthPeriodKey(now) },
          data: { chartsGenerated: { increment: 1 } },
        }),
        db.userUsageTotals.upsert({
          where: { userId: input.userId },
          create: { userId: input.userId, chartsGenerated: 1 },
          update: { chartsGenerated: { increment: 1 } },
        }),
      ]);
    }
  } catch (error) {
    devLogError("metrics.query-run-usage.failed", "Failed to finalize query run usage.", error, {
      queryRunId: input.queryRunId,
    });
  }
}
