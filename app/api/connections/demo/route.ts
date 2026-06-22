import { createDemoConnection } from "@/lib/v2/connections";
import { handle, json } from "../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return handle(async () => json(await createDemoConnection(), 201));
}
