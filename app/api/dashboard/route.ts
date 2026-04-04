import { z } from "zod";
import type { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { upsertDashboard } from "@/app/api/dashboard/store";

export const runtime = "nodejs";

const QueryResultSchema = z.object({
  columns: z.array(z.string()),
  rows: z.array(z.record(z.string(), z.unknown())),
  rowCount: z.number().int().nonnegative(),
  executionTimeMs: z.number().nonnegative(),
});

const ChartConfigSchema = z.object({
  type: z.enum(["bar", "line", "pie", "scatter", "area", "table"]),
  xKey: z.string().optional(),
  yKey: z.string().optional(),
  yKeys: z.array(z.string()).optional(),
  nameKey: z.string().optional(),
  valueKey: z.string().optional(),
  title: z.string().optional(),
  availableTypes: z.array(
    z.enum(["bar", "line", "pie", "scatter", "area", "table"]),
  ),
});

const DashboardSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  widgets: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      sql: z.string().min(1),
      result: QueryResultSchema,
      chartConfig: ChartConfigSchema,
      x: z.number(),
      y: z.number(),
      w: z.number(),
      h: z.number(),
    }),
  ),
  shareId: z.string().optional(),
  createdAt: z.number().int().optional(),
  updatedAt: z.number().int().optional(),
});

const DashboardSaveRequestSchema = z.object({
  dashboard: DashboardSchema,
});

export async function POST(req: NextRequest) {
  // Auth disabled - uncomment to re-enable authentication
  // const authError = await requireAuth();
  // if (authError) return authError;

  const body = await req.json().catch(() => null);
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
    const dashboard = await upsertDashboard(dashboardInput);
    return Response.json({ success: true, dashboard });
  } catch (error) {
    console.error("[api/dashboard POST]", error);
    const message =
      error instanceof Error ? error.message : "Failed to save dashboard";
    return Response.json({ error: message }, { status: 500 });
  }
}
