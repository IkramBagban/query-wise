import {
  apiErrorResponse,
  NO_STORE_HEADERS,
  parseJson,
} from "@/lib/dashboards";
import { createShare, listShares } from "@/lib/sharing";

export const runtime = "nodejs";

type Context = { params: Promise<{ dashboardId: string }> };

function requestOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (configured) return configured.startsWith("http") ? configured : `https://${configured}`;
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`;
  return new URL(request.url).origin;
}

export async function GET(request: Request, { params }: Context) {
  try {
    const { dashboardId } = await params;
    return Response.json(
      { contractVersion: "querywise.v2", data: await listShares(dashboardId, requestOrigin(request)) },
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
        data: await createShare(dashboardId, await parseJson(request), requestOrigin(request)),
      },
      { status: 201, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
