import { z } from "zod";
import { acceptQuerySubmission, queryRunDto } from "@/lib/v2/query-runs";
import { apiError, executeDurableQueryRun, jsonData, querySseResponse } from "@/lib/v2/query";
import { AppError } from "@/lib/v2/dal/core";
import { SUPPORTED_MODELS_BY_PROVIDER } from "@/lib/llm-config";

export const runtime = "nodejs";

const SubmitQuerySchema = z.object({
  conversationId: z.string().uuid(),
  question: z.string().trim().min(1).max(500),
  provider: z.enum(["google", "anthropic"]),
  model: z.string().trim().min(1).max(120),
  apiKey: z.string().trim().min(1).refine(
    (value) => !/^[A-Z][A-Z0-9_]*=/.test(value),
    "Provide only the API key value, not an environment variable assignment.",
  ),
  idempotencyKey: z.string().uuid(),
}).strict().superRefine((value, context) => {
  if (!SUPPORTED_MODELS_BY_PROVIDER[value.provider].includes(value.model)) {
    context.addIssue({
      code: "custom",
      path: ["model"],
      message: `Unsupported ${value.provider} model.`,
    });
  }
});

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

    if (wantsSse) {
      console.log( "SSE query run started", { queryRunId: accepted.run.id });
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
