import { LEGACY_PRIVATE_HEADERS, requireLegacyUser } from "@/app/api/legacy-security";

export async function POST(): Promise<Response> {
  const auth = await requireLegacyUser();
  if (auth.error) return auth.error;

  // Raw credentials are no longer accepted at this boundary; saved connection
  // schema APIs enforce ownership and the public-network policy.
  return Response.json(
    { error: "This endpoint is retired. Use /api/connections/:connectionId/schema." },
    { status: 410, headers: LEGACY_PRIVATE_HEADERS },
  );
}
