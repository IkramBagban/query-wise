import {
  apiErrorResponse,
  deleteDashboard,
  getDashboard,
  NO_STORE_HEADERS,
  parseJson,
  renameDashboard,
} from "@/lib/dashboards";

export const runtime = "nodejs";

type Context = { params: Promise<{ dashboardId: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { dashboardId } = await params;
    return Response.json(
      { contractVersion: "querywise.v2", data: await getDashboard(dashboardId) },
      { headers: NO_STORE_HEADERS },
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
        data: await renameDashboard(dashboardId, await parseJson(request)),
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { dashboardId } = await params;
    await deleteDashboard(dashboardId);
    return new Response(null, { status: 204, headers: NO_STORE_HEADERS });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

