import "server-only";

import { Prisma, type DashboardWidget } from "@prisma/client";
import { getAppDb } from "@query-wise/shared/app-db";
import { AppError, resourceNotFound } from "@query-wise/shared/dal/core";
import type {
  BoundedResultPreview,
  DashboardDateRange,
  ProviderQuery,
  WidgetFilterBinding,
  WidgetRefreshResultDto,
} from "@query-wise/shared/types";
import { requireDashboardAccess } from "@/lib/dal/authorization";
import { getQueryRuntimeDependencies, type QueryRuntimeContext } from "@/lib/query/runtime";
import { createResultPreview } from "@/lib/query/preview";
import { ProviderQuerySchema } from "./schemas";
import { applyRangeMarkers } from "./filter-binding";
import { getOrExecuteWidgetResult, widgetResultCacheKey } from "./result-cache";

const REFRESH_CONCURRENCY = 4;

function jsonInput(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function toFilterBinding(value: Prisma.JsonValue | null): WidgetFilterBinding | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.dateColumn !== "string") return null;
  return value as unknown as WidgetFilterBinding;
}

/**
 * Resolve the widget's connection: prefer the denormalized `connectionId`
 * (SPEC-06 §4.1 — survives conversation/run deletion), else fall back to the
 * originating query run and heal the denormalization opportunistically.
 */
async function resolveConnectionId(
  widget: DashboardWidget,
  ownerUserId: string,
): Promise<string | null> {
  if (widget.connectionId) return widget.connectionId;
  if (!widget.queryRunId) return null;
  const run = await getAppDb().queryRun.findFirst({
    where: { id: widget.queryRunId, ownerUserId },
    select: { connectionId: true },
  });
  if (!run) return null;
  await getAppDb()
    .dashboardWidget.update({ where: { id: widget.id }, data: { connectionId: run.connectionId } })
    .catch(() => undefined);
  return run.connectionId;
}

function errorResult(widgetId: string, code: string, message: string): WidgetRefreshResultDto {
  return { widgetId, status: "error", result: null, lastRefreshedAt: null, error: { code, message } };
}

/**
 * Execute one live widget's stored query through the read-only validate→execute
 * runtime and persist the outcome. On success the snapshot is overwritten (the
 * fallback stays fresh) and lastRefreshedAt is set; on failure the old snapshot
 * is kept and lastRefreshError is recorded — the rest of the grid is unaffected
 * (AC #4). This never bypasses validation (AC #10).
 */
async function refreshWidgetRecord(
  widget: DashboardWidget,
  ownerUserId: string,
  range: DashboardDateRange | null,
  force: boolean,
): Promise<WidgetRefreshResultDto> {
  const parsedQuery = ProviderQuerySchema.safeParse(widget.queryDefinition);
  if (!parsedQuery.success) {
    return errorResult(widget.id, "WIDGET_QUERY_UNAVAILABLE", "This widget has no runnable saved query.");
  }
  const connectionId = await resolveConnectionId(widget, ownerUserId);
  if (!connectionId) {
    return errorResult(widget.id, "WIDGET_QUERY_UNAVAILABLE", "This widget's data source is unavailable.");
  }

  const binding = toFilterBinding(widget.filterBinding);
  const boundSql = applyRangeMarkers(parsedQuery.data.text, binding, range);
  const query: ProviderQuery = { kind: "sql", dialectId: parsedQuery.data.dialectId, text: boundSql };
  const context: QueryRuntimeContext = {
    ownerUserId,
    connectionId,
    providerId: "postgresql",
    dialectId: parsedQuery.data.dialectId,
  };
  const deps = getQueryRuntimeDependencies();

  try {
    const validation = await deps.validateReadQuery(context, query);
    if (!validation.valid || !validation.normalizedQuery) {
      const detail = validation.violations.map((v) => v.message).join("; ") || "read-only policy violation";
      throw new AppError("QUERY_VALIDATION_BLOCKED", `The widget query cannot be refreshed: ${detail}`, true);
    }
    const normalizedSql = validation.normalizedQuery.text;
    const cacheKey = widgetResultCacheKey({ connectionId, normalizedSql });
    const preview = await getOrExecuteWidgetResult(cacheKey, force, async () => {
      const result = await deps.executeValidatedReadQuery(context, {
        kind: "sql",
        dialectId: parsedQuery.data.dialectId,
        text: normalizedSql,
      });
      return createResultPreview(result);
    });

    const lastRefreshedAt = new Date();
    await getAppDb().dashboardWidget.update({
      where: { id: widget.id },
      data: { snapshot: jsonInput(preview), lastRefreshedAt, lastRefreshError: null },
    });
    return { widgetId: widget.id, status: "ok", result: preview, lastRefreshedAt: lastRefreshedAt.toISOString(), error: null };
  } catch (error) {
    const code = error instanceof AppError ? error.code : "QUERY_EXECUTION_FAILED";
    const message =
      code === "DATA_SOURCE_UNAVAILABLE"
        ? "Showing last known values — couldn't reach the database."
        : error instanceof AppError
          ? error.message
          : "This widget could not be refreshed.";
    // Keep the old snapshot; record the error affordance.
    await getAppDb()
      .dashboardWidget.update({ where: { id: widget.id }, data: { lastRefreshError: message } })
      .catch(() => undefined);
    return errorResult(widget.id, code, message);
  }
}

/** Single-widget refresh endpoint entrypoint (SPEC-06 §4.1). */
export async function refreshWidget(
  dashboardId: string,
  widgetId: string,
  opts: { range?: DashboardDateRange | null; force?: boolean } = {},
): Promise<WidgetRefreshResultDto> {
  const dashboard = await requireDashboardAccess(dashboardId, "edit");
  const widget = await getAppDb().dashboardWidget.findFirst({ where: { id: widgetId, dashboardId } });
  if (!widget) throw resourceNotFound();
  // SPEC-06 §2 (whole-dashboard mode): snapshot dashboards are frozen by definition.
  if ((dashboard as any).mode !== "live") {
    return { widgetId: widget.id, status: "skipped", result: null, lastRefreshedAt: null, error: null };
  }
  const range = null;
  return refreshWidgetRecord(widget, dashboard.ownerUserId, range, opts.force ?? true);
}

/** Batch refresh: run every live widget concurrently with a bounded pool (§4.1). */
export async function refreshDashboard(
  dashboardId: string,
  opts: { range?: DashboardDateRange | null; force?: boolean } = {},
): Promise<WidgetRefreshResultDto[]> {
  const dashboard = await requireDashboardAccess(dashboardId, "edit");
  // SPEC-06 §2 (whole-dashboard mode): a snapshot dashboard refreshes nothing.
  if ((dashboard as any).mode !== "live") return [];
  const range = null;
  const widgets = await getAppDb().dashboardWidget.findMany({
    where: { dashboardId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 51,
  });

  const results = new Array<WidgetRefreshResultDto>(widgets.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < widgets.length) {
      const index = next++;
      results[index] = await refreshWidgetRecord(
        widgets[index],
        dashboard.ownerUserId,
        range,
        opts.force ?? true,
      );
    }
  }
  await Promise.all(Array.from({ length: Math.min(REFRESH_CONCURRENCY, widgets.length) }, () => worker()));
  return results;
}
