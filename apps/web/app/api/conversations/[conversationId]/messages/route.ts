import { listMessages } from "@/lib/conversations";
import { apiError, privateNoStoreHeaders } from "@/lib/query";

export const runtime = "nodejs";

type Context = { params: Promise<{ conversationId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { conversationId } = await context.params;
    const url = new URL(request.url);
    const rawLimit = url.searchParams.get("limit");
    const page = await listMessages({
      conversationId,
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: rawLimit == null ? undefined : Number(rawLimit),
    });
    return Response.json(page, { headers: privateNoStoreHeaders });
  } catch (error) {
    return apiError(error);
  }
}
