import { idempotencySchema, resourceIdSchema, testSavedConnection } from "@/lib/v2/connections";
import { handle, json, parseJson } from "../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ connectionId: string }> };

export async function POST(request: Request, context: Context) {
  return handle(async () => {
    const { connectionId } = await context.params;
    const { idempotencyKey } = await parseJson(request, idempotencySchema);
    return json(await testSavedConnection(resourceIdSchema.parse(connectionId), idempotencyKey));
  });
}
