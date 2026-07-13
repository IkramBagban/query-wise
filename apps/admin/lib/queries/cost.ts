import "server-only";

import { requireAdmin } from "@/lib/admin-auth";
import { adminDb } from "@/lib/db";
import {
  clampDateRange,
  dayPeriodKey,
  startOfPrevUtcMonth,
  startOfUtcMonth,
} from "@/lib/period-keys";

export type CostRangePreset = "7d" | "30d" | "this_month" | "last_month";

export interface CostFilters {
  preset?: CostRangePreset;
  from?: string;
  to?: string;
  provider?: string;
  model?: string;
  task?: string;
  userId?: string;
}

export interface CostTableRow {
  provider: string;
  model: string;
  task: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  failures: number;
  distinctUsers: number;
}

export interface CostSeriesPoint {
  dayKey: string;
  provider: string;
  task: string;
  inputTokens: number;
  outputTokens: number;
  calls: number;
  failures: number;
}

export interface CostExplorerData {
  from: Date;
  to: Date;
  rows: CostTableRow[];
  series: CostSeriesPoint[];
  providers: string[];
  models: string[];
  tasks: string[];
}

function resolveRange(filters: CostFilters): { from: Date; to: Date } {
  const now = new Date();
  const preset = filters.preset ?? "30d";
  if (filters.from && filters.to) {
    return clampDateRange(new Date(filters.from), new Date(filters.to), 90);
  }
  if (preset === "this_month") {
    return { from: startOfUtcMonth(now), to: now };
  }
  if (preset === "last_month") {
    const from = startOfPrevUtcMonth(now);
    const to = startOfUtcMonth(now);
    return { from, to };
  }
  const days = preset === "7d" ? 7 : 30;
  return {
    from: new Date(now.getTime() - days * 24 * 60 * 60 * 1000),
    to: now,
  };
}

export async function getCostExplorer(
  filters: CostFilters = {},
): Promise<CostExplorerData> {
  await requireAdmin();
  const db = adminDb();
  const { from, to } = resolveRange(filters);

  const where: {
    createdAt: { gte: Date; lt: Date };
    provider?: string;
    model?: string;
    task?: string;
    userId?: string;
  } = {
    createdAt: { gte: from, lt: to },
  };
  if (filters.provider) where.provider = filters.provider;
  if (filters.model) where.model = filters.model;
  if (filters.task) where.task = filters.task;
  if (filters.userId) where.userId = filters.userId;

  const [grouped, allInRange, failGrouped] = await Promise.all([
    db.llmUsageRecord.groupBy({
      by: ["provider", "model", "task"],
      where,
      _sum: {
        inputTokens: true,
        outputTokens: true,
        cachedInputTokens: true,
      },
      _count: { _all: true },
    }),
    db.llmUsageRecord.findMany({
      where,
      select: {
        provider: true,
        model: true,
        task: true,
        userId: true,
        inputTokens: true,
        outputTokens: true,
        success: true,
        createdAt: true,
      },
      // Bound: 90d of records; if this grows, add a rollup. Spec allows raw GROUP BY ≤90d.
      take: 50_000,
      orderBy: { createdAt: "desc" },
    }),
    db.llmUsageRecord.groupBy({
      by: ["provider", "model", "task"],
      where: { ...where, success: false },
      _count: { _all: true },
    }),
  ]);

  const failMap = new Map(
    failGrouped.map((f) => [
      `${f.provider}\0${f.model}\0${f.task}`,
      f._count._all,
    ]),
  );

  // Distinct users per group from the sampled rows.
  const usersByGroup = new Map<string, Set<string>>();
  const seriesMap = new Map<string, CostSeriesPoint>();
  const providers = new Set<string>();
  const models = new Set<string>();
  const tasks = new Set<string>();

  for (const r of allInRange) {
    providers.add(r.provider);
    models.add(r.model);
    tasks.add(r.task);
    const gkey = `${r.provider}\0${r.model}\0${r.task}`;
    if (!usersByGroup.has(gkey)) usersByGroup.set(gkey, new Set());
    usersByGroup.get(gkey)!.add(r.userId);

    const dayKey = dayPeriodKey(r.createdAt);
    const skey = `${dayKey}\0${r.provider}\0${r.task}`;
    const prev = seriesMap.get(skey) ?? {
      dayKey,
      provider: r.provider,
      task: r.task,
      inputTokens: 0,
      outputTokens: 0,
      calls: 0,
      failures: 0,
    };
    prev.inputTokens += r.inputTokens;
    prev.outputTokens += r.outputTokens;
    prev.calls += 1;
    if (!r.success) prev.failures += 1;
    seriesMap.set(skey, prev);
  }

  const rows: CostTableRow[] = grouped
    .map((g) => {
      const key = `${g.provider}\0${g.model}\0${g.task}`;
      return {
        provider: g.provider,
        model: g.model,
        task: g.task,
        calls: g._count._all,
        inputTokens: g._sum.inputTokens ?? 0,
        outputTokens: g._sum.outputTokens ?? 0,
        cachedTokens: g._sum.cachedInputTokens ?? 0,
        failures: failMap.get(key) ?? 0,
        distinctUsers: usersByGroup.get(key)?.size ?? 0,
      };
    })
    .sort(
      (a, b) =>
        b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens),
    );

  return {
    from,
    to,
    rows,
    series: Array.from(seriesMap.values()).sort((a, b) =>
      a.dayKey.localeCompare(b.dayKey),
    ),
    providers: Array.from(providers).sort(),
    models: Array.from(models).sort(),
    tasks: Array.from(tasks).sort(),
  };
}

/** Build CSV for admin-side export (tokens only — no dollar estimates). */
export function costRowsToCsv(rows: CostTableRow[]): string {
  const header =
    "provider,model,task,calls,input_tokens,output_tokens,cached_tokens,failures,distinct_users";
  const lines = rows.map((r) =>
    [
      r.provider,
      r.model,
      r.task,
      r.calls,
      r.inputTokens,
      r.outputTokens,
      r.cachedTokens,
      r.failures,
      r.distinctUsers,
    ]
      .map((c) => {
        const s = String(c);
        return s.includes(",") ? `"${s}"` : s;
      })
      .join(","),
  );
  return [header, ...lines].join("\n");
}
