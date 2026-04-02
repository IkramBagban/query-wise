import type { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { logEvent } from "@/lib/logger";
import { QueryRequestSchema } from "./_lib/contracts";
import { executeQueryFlow } from "./_lib/execute-query-flow";
import { sseResponse } from "./_lib/sse";
import { toUserFriendlyMessage } from "./_lib/error-mapping";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  const body = await req.json().catch(() => null);
  const parsed = QueryRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const wantsSse = req.headers.get("accept")?.includes("text/event-stream");

  if (wantsSse) {
    return sseResponse(async (emit) => {
      try {
        const response = await executeQueryFlow(parsed.data, emit);
        emit("final", response);
      } catch (error) {
        logEvent({
          type: "ERROR",
          timestamp: new Date().toISOString(),
          message: error instanceof Error ? error.message : String(error),
          meta: { stack: error instanceof Error ? error.stack : undefined },
        });
        throw error;
      }
    });
  }

  try {
    const response = await executeQueryFlow(parsed.data);
    return Response.json(response);
  } catch (error) {
    logEvent({
      type: "ERROR",
      timestamp: new Date().toISOString(),
      message: error instanceof Error ? error.message : String(error),
      meta: { stack: error instanceof Error ? error.stack : undefined },
    });
    console.error("[api/query]", error);
    return Response.json(
      { error: toUserFriendlyMessage(error) },
      { status: 500 },
    );
  }
}
