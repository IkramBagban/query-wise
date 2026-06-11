import {
  apiErrorResponse,
  NO_STORE_HEADERS,
  parseJson,
} from "@/lib/v2/dashboards";
import { createShare, listShares } from "@/lib/v2/sharing";

export const runtime = "nodejs";

type Context = { params: Promise<{ dashboardId: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { dashboardId } = await params;
    return Response.json(
      { contractVersion: "querywise.v2", data: await listShares(dashboardId) },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const { dashboardId } = await params;
    return Response.json(
      {
        contractVersion: "querywise.v2",
        data: await createShare(dashboardId, await parseJson(request)),
      },
      { status: 201, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

