import "server-only";

import { Prisma, type Dashboard, type DashboardWidget } from "@prisma/client";
import { getAppDb } from "@query-wise/shared/app-db";
import { requireUser } from "@/lib/auth";
import { requireDashboardAccess } from "@/lib/dal/authorization";
import {
  AppError,
  decodeCursor,
  encodeCursor,
  normalizePageLimit,
  resourceNotFound,
} from "@query-wise/shared/dal/core";
import { createResourceId } from "@query-wise/shared/domain";
import type {
  DashboardOwnerDto,
  DashboardViewerDto,
  JsonValue,
} from "@query-wise/shared/types";
import type {
  DashboardDateRange,
  WidgetFilterBinding,
  WidgetMode,
} from "@query-wise/shared/types";
import {
  DashboardCreateSchema,
  DashboardNameSchema,
  DashboardSettingsSchema,
  WidgetCreateSchema,
  WidgetLayoutBatchSchema,
  WidgetUpdateSchema,
} from "./schemas";
import { validationError } from "./http";
import { claimPendingEmailGrants } from "@/lib/sharing/grants";
import { analyzeFilterBinding, getConnectionDateColumns } from "./filter-binding";
import { assertAccountActive, assertDashboardQuota, getPlanForUser } from "@/lib/plans";
import { recordMetricEvent } from "@query-wise/shared/metrics";

const DASHBOARD_LIST_ENDPOINT = "dashboards";
const MAX_WIDGETS = 50;

type DashboardListRow = Dashboard & { access: "owner" | "viewer"; widgetCount: bigint };
type DashboardDto = DashboardOwnerDto | DashboardViewerDto;

function jsonInput(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function iso(value: Date): string {
  return value.toISOString();
}

function isoOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function toWidgetMode(value: string): WidgetMode {
  return value === "snapshot" ? "snapshot" : "live";
}

function toFilterBinding(value: Prisma.JsonValue | null): WidgetFilterBinding | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as unknown as WidgetFilterBinding;
}

function toDateRange(value: Prisma.JsonValue | null): DashboardDateRange | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as unknown as DashboardDateRange;
}

function ownerWidget(widget: DashboardWidget): DashboardOwnerDto["widgets"][number] {
  return {
    id: widget.id,
    dashboardId: widget.dashboardId,
    queryRunId: widget.queryRunId,
    title: widget.title,
    chartConfig: widget.chartConfig as unknown as DashboardOwnerDto["widgets"][number]["chartConfig"],
    layout: widget.layout as unknown as DashboardOwnerDto["widgets"][number]["layout"],
    snapshot: widget.snapshot as unknown as DashboardOwnerDto["widgets"][number]["snapshot"],
    queryDefinition:
      widget.queryDefinition as unknown as DashboardOwnerDto["widgets"][number]["queryDefinition"],
    viewTransform: widget.viewTransform as unknown as DashboardOwnerDto["widgets"][number]["viewTransform"],
    connectionId: widget.connectionId,
    lastRefreshedAt: isoOrNull(widget.lastRefreshedAt),
    lastRefreshError: widget.lastRefreshError,
    filterBinding: toFilterBinding(widget.filterBinding),
    createdAt: iso(widget.createdAt),
    updatedAt: iso(widget.updatedAt),
  };
}

function viewerWidget(widget: DashboardWidget): DashboardViewerDto["widgets"][number] {
  return {
    id: widget.id,
    dashboardId: widget.dashboardId,
    title: widget.title,
    chartConfig: widget.chartConfig as unknown as DashboardViewerDto["widgets"][number]["chartConfig"],
    layout: widget.layout as unknown as DashboardViewerDto["widgets"][number]["layout"],
    snapshot: widget.snapshot as unknown as DashboardViewerDto["widgets"][number]["snapshot"],
    viewTransform: widget.viewTransform as unknown as DashboardViewerDto["widgets"][number]["viewTransform"],
    lastRefreshedAt: isoOrNull(widget.lastRefreshedAt),
    lastRefreshError: widget.lastRefreshError,
    filterBinding: toFilterBinding(widget.filterBinding),
    createdAt: iso(widget.createdAt),
    updatedAt: iso(widget.updatedAt),
  };
}

