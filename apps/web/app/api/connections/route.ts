import { createConnection, createConnectionSchema, listConnections, listConnectionsQuerySchema } from "@/lib/connections";
import { handle, json, parseJson } from "./_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle(async () => {
    const url = new URL(request.url);
    const query = listConnectionsQuerySchema.parse(Object.fromEntries(url.searchParams));
    return json(await listConnections(query));
  });
}

export async function POST(request: Request) {
  return handle(async () => json(await createConnection(await parseJson(request, createConnectionSchema)), 201));
}
