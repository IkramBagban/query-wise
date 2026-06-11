import { idempotencySchema, resourceIdSchema } from "@/lib/v2/connections";
import { refreshConnectionSchema } from "@/lib/v2/schema";
import { handle, json, parseJson } from "../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ connectionId: string }> };

export async function POST(request: Request, context: Context) {
  return handle(async () => {
    const { connectionId } = await context.params;
    await parseJson(request, idempotencySchema);
    return json(await refreshConnectionSchema(resourceIdSchema.parse(connectionId)), 202);
  });
}
