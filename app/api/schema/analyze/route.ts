import type { NextRequest } from "next/server";
import { z } from "zod";

import { requireAuth } from "@/lib/auth";
import { generateSchemaAnalysis } from "@/lib/llm/index";
import { LLM_PROVIDER_IDS } from "@/lib/llm-config";
import type { SchemaAnalysisResponse } from "@/types";

const ColumnSchema = z.object({
  name: z.string(),
  type: z.string(),
  fullType: z.string().optional(),
  nullable: z.boolean(),
  isPrimaryKey: z.boolean(),
  isForeignKey: z.boolean(),
  references: z.object({ table: z.string(), column: z.string() }).optional(),
  defaultValue: z.string().nullable().optional(),
  enumValues: z.array(z.string()).optional(),
  range: z.object({ min: z.string(), max: z.string() }).optional(),
  topValues: z.array(z.object({ value: z.string(), count: z.number() })).optional(),
});

const SchemaPayload = z.object({
  tables: z.array(
    z.object({
      name: z.string(),
      columns: z.array(ColumnSchema),
      rowCount: z.number().optional(),
      sampleData: z.array(z.record(z.string(), z.unknown())).optional(),
    }),
  ),
  relationships: z.array(
    z.object({
      fromTable: z.string(),
      fromColumn: z.string(),
      toTable: z.string(),
      toColumn: z.string(),
    }),
  ),
  summary: z.string(),
});

const SchemaAnalyzeRequestSchema = z.object({
  schema: SchemaPayload,
  provider: z.enum(LLM_PROVIDER_IDS),
  model: z.string().trim().min(1).max(120),
  apiKey: z.string().trim().min(1),
});

export async function POST(req: NextRequest): Promise<Response> {
  // Auth disabled - uncomment to re-enable authentication
  // const authError = await requireAuth();
  // if (authError) {
  //   return authError;
  // }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = SchemaAnalyzeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.message },
      { status: 400 },
    );
  }

  try {
    const analysis = await generateSchemaAnalysis({
      schema: parsed.data.schema,
      provider: parsed.data.provider,
      model: parsed.data.model,
      apiKey: parsed.data.apiKey,
    });

    const response: SchemaAnalysisResponse = { analysis };
    return Response.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    console.error("[api/schema/analyze]", error);
    return Response.json(
      { error: "Failed to analyze schema", details: message },
      { status: 500 },
    );
  }
}

