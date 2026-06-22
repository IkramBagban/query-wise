import { z } from "zod";
import { createConversation, listConversations } from "@/lib/v2/conversations";
import { apiError, jsonData, privateNoStoreHeaders } from "@/lib/v2/query";
import { AppError } from "@/lib/v2/dal/core";

export const runtime = "nodejs";

const CreateSchema = z.object({
  connectionId: z.string().uuid(),
  title: z.string().trim().min(1).max(120).optional(),
}).strict();

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const rawLimit = url.searchParams.get("limit");
    const status = url.searchParams.get("status");
    const page = await listConversations({
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: rawLimit == null ? undefined : Number(rawLimit),
      status: status === "active" || status === "archived" ? status : undefined,
    });
    return Response.json(page, { headers: privateNoStoreHeaders });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const parsed = CreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError(new AppError("VALIDATION_FAILED", "Invalid conversation request."));
    return jsonData(await createConversation(parsed.data.connectionId, parsed.data.title), 201);
  } catch (error) {
    return apiError(error);
  }
}