async function dashboardDto(dashboard: Dashboard, userId: string): Promise<DashboardDto> {
  const widgets = await getAppDb().dashboardWidget.findMany({
    where: { dashboardId: dashboard.id },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: MAX_WIDGETS + 1,
  });
  if (widgets.length > MAX_WIDGETS) {
    throw new AppError("RESULT_LIMIT_EXCEEDED", "Dashboard exceeds the widget limit.");
  }

  const defaultDateRange = toDateRange(dashboard.defaultDateRange ?? null);
  if (dashboard.ownerUserId === userId) {
    return {
      contractVersion: "querywise.v2",
      id: dashboard.id,
      name: dashboard.name,
      access: "owner",
      mode: toWidgetMode((dashboard as any).mode),
      defaultDateRange,
      refreshIntervalSeconds: dashboard.refreshIntervalSeconds ?? null,
      widgets: widgets.map(ownerWidget),
      createdAt: iso(dashboard.createdAt),
      updatedAt: iso(dashboard.updatedAt),
    };
  }
  return {
    contractVersion: "querywise.v2",
    id: dashboard.id,
    name: dashboard.name,
    access: "viewer",
    mode: toWidgetMode((dashboard as any).mode),
    defaultDateRange,
    refreshIntervalSeconds: dashboard.refreshIntervalSeconds ?? null,
    widgets: widgets.map(viewerWidget),
    createdAt: iso(dashboard.createdAt),
    updatedAt: iso(dashboard.updatedAt),
  };
}

export async function listDashboards(input: { cursor?: string; limit?: number }) {
  const { userId } = await requireUser();
  await claimPendingEmailGrants(userId);
  const limit = normalizePageLimit(input.limit);
  const cursor = input.cursor
    ? decodeCursor(input.cursor, DASHBOARD_LIST_ENDPOINT, userId)
    : null;
  const cursorDate = cursor?.[0];
  const cursorId = cursor?.[1];
  if (
    cursor &&
    (typeof cursorDate !== "string" ||
      Number.isNaN(Date.parse(cursorDate)) ||
      typeof cursorId !== "string")
  ) {
    throw validationError();
  }

  const rows = await getAppDb().$queryRaw<DashboardListRow[]>(Prisma.sql`
    SELECT DISTINCT
      dashboard.id,
      dashboard.owner_user_id AS "ownerUserId",
      dashboard.name,
      dashboard."mode",
      dashboard.deleted_at AS "deletedAt",
      dashboard.created_at AS "createdAt",
      dashboard.updated_at AS "updatedAt",
      (SELECT count(*)::bigint FROM v2_dashboard_widgets AS widget WHERE widget.dashboard_id = dashboard.id) AS "widgetCount",
      CASE WHEN dashboard.owner_user_id = ${userId} THEN 'owner' ELSE 'viewer' END AS access
    FROM v2_dashboards AS dashboard
    LEFT JOIN v2_dashboard_access_grants AS access_grant
      ON access_grant.dashboard_id = dashboard.id
      AND access_grant.recipient_user_id = ${userId}
      AND access_grant.permission = 'view'
    WHERE dashboard.deleted_at IS NULL
      AND (dashboard.owner_user_id = ${userId} OR access_grant.id IS NOT NULL)
      ${
        cursorDate && cursorId
          ? Prisma.sql`AND (dashboard.updated_at, dashboard.id) < (${new Date(cursorDate as string)}, ${cursorId}::uuid)`
          : Prisma.empty
      }
    ORDER BY dashboard.updated_at DESC, dashboard.id DESC
    LIMIT ${limit + 1}
  `);
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map((row) => ({
    id: row.id,
    name: row.name,
    access: row.access,
    mode: toWidgetMode((row as any).mode),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    widgetCount: Number(row.widgetCount),
  }));
  const last = rows[Math.min(rows.length, limit) - 1];
  return {
    contractVersion: "querywise.v2" as const,
    items,
    pageInfo: {
      nextCursor:
        hasMore && last
          ? encodeCursor(DASHBOARD_LIST_ENDPOINT, userId, [
              iso(last.updatedAt),
              last.id,
            ] satisfies JsonValue[])
          : null,
      hasMore,
      limit,
    },
  };
}

export async function createDashboard(input: unknown): Promise<DashboardDto> {
  const parsed = DashboardCreateSchema.safeParse(input);
  if (!parsed.success) throw validationError(parsed.error);
  const { userId } = await requireUser();
  // Plan gate: fail closed for disabled accounts and enforce the dashboard cap.
  const plan = await getPlanForUser(userId);
  assertAccountActive(plan);
  await assertDashboardQuota(userId, plan);
  const dashboard = await getAppDb().dashboard.create({
    data: {
      id: createResourceId(),
      ownerUserId: userId,
      name: parsed.data.name,
      mode: parsed.data.mode ?? "live",
    } as any,
  });
  void recordMetricEvent({
    userId,
    eventType: "dashboard.created",
    resourceType: "dashboard",
    resourceId: dashboard.id,
  });
  return dashboardDto(dashboard, userId);
}

