import type { ConnectResponse } from "@/types";
import { requireAuth } from "@/lib/auth";
import { testConnection } from "@/lib/db";
import type { NextRequest } from "next/server";
import { z } from "zod";

const ConnectRequestSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("demo"),
    connectionString: z.string().optional(),
  }),
  z.object({
    type: z.literal("custom"),
    connectionString: z.string().min(1),
  }),
]);

function isPostgresUrl(value: string): boolean {
  return value.startsWith("postgresql://") || value.startsWith("postgres://");
}

function deriveDatabaseName(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    const dbName = url.pathname.replace(/^\/+/, "").split("/")[0];
    return dbName || "Custom PostgreSQL";
  } catch {
    return "Custom PostgreSQL";
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const authError = await requireAuth();
  if (authError) {
    return authError;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = ConnectRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.message },
      { status: 400 }
    );
  }

  try {
    const payload = parsed.data;

    if (payload.type === "custom" && !isPostgresUrl(payload.connectionString)) {
      return Response.json(
        { error: "Invalid connection string. Use postgres:// or postgresql://" },
        { status: 400 }
      );
    }

    const targetConnectionString =
      payload.type === "demo" ? undefined : payload.connectionString;
    const tested = await testConnection(targetConnectionString);

    if (!tested.success) {
      const response: ConnectResponse = {
        success: false,
        name: payload.type === "demo" ? "QueryWise Demo (Ecommerce)" : "Custom PostgreSQL",
        error: tested.error ?? "Failed to connect",
      };
      return Response.json(response, { status: 400 });
    }

    const name =
      payload.type === "demo"
        ? "QueryWise Demo (Ecommerce)"
        : deriveDatabaseName(payload.connectionString);

    const response: ConnectResponse = { success: true, name };
    return Response.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    console.error("[api/connect]", error);
    return Response.json({ error: message }, { status: 500 });
  }
}
