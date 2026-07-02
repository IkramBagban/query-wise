import { z } from "zod";
import { testDraftConnection } from "@/lib/connections";
import { handle, json, parseJson } from "../connections/_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const connectRequestSchema = z.object({
  type: z.enum(["demo", "custom"]),
  connectionString: z.string().trim().min(1).max(4096).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.type === "custom" && !value.connectionString) {
    ctx.addIssue({
      code: "custom",
      message: "connectionString is required for custom connections.",
      path: ["connectionString"],
    });
  }
});

export async function POST(request: Request) {
  return handle(async () => {
    const body = await parseJson(request, connectRequestSchema);
    if (body.type === "demo") {
      const demoUrl = process.env.DEMO_DATABASE_URL;
      if (!demoUrl) {
        return json({ success: false, error: "Demo database is not configured." });
      }
      const result = await testDraftConnection(demoUrl);
      return json({ ...result, name: result.name ?? "QueryWise Demo" });
    }

    const result = await testDraftConnection(body.connectionString!);
    return json(result);
  });
}