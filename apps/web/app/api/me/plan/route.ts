import { buildPlanUsageDto, requireUserPlan } from "@/lib/plans";
import { apiError, privateNoStoreHeaders } from "@/lib/query/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Current plan, effective limits, and usage snapshot for the signed-in user.
 * Read-only: there is no plan mutation endpoint (Pro is granted server-side only).
 */
export async function GET() {
  try {
    const { plan } = await requireUserPlan();
    const dto = await buildPlanUsageDto(plan);
    return Response.json(dto, { headers: privateNoStoreHeaders });
  } catch (error) {
    return apiError(error);
  }
}
