import { resourceIdSchema } from "@/lib/v2/connections";
import { getLatestConnectionSchema } from "@/lib/v2/schema";
import { handle, json } from "../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ connectionId: string }> };

export async function GET(_request: Request, context: Context) {
  return handle(async () => {
    const { connectionId } = await context.params;
    return json(await getLatestConnectionSchema(resourceIdSchema.parse(connectionId)));
  });
}