export async function getDashboard(dashboardId: string): Promise<DashboardDto> {
  const { userId } = await requireUser();
  const dashboard = await requireDashboardAccess(dashboardId, "view");
  return dashboardDto(dashboard, userId);
}

export async function renameDashboard(dashboardId: string, input: unknown) {
  const parsed = DashboardNameSchema.safeParse((input as { name?: unknown })?.name);
  if (!parsed.success) throw validationError(parsed.error);
  await requireDashboardAccess(dashboardId, "edit");
  const dashboard = await getAppDb().dashboard.update({
    where: { id: dashboardId },
    data: { name: parsed.data },
  });
  return { id: dashboard.id, updatedAt: iso(dashboard.updatedAt) };
}

export async function deleteDashboard(dashboardId: string): Promise<void> {
  const dashboard = await requireDashboardAccess(dashboardId, "edit");
  await getAppDb().dashboard.update({
    where: { id: dashboardId },
    data: { deletedAt: new Date() },
  });
  void recordMetricEvent({
    userId: dashboard.ownerUserId,
    eventType: "dashboard.deleted",
    resourceType: "dashboard",
    resourceId: dashboardId,
  });
}

export async function createWidget(dashboardId: string, input: unknown) {
  const parsed = WidgetCreateSchema.safeParse(input);
  if (!parsed.success) throw validationError(parsed.error);
  const dashboard = await requireDashboardAccess(dashboardId, "edit");

  // SPEC-06 §4.1/§5: denormalize the connection off the originating run so a later
  // conversation/run deletion never orphans the widget, and (§5) analyze the SQL
  // for a bindable date predicate — injecting :qw_from/:qw_to markers so the global
  // range picker can rewrite it later. Both happen outside the capacity transaction
  // because they read the run + schema snapshot; the values are folded into insert.
  let connectionId: string | null = null;
  let queryDefinition = parsed.data.queryDefinition ?? null;
  let filterBinding: WidgetFilterBinding | null = null;

  if (parsed.data.queryRunId) {
    const run = await getAppDb().queryRun.findFirst({
      where: { id: parsed.data.queryRunId, ownerUserId: dashboard.ownerUserId },
      select: { id: true, connectionId: true },
    });
    if (!run) throw resourceNotFound();
    connectionId = run.connectionId;
  }

  if (connectionId && queryDefinition?.text) {
    try {
      const dateColumns = await getConnectionDateColumns(connectionId, dashboard.ownerUserId);
      const analysis = dateColumns.length ? analyzeFilterBinding(queryDefinition.text, dateColumns) : null;
      if (analysis) {
        queryDefinition = { ...queryDefinition, text: analysis.sqlText };
        filterBinding = analysis.binding;
      }
    } catch {
      // Binding is a best-effort convenience; never block a pin on analysis failure.
    }
  }

  return getAppDb().$transaction(async (tx) => {
    // Serialize writers for this dashboard so the count and insert form one
    // atomic capacity check across all application instances.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`dashboard-widgets:${dashboardId}`}))`;
    const count = await tx.dashboardWidget.count({ where: { dashboardId } });
    if (count >= MAX_WIDGETS) {
      throw new AppError("RESULT_LIMIT_EXCEEDED", "A dashboard can contain at most 50 widgets.");
    }
    const widget = await tx.dashboardWidget.create({
      data: {
        id: createResourceId(),
        dashboardId,
        title: parsed.data.title,
        chartConfig: jsonInput(parsed.data.chartConfig),
        layout: jsonInput(parsed.data.layout),
        snapshot: jsonInput(parsed.data.snapshot),
        queryRunId: parsed.data.queryRunId ?? null,
        connectionId,
        filterBinding: filterBinding ? jsonInput(filterBinding) : Prisma.JsonNull,
        queryDefinition: queryDefinition ? jsonInput(queryDefinition) : Prisma.JsonNull,
        viewTransform: parsed.data.viewTransform ? jsonInput(parsed.data.viewTransform) : Prisma.JsonNull,
      } as Prisma.DashboardWidgetUncheckedCreateInput,
    });
    await tx.dashboard.update({ where: { id: dashboardId }, data: { updatedAt: new Date() } });
    return ownerWidget(widget);
  });
}

