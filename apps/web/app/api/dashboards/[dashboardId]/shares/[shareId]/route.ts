import {
  apiErrorResponse,
  NO_STORE_HEADERS,
  parseJson,
} from "@/lib/dashboards";
import { revokeShare, updateShareLink } from "@/lib/sharing";

export const runtime = "nodejs";

type Context = { params: Promise<{ dashboardId: string; shareId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { dashboardId, shareId } = await params;
    return Response.json(
      {
        contractVersion: "querywise.v2",
        data: await updateShareLink(dashboardId, shareId, await parseJson(request)),
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { dashboardId, shareId } = await params;
    await revokeShare(dashboardId, shareId);
    return new Response(null, { status: 204, headers: NO_STORE_HEADERS });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
