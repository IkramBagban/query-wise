import { z } from "zod";
import type { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { LLM_PROVIDER_IDS } from "@/lib/llm-config";
import { validateModelAccess } from "@/lib/llm/index";

const LlmTestRequestSchema = z.object({
  provider: z.enum(LLM_PROVIDER_IDS),
  model: z.string().trim().min(1).max(120),
  apiKey: z.string().trim().min(1),
});

export async function POST(req: NextRequest): Promise<Response> {
  // Auth disabled - uncomment to re-enable authentication
  // const authError = await requireAuth();
  // if (authError) return authError;

  const body = await req.json().catch(() => null);
  const parsed = LlmTestRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    await validateModelAccess(parsed.data);
    return Response.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provider call failed";
    return Response.json({ error: message }, { status: 400 });
  }
}
