import { deleteConnection, getConnection, resourceIdSchema, updateConnection, updateConnectionSchema } from "@/lib/v2/connections";
import { handle, json, parseJson } from "../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ connectionId: string }> };

export async function GET(_request: Request, context: Context) {
  return handle(async () => {
    const { connectionId } = await context.params;
    return json(await getConnection(resourceIdSchema.parse(connectionId)));
  });
}

export async function PATCH(request: Request, context: Context) {
  return handle(async () => {
    const { connectionId } = await context.params;
    return json(await updateConnection(resourceIdSchema.parse(connectionId), await parseJson(request, updateConnectionSchema)));
  });
}

export async function DELETE(_request: Request, context: Context) {
  return handle(async () => {
    const { connectionId } = await context.params;
    await deleteConnection(resourceIdSchema.parse(connectionId));
    return new Response(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
  });
}
