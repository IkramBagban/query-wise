import { z } from "zod";
import type { NextRequest } from "next/server";

import { upsertDashboard } from "@/app/api/dashboard/store";
import { devLogError } from "@/lib/v2/observability";
import {
  LEGACY_PRIVATE_HEADERS,
  LegacyPayloadTooLargeError,
  readLegacyJson,
  requireLegacyUser,
} from "@/app/api/legacy-security";

export const runtime = "nodejs";

const QueryResultSchema = z.object({
  columns: z.array(z.string().max(255)).max(500),
  rows: z.array(z.record(z.string().max(255), z.unknown())).max(500),
  rowCount: z.number().int().nonnegative().max(500),
  executionTimeMs: z.number().nonnegative(),
});

const ChartConfigSchema = z.object({
  type: z.enum(["bar", "line", "pie", "scatter", "area", "table"]),
  xKey: z.string().max(255).optional(),
  yKey: z.string().max(255).optional(),
  yKeys: z.array(z.string().max(255)).max(20).optional(),
  nameKey: z.string().max(255).optional(),
  valueKey: z.string().max(255).optional(),
  title: z.string().max(200).optional(),
  availableTypes: z.array(
    z.enum(["bar", "line", "pie", "scatter", "area", "table"]),
  ),
});

const DashboardSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(120),
  widgets: z.array(
    z.object({
      id: z.string().min(1).max(200),
      title: z.string().min(1).max(200),
      sql: z.string().min(1).max(100_000),
      result: QueryResultSchema,
      chartConfig: ChartConfigSchema,
      x: z.number(),
      y: z.number(),
      w: z.number(),
      h: z.number(),
    }).strict(),
  ).max(50),
  shareId: z.string().max(200).optional(),
  createdAt: z.number().int().optional(),
  updatedAt: z.number().int().optional(),
}).strict();

const DashboardSaveRequestSchema = z.object({
  dashboard: DashboardSchema,
});

export async function POST(req: NextRequest) {
  const auth = await requireLegacyUser();
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await readLegacyJson(req);
  } catch (error) {
    const tooLarge = error instanceof LegacyPayloadTooLargeError;
    return Response.json(
      { error: tooLarge ? error.message : "Invalid JSON" },
      { status: tooLarge ? 413 : 400, headers: LEGACY_PRIVATE_HEADERS },
    );
  }
  const parsed = DashboardSaveRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const now = Date.now();
    const dashboardInput = {
      ...parsed.data.dashboard,
      createdAt: parsed.data.dashboard.createdAt ?? now,
      updatedAt: parsed.data.dashboard.updatedAt ?? now,
    };
    const dashboard = await upsertDashboard(auth.userId, dashboardInput);
    if (!dashboard) {
      return Response.json(
        { error: "Dashboard not found" },
        { status: 404, headers: LEGACY_PRIVATE_HEADERS },
      );
    }
    return Response.json({ success: true, dashboard }, { headers: LEGACY_PRIVATE_HEADERS });
  } catch (error) {
    devLogError("api.legacy-dashboard-save.error", "Legacy dashboard save API request failed.", error);
    const message =
      error instanceof Error ? error.message : "Failed to save dashboard";
    return Response.json({ error: message }, { status: 500 });
  }
}
