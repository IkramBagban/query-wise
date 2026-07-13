import { updateBlockViews } from "@/lib/query-runs";
import { apiError, jsonData } from "@/lib/query";
import { AppError } from "@query-wise/shared/dal/core";

export const runtime = "nodejs";

type Context = { params: Promise<{ queryRunId: string; index: string }> };

/**
 * SPEC-09 §2.1: persist the alternate views for one finalized result block.
 * Owner-only and zod-validated inside `updateBlockViews`; additive JSON update
 * of the run's `resultBlocks[index].views` with the chartConfig mirror enforced.
 */
export async function PATCH(request: Request, { params }: Context) {
  try {
    const { queryRunId, index } = await params;
    const blockIndex = Number(index);
    if (!Number.isInteger(blockIndex) || blockIndex < 0) {
      throw new AppError("VALIDATION_FAILED", "Invalid block index.");
    }
    const body = await request.json().catch(() => null);
    return jsonData(await updateBlockViews(queryRunId, blockIndex, body));
  } catch (error) {
    return apiError(error);
  }
}
