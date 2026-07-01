import { cancelQueryRun, queryRunDto } from "@/lib/query-runs";
import { apiError, jsonData } from "@/lib/query";

export const runtime = "nodejs";

type Context = { params: Promise<{ queryRunId: string }> };

export async function POST(_request: Request, context: Context) {
  try {
    const { queryRunId } = await context.params;
    return jsonData(queryRunDto(await cancelQueryRun(queryRunId)));
  } catch (error) {
    return apiError(error);
  }
}
