import { getDashboardById } from "@/app/api/dashboard/store";
import { devLogError } from "@/lib/v2/observability";
import { LEGACY_PRIVATE_HEADERS, requireLegacyUser } from "@/app/api/legacy-security";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireLegacyUser();
  if (auth.error) return auth.error;

  try {
    const { id } = await context.params;
    const dashboard = await getDashboardById(auth.userId, id);
    if (!dashboard) {
      return Response.json({ error: "Dashboard not found" }, { status: 404 });
    }
    return Response.json({ dashboard }, { headers: LEGACY_PRIVATE_HEADERS });
  } catch (error) {
    devLogError("api.legacy-dashboard-get.error", "Legacy dashboard read API request failed.", error);
    const message =
      error instanceof Error ? error.message : "Failed to load dashboard";
    return Response.json({ error: message }, { status: 500 });
  }
}
