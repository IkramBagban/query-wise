import type { ConnectResponse } from "@/types";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { devLogError } from "@/lib/v2/observability";
import { getDataSourceAdapter } from "@/lib/v2/data-sources";
import { AppError } from "@/lib/v2/dal/core";
import { LEGACY_PRIVATE_HEADERS, requireLegacyUser } from "@/app/api/legacy-security";

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
  const auth = await requireLegacyUser();
  if (auth.error) return auth.error;

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

    const targetConnectionString = payload.type === "demo"
      ? process.env.DEMO_DATABASE_URL
      : payload.connectionString;
    if (!targetConnectionString) {
      return Response.json(
        { error: "Database connection is not configured." },
        { status: 503, headers: LEGACY_PRIVATE_HEADERS },
      );
    }
    const tested = await getDataSourceAdapter("postgresql").testConnection({
      connectionString: targetConnectionString,
    });

    if (!tested.success) {
      const response: ConnectResponse = {
        success: false,
        name: payload.type === "demo" ? "QueryWise Demo (Ecommerce)" : "Custom PostgreSQL",
        error: tested.errorCode ?? "Failed to connect",
      };
      return Response.json(response, { status: 400, headers: LEGACY_PRIVATE_HEADERS });
    }

    const name =
      payload.type === "demo"
        ? "QueryWise Demo (Ecommerce)"
        : deriveDatabaseName(payload.connectionString);

    // Track database connection in Vercel Analytics
    try {
      const { track } = await import("@vercel/analytics/server");
      track("database_connected", {
        type: payload.type,
      });
    } catch {
      // Analytics tracking is optional
    }

    const response: ConnectResponse = { success: true, name };
    return Response.json(response, { headers: LEGACY_PRIVATE_HEADERS });
  } catch (error) {
    devLogError("api.legacy-connect.error", "Legacy connection API request failed.", error);
    const status = error instanceof AppError && error.code === "DATA_SOURCE_TARGET_BLOCKED" ? 422 : 400;
    return Response.json(
      { error: error instanceof AppError ? error.message : "Connection test failed." },
      { status, headers: LEGACY_PRIVATE_HEADERS },
    );
  }
}
