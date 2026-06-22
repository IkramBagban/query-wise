import { z } from "zod";
import type { NextRequest } from "next/server";

import { createOrGetShareId } from "@/app/api/dashboard/store";
import { devLogError } from "@/lib/v2/observability";
import type { ShareResponse } from "@/types";
import { LEGACY_PRIVATE_HEADERS, requireLegacyUser } from "@/app/api/legacy-security";

export const runtime = "nodejs";

const ShareRequestSchema = z.object({
  dashboardId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const auth = await requireLegacyUser();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = ShareRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const shared = await createOrGetShareId(auth.userId, parsed.data.dashboardId);
    if (!shared) {
      return Response.json({ error: "Dashboard not found" }, { status: 404 });
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
    const response: ShareResponse = {
      shareId: shared.shareId,
      url: `${baseUrl}/share/${shared.shareId}`,
    };
    return Response.json(response, { headers: LEGACY_PRIVATE_HEADERS });
  } catch (error) {
    devLogError("api.legacy-share-create.error", "Legacy share creation API request failed.", error);
    const message =
      error instanceof Error ? error.message : "Failed to create share link";
    return Response.json({ error: message }, { status: 500 });
  }
}
