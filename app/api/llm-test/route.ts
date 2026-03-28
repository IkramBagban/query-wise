import { z } from "zod";
import type { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { validateModelAccess } from "@/lib/llm";

const LlmTestRequestSchema = z.object({
  provider: z.enum(["google", "anthropic"]),
  model: z.string().trim().min(1).max(120),
  apiKey: z.string().trim().min(1),
});

export async function POST(req: NextRequest): Promise<Response> {
  const authError = await requireAuth();
  if (authError) return authError;

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

