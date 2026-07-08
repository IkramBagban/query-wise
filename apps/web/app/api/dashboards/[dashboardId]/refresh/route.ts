import {
  apiErrorResponse,
  NO_STORE_HEADERS,
  parseJson,
  refreshDashboard,
  validationError,
  WidgetRefreshSchema,
} from "@/lib/dashboards";

export const runtime = "nodejs";

type Context = { params: Promise<{ dashboardId: string }> };

// SPEC-06 §4.1: "Refresh all" — re-runs every live widget concurrently (bounded
// pool) and returns per-widget results so the grid can update widget-by-widget.
export async function POST(request: Request, { params }: Context) {
  try {
    const { dashboardId } = await params;
    const body = await parseJson(request).catch(() => ({}));
    const parsed = WidgetRefreshSchema.safeParse(body ?? {});
    if (!parsed.success) throw validationError(parsed.error);
    const widgets = await refreshDashboard(dashboardId, {
      range: parsed.data.range ?? null,
      force: parsed.data.force ?? true,
    });
    return Response.json(
      { contractVersion: "querywise.v2", dashboardId, widgets },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
