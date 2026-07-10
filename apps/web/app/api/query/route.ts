import { z } from "zod";
import { acceptQuerySubmission, queryRunDto } from "@/lib/query-runs";
import { apiError, executeDurableQueryRun, jsonData, querySseResponse } from "@/lib/query";
import { AppError } from "@query-wise/shared/dal/core";
import { devLog } from "@query-wise/shared/observability";

export const runtime = "nodejs";

const SubmitQuerySchema = z.object({
  conversationId: z.string().uuid(),
  question: z.string().trim().min(1).max(2000),
  idempotencyKey: z.string().uuid(),
}).strict();

export async function POST(request: Request) {
  try {
    const parsed = SubmitQuerySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return apiError(
        new AppError(
          "VALIDATION_FAILED",
          parsed.error.issues[0]?.message ?? "Invalid query request.",
        ),
      );
    }
    // Persist the user message and durable run before starting expensive LLM/SQL
    // work. Network retries receive the existing run and must not execute it twice.
    const accepted = await acceptQuerySubmission(parsed.data);
    const wantsSse = request.headers.get("accept")?.includes("text/event-stream");
    if (!accepted.created) return jsonData(queryRunDto(accepted.run), 200);

    devLog("info", "query_run_started", "SSE query run started", { queryRunId: accepted.run.id, wantsSse });
    if (wantsSse) {
      console.log("SSE query run started", { queryRunId: accepted.run.id });
      return querySseResponse(accepted.run.id, async (emit) => {
        await executeDurableQueryRun({
          queryRunId: accepted.run.id,
          question: parsed.data.question,
          emit,
        });
      });
    }

    const run = await executeDurableQueryRun({
      queryRunId: accepted.run.id,
      question: parsed.data.question,
    });
    return jsonData(queryRunDto(run), 200);
  } catch (error) {
    return apiError(error);
  }
}
