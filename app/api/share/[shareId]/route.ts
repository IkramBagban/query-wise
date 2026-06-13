import { getDashboardByShareId } from "@/app/api/dashboard/store";
import { devLogError } from "@/lib/v2/observability";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  context: { params: Promise<{ shareId: string }> },
) {
  try {
    const { shareId } = await context.params;
    const dashboard = await getDashboardByShareId(shareId);
    if (!dashboard) {
      return Response.json({ error: "Shared dashboard not found" }, { status: 404 });
    }
    return Response.json({ dashboard });
  } catch (error) {
    devLogError("api.legacy-share-get.error", "Legacy shared dashboard API request failed.", error);
    const message =
      error instanceof Error ? error.message : "Failed to load shared dashboard";
    return Response.json({ error: message }, { status: 500 });
  }
}
