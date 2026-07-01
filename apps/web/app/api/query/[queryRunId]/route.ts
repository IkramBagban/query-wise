import { getOwnedQueryRun, queryRunDto } from "@/lib/query-runs";
import { apiError, jsonData } from "@/lib/query";

export const runtime = "nodejs";

type Context = { params: Promise<{ queryRunId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { queryRunId } = await context.params;
    return jsonData(queryRunDto(await getOwnedQueryRun(queryRunId)));
  } catch (error) {
    return apiError(error);
  }
}
