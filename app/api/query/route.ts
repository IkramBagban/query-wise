import { z } from "zod";
import { acceptQuerySubmission, queryRunDto } from "@/lib/v2/query-runs";
import { apiError, executeDurableQueryRun, jsonData, querySseResponse } from "@/lib/v2/query";
import { AppError } from "@/lib/v2/dal/core";

export const runtime = "nodejs";

const SubmitQuerySchema = z.object({
  conversationId: z.string().uuid(),
  question: z.string().trim().min(1).max(500),
  provider: z.enum(["google", "anthropic"]),
  model: z.string().trim().min(1).max(120),
  apiKey: z.string().trim().min(1),
  idempotencyKey: z.string().uuid(),
}).strict();

export async function POST(request: Request) {
  try {
    const parsed = SubmitQuerySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError(new AppError("VALIDATION_FAILED", "Invalid query request."));
    const accepted = await acceptQuerySubmission(parsed.data);
    const wantsSse = request.headers.get("accept")?.includes("text/event-stream");
    if (!accepted.created) return jsonData(queryRunDto(accepted.run), 200);

    if (wantsSse) {
      return querySseResponse(accepted.run.id, async (emit) => {
        await executeDurableQueryRun({
          queryRunId: accepted.run.id,
          question: parsed.data.question,
          provider: parsed.data.provider,
          model: parsed.data.model,
          apiKey: parsed.data.apiKey,
          emit,
        });
      });
    }

    const run = await executeDurableQueryRun({
      queryRunId: accepted.run.id,
      question: parsed.data.question,
      provider: parsed.data.provider,
      model: parsed.data.model,
      apiKey: parsed.data.apiKey,
    });
    return jsonData(queryRunDto(run), 200);
  } catch (error) {
    return apiError(error);
  }
}
