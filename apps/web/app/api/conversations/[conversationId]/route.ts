import { z } from "zod";
import {
  deleteConversation,
  getConversation,
  updateConversation,
} from "@/lib/conversations";
import { apiError, jsonData, privateNoStoreHeaders } from "@/lib/query";
import { AppError } from "@query-wise/shared/dal/core";

export const runtime = "nodejs";

const PatchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  status: z.enum(["active", "archived"]).optional(),
}).strict().refine((value) => value.title != null || value.status != null);

type Context = { params: Promise<{ conversationId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { conversationId } = await context.params;
    return jsonData(await getConversation(conversationId));
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError(new AppError("VALIDATION_FAILED", "Invalid conversation update."));
    const { conversationId } = await context.params;
    return jsonData(await updateConversation(conversationId, parsed.data));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const { conversationId } = await context.params;
    await deleteConversation(conversationId);
    return new Response(null, { status: 204, headers: privateNoStoreHeaders });
  } catch (error) {
    return apiError(error);
  }
}
