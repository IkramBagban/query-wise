import { cookies } from "next/headers";
import { apiErrorResponse, NO_STORE_HEADERS } from "@/lib/dashboards";
import {
  getPublicDashboard,
  hashShareToken,
  unlockCookieName,
} from "@/lib/sharing";

export const runtime = "nodejs";

type Context = { params: Promise<{ token: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { token } = await params;
    const cookieStore = await cookies();
    const credential = cookieStore.get(unlockCookieName(hashShareToken(token)))?.value;
    return Response.json(await getPublicDashboard(token, credential), {
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

