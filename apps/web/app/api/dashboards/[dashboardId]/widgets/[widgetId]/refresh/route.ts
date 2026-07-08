import {
  apiErrorResponse,
  NO_STORE_HEADERS,
  parseJson,
  refreshWidget,
  validationError,
  WidgetRefreshSchema,
} from "@/lib/dashboards";

export const runtime = "nodejs";

type Context = { params: Promise<{ dashboardId: string; widgetId: string }> };

// SPEC-06 §4.1: single-widget refresh — re-executes the widget's stored query
// through the read-only validate→execute runtime and returns the fresh preview.
export async function POST(request: Request, { params }: Context) {
  try {
    const { dashboardId, widgetId } = await params;
    const body = await parseJson(request).catch(() => ({}));
    const parsed = WidgetRefreshSchema.safeParse(body ?? {});
    if (!parsed.success) throw validationError(parsed.error);
    const data = await refreshWidget(dashboardId, widgetId, {
      range: parsed.data.range ?? null,
      force: parsed.data.force ?? true,
    });
    return Response.json({ contractVersion: "querywise.v2", data }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
