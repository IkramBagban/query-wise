import "server-only";

import { Prisma, type Dashboard, type DashboardWidget } from "@prisma/client";
import { getAppDb } from "@/lib/v2/app-db";
import { requireUser } from "@/lib/v2/auth";
import { requireDashboardAccess } from "@/lib/v2/dal/authorization";
import {
  AppError,
  decodeCursor,
  encodeCursor,
  normalizePageLimit,
  resourceNotFound,
} from "@/lib/v2/dal/core";
import { createResourceId } from "@/lib/v2/domain";
import type {
  DashboardOwnerDto,
  DashboardViewerDto,
  JsonValue,
} from "@/types/v2";
import {
  DashboardNameSchema,
  WidgetCreateSchema,
  WidgetLayoutBatchSchema,
  WidgetUpdateSchema,
} from "./schemas";
import { validationError } from "./http";

const DASHBOARD_LIST_ENDPOINT = "dashboards";
const MAX_WIDGETS = 50;

type DashboardListRow = Dashboard & { access: "owner" | "viewer" };
type DashboardDto = DashboardOwnerDto | DashboardViewerDto;

function jsonInput(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function iso(value: Date): string {
  return value.toISOString();
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

  if (dashboard.ownerUserId === userId) {
    return {
      contractVersion: "querywise.v2",
      id: dashboard.id,
      name: dashboard.name,
      access: "owner",
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
    widgets: widgets.map(viewerWidget),
    createdAt: iso(dashboard.createdAt),
    updatedAt: iso(dashboard.updatedAt),
  };
}

export async function listDashboards(input: { cursor?: string; limit?: number }) {
  const { userId } = await requireUser();
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
      dashboard.deleted_at AS "deletedAt",
      dashboard.created_at AS "createdAt",
      dashboard.updated_at AS "updatedAt",
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
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
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
  const parsed = DashboardNameSchema.safeParse((input as { name?: unknown })?.name);
  if (!parsed.success) throw validationError(parsed.error);
  const { userId } = await requireUser();
  const dashboard = await getAppDb().dashboard.create({
    data: { id: createResourceId(), ownerUserId: userId, name: parsed.data },
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
  await requireDashboardAccess(dashboardId, "edit");
  await getAppDb().dashboard.update({
    where: { id: dashboardId },
    data: { deletedAt: new Date() },
  });
}

export async function createWidget(dashboardId: string, input: unknown) {
  const parsed = WidgetCreateSchema.safeParse(input);
  if (!parsed.success) throw validationError(parsed.error);
  await requireDashboardAccess(dashboardId, "edit");
  return getAppDb().$transaction(async (tx) => {
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
        queryDefinition: parsed.data.queryDefinition
          ? jsonInput(parsed.data.queryDefinition)
          : Prisma.JsonNull,
      },
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
  await requireDashboardAccess(dashboardId, "edit");
  return getAppDb().$transaction(async (tx) => {
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
