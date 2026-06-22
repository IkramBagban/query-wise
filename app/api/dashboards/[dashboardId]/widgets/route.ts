import {
  apiErrorResponse,
  createWidget,
  NO_STORE_HEADERS,
  parseJson,
  persistWidgetLayouts,
} from "@/lib/v2/dashboards";

export const runtime = "nodejs";

type Context = { params: Promise<{ dashboardId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const { dashboardId } = await params;
    return Response.json(
      {
        contractVersion: "querywise.v2",
        data: await createWidget(dashboardId, await parseJson(request)),
      },
      { status: 201, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { dashboardId } = await params;
    return Response.json(
      {
        contractVersion: "querywise.v2",
        data: await persistWidgetLayouts(dashboardId, await parseJson(request)),
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

