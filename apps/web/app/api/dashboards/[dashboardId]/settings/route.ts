import {
  apiErrorResponse,
  NO_STORE_HEADERS,
  parseJson,
  updateDashboardSettings,
} from "@/lib/dashboards";

export const runtime = "nodejs";

type Context = { params: Promise<{ dashboardId: string }> };

// SPEC-06 §4.2/§5: persist the dashboard's default date range and auto-refresh
// cadence.
export async function PATCH(request: Request, { params }: Context) {
  try {
    const { dashboardId } = await params;
    const data = await updateDashboardSettings(dashboardId, await parseJson(request));
    return Response.json({ contractVersion: "querywise.v2", data }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
