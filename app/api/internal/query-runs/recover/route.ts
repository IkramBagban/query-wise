import { timingSafeEqual } from "node:crypto";
import { recoverStaleQueryRuns } from "@/lib/v2/query-runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || !authorization?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(authorization.slice("Bearer ".length), "utf8");
  const expected = Buffer.from(secret, "utf8");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

async function recover(request: Request): Promise<Response> {
  if (!process.env.CRON_SECRET) {
    return Response.json({ error: "Recovery endpoint is not configured." }, { status: 503 });
  }
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  const result = await recoverStaleQueryRuns();
  return Response.json({ contractVersion: "querywise.v2", data: result });
}

export const GET = recover;
export const POST = recover;
