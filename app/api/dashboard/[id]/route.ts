import { requireAuth } from "@/lib/auth";
import { getDashboardById } from "@/app/api/dashboard/store";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  // Auth disabled - uncomment to re-enable authentication
  // const authError = await requireAuth();
  // if (authError) return authError;

  try {
    const { id } = await context.params;
    const dashboard = await getDashboardById(id);
    if (!dashboard) {
      return Response.json({ error: "Dashboard not found" }, { status: 404 });
    }
    return Response.json({ dashboard });
  } catch (error) {
    console.error("[api/dashboard/:id GET]", error);
    const message =
      error instanceof Error ? error.message : "Failed to load dashboard";
    return Response.json({ error: message }, { status: 500 });
  }
}

