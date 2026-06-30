import { generateText } from "ai";
import type { SchemaInfo } from "@/types";
import { getModel, type Provider, withModelFallback } from "./client";
import { buildStructuredTableContext } from "./prompts";

interface GenerateSchemaAnalysisParams {
  schema: SchemaInfo;
  provider: Provider;
  model: string;
  apiKey: string;
}

interface ValidateModelAccessParams {
  provider: Provider;
  model: string;
  apiKey: string;
}

export interface ExecuteQueryToolResult {
  sql: string;
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTimeMs: number;
}

export async function validateModelAccess(
  params: ValidateModelAccessParams,
): Promise<void> {
  await withModelFallback({
    provider: params.provider,
    model: params.model,
    execute: async (candidateModel) =>
      generateText({
        model: getModel(params.provider, candidateModel, params.apiKey),
        system: "You are a health check assistant. Reply with exactly: OK",
        prompt: "Respond with OK.",
        maxOutputTokens: 10,
        temperature: 0,
      }),
  });
}

export async function generateSchemaAnalysis(
  params: GenerateSchemaAnalysisParams,
): Promise<string> {
  const system = `
You are a principal analytics engineer writing concise, human-readable schema summaries for business users.

Your job is to explain:
- what the database appears to represent,
- what the main entities are,
- how they relate to each other,
- and what kinds of analysis the schema can support.

Use only the information explicitly provided in the schema context.
Do not invent business trends, KPI results, customer behavior patterns, seasonality, or performance insights.
If the schema alone is insufficient to support a claim, describe what the schema enables rather than asserting an observed finding.
Write for a smart non-technical stakeholder who is seeing this database for the first time.
`.trim();

  const prompt = [
    "Analyze this PostgreSQL schema for a non-technical BI user.",
    "",
    "Goal:",
    "- Produce a clear, polished, business-friendly schema summary.",
    "- Help the reader quickly understand what this database is for and how it can be used.",
    "",
    "Output requirements:",
    "- Use Markdown headings and bullet points only. No tables.",
    "- Use exactly these headings in this order:",
    "  1) ### Business Context",
    "  2) ### Core Entities",
    "  3) ### Key Relationships",
    "  4) ### Analytical Opportunities",
    "- Under each heading, write 2-4 short bullet points.",
    "- Use plain business language that a non-technical stakeholder can understand.",
    "- Prefer meaning and purpose over technical jargon.",
    "- Keep the tone polished, concise, natural, and human-readable.",
    "- Avoid raw column-name phrasing unless necessary.",
    "- Do not mention SQL, schemas, joins, or data types unless directly helpful.",
    "",
    "Grounding rules:",
    "- Base every statement only on the provided schema summary, relationships, sample values, and metadata.",
    "- Do not claim observed business trends or performance outcomes unless they are explicitly supported by the provided context.",
    "- Do not invent metrics, percentages, seasonality, customer behavior patterns, or revenue conclusions.",
    "- If evidence is limited, say what the schema enables analysis of, not what the data proves.",
    "- In 'Analytical Opportunities', mention only analyses directly supported by the tables, columns, relationships, and provided metadata.",
    "- If uncertainty is important, include one short final note only in this format: '_Note: ..._'",
    "",
    "Schema summary:",
    params.schema.summary,
    "",
    "Structured table details:",
    buildStructuredTableContext(params.schema),
  ].join("\n");

  const { text } = await withModelFallback({
    provider: params.provider,
    model: params.model,
    execute: async (candidateModel) =>
      generateText({
        model: getModel(params.provider, candidateModel, params.apiKey),
        system,
        prompt,
        // maxOutputTokens: 480,
        temperature: 0.15,
      }),
  });

  return text.trim();
}
