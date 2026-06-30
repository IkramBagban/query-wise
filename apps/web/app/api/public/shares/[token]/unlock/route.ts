import { cookies } from "next/headers";
import {
  apiErrorResponse,
  NO_STORE_HEADERS,
  parseJson,
} from "@/lib/dashboards";
import {
  createUnlockCredential,
  hashShareToken,
  unlockCookieName,
  unlockShare,
} from "@/lib/sharing";

export const runtime = "nodejs";

type Context = { params: Promise<{ token: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const { token } = await params;
    const body = (await parseJson(request)) as { password?: unknown };
    const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const attemptScope = forwardedFor || "unknown-client";
    const share = await unlockShare(token, body?.password, attemptScope);
    const credential = createUnlockCredential(share.id, share.version);
    const cookieStore = await cookies();
    cookieStore.set(unlockCookieName(hashShareToken(token)), credential.value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: `/api/public/shares/${encodeURIComponent(token)}`,
      maxAge: credential.maxAge,
    });
    return Response.json(
      { contractVersion: "querywise.v2", data: { unlocked: true } },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

