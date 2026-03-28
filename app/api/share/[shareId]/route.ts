import { getDashboardByShareId } from "@/app/api/dashboard/store";

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
    console.error("[api/share/:shareId GET]", error);
    const message =
      error instanceof Error ? error.message : "Failed to load shared dashboard";
    return Response.json({ error: message }, { status: 500 });
  }
}

