import {
  apiErrorResponse,
  deleteWidget,
  NO_STORE_HEADERS,
  parseJson,
  updateWidget,
} from "@/lib/dashboards";

export const runtime = "nodejs";

type Context = { params: Promise<{ dashboardId: string; widgetId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { dashboardId, widgetId } = await params;
    return Response.json(
      {
        contractVersion: "querywise.v2",
        data: await updateWidget(dashboardId, widgetId, await parseJson(request)),
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { dashboardId, widgetId } = await params;
    await deleteWidget(dashboardId, widgetId);
    return new Response(null, { status: 204, headers: NO_STORE_HEADERS });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

