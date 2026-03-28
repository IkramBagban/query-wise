import { requireAuth } from "@/lib/auth";
import { introspectSchema } from "@/lib/schema";
import type { SchemaResponse } from "@/types";
import type { NextRequest } from "next/server";
import { z } from "zod";

const SchemaRequestSchema = z.object({
  connectionString: z.string().optional(),
});

function isPostgresUrl(value: string): boolean {
  return value.startsWith("postgresql://") || value.startsWith("postgres://");
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

  const parsed = SchemaRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.message },
      { status: 400 }
    );
  }

  if (
    parsed.data.connectionString &&
    !isPostgresUrl(parsed.data.connectionString)
  ) {
    return Response.json(
      { error: "Invalid connection string. Use postgres:// or postgresql://" },
      { status: 400 }
    );
  }

  try {
    const schema = await introspectSchema(parsed.data.connectionString);
    const response: SchemaResponse = { schema };
    return Response.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    console.error("[api/schema]", error);
    return Response.json(
      { error: "Failed to introspect schema", details: message },
      { status: 500 }
    );
  }
}