export async function updateWidget(
  dashboardId: string,
  widgetId: string,
  input: unknown,
) {
  const parsed = WidgetUpdateSchema.safeParse(input);
  if (!parsed.success) throw validationError(parsed.error);
  const dashboard = await requireDashboardAccess(dashboardId, "edit");
  return getAppDb().$transaction(async (tx) => {
    if (parsed.data.queryRunId) {
      const run = await tx.queryRun.findFirst({
        where: { id: parsed.data.queryRunId, ownerUserId: dashboard.ownerUserId },
        select: { id: true },
      });
      if (!run) throw resourceNotFound();
    }
    const existing = await tx.dashboardWidget.findFirst({
      where: { id: widgetId, dashboardId },
    });
    if (!existing) throw resourceNotFound();
    const widget = await tx.dashboardWidget.update({
      where: { id: widgetId },
      data: {
        title: parsed.data.title,
        chartConfig: parsed.data.chartConfig
          ? jsonInput(parsed.data.chartConfig)
          : undefined,
        layout: parsed.data.layout ? jsonInput(parsed.data.layout) : undefined,
        snapshot: parsed.data.snapshot ? jsonInput(parsed.data.snapshot) : undefined,
        queryRunId: parsed.data.queryRunId,
        queryDefinition:
          parsed.data.queryDefinition === null
            ? Prisma.JsonNull
            : parsed.data.queryDefinition
              ? jsonInput(parsed.data.queryDefinition)
              : undefined,
      },
    });
    await tx.dashboard.update({ where: { id: dashboardId }, data: { updatedAt: new Date() } });
    return ownerWidget(widget);
  });
}

/**
 * SPEC-06 §2/§4.2/§5: persist dashboard-level live controls — the whole-dashboard
 * live/snapshot mode, the default date range, and the auto-refresh cadence.
 * Additive — omitted keys are left unchanged.
 */
export async function updateDashboardSettings(dashboardId: string, input: unknown) {
  const parsed = DashboardSettingsSchema.safeParse(input);
  if (!parsed.success) throw validationError(parsed.error);
  await requireDashboardAccess(dashboardId, "edit");
  const dashboard = await getAppDb().dashboard.update({
    where: { id: dashboardId },
    data: {
      mode: parsed.data.mode ?? undefined,
      defaultDateRange:
        parsed.data.defaultDateRange === undefined
          ? undefined
          : parsed.data.defaultDateRange === null
            ? Prisma.JsonNull
            : jsonInput(parsed.data.defaultDateRange),
      refreshIntervalSeconds:
        parsed.data.refreshIntervalSeconds === undefined
          ? undefined
          : parsed.data.refreshIntervalSeconds,
    } as any,
  });
  return {
    id: dashboard.id,
    mode: toWidgetMode(dashboard.mode),
    defaultDateRange: toDateRange(dashboard.defaultDateRange ?? null),
    refreshIntervalSeconds: dashboard.refreshIntervalSeconds ?? null,
    updatedAt: iso(dashboard.updatedAt),
  };
}

export async function deleteWidget(dashboardId: string, widgetId: string): Promise<void> {
  await requireDashboardAccess(dashboardId, "edit");
  await getAppDb().$transaction(async (tx) => {
    const result = await tx.dashboardWidget.deleteMany({ where: { id: widgetId, dashboardId } });
    if (result.count !== 1) throw resourceNotFound();
    await tx.dashboard.update({ where: { id: dashboardId }, data: { updatedAt: new Date() } });
  });
}

export async function persistWidgetLayouts(dashboardId: string, input: unknown) {
  const parsed = WidgetLayoutBatchSchema.safeParse(input);
  if (!parsed.success) throw validationError(parsed.error);
  await requireDashboardAccess(dashboardId, "edit");
  return getAppDb().$transaction(async (tx) => {
    const existing = await tx.dashboardWidget.count({
      where: { dashboardId, id: { in: parsed.data.widgets.map((widget) => widget.id) } },
    });
    if (existing !== parsed.data.widgets.length) throw resourceNotFound();
    await Promise.all(
      parsed.data.widgets.map((widget) =>
        tx.dashboardWidget.update({
          where: { id: widget.id },
          data: { layout: jsonInput(widget.layout) },
        }),
      ),
    );
    const dashboard = await tx.dashboard.update({
      where: { id: dashboardId },
      data: { updatedAt: new Date() },
    });
    return { id: dashboard.id, updatedAt: iso(dashboard.updatedAt) };
  });
}
