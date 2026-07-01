import { z } from "zod";
import {
  apiErrorResponse,
  createDashboard,
  listDashboards,
  NO_STORE_HEADERS,
  parseJson,
  validationError,
} from "@/lib/dashboards";

export const runtime = "nodejs";

const QuerySchema = z.object({
  cursor: z.string().max(4096).optional(),
  limit: z.coerce.number().int().optional(),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = QuerySchema.safeParse({
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    if (!parsed.success) throw validationError(parsed.error);
    return Response.json(await listDashboards(parsed.data), { headers: NO_STORE_HEADERS });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const dashboard = await createDashboard(await parseJson(request));
    return Response.json(
      { contractVersion: "querywise.v2", data: dashboard },
      { status: 201, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

