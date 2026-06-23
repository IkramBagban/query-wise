import type { BoundedQueryResult } from "@/types/v2";
import type { ColumnPruning } from "./schemas";
import type { TableCandidate } from "./schema-context";
import { formatCandidatesForPrompt, formatSkinnySchemaForPrompt } from "./schema-context";
import type { SchemaInfo } from "@/types";

export const STRUCTURED_PIPELINE_SYSTEM = [
  "You are a production text-to-SQL pipeline component for PostgreSQL.",
  "Use only the supplied schema context.",
  "Return structured output matching the requested schema.",
  "Do not invent tables, columns, relationships, or result values.",
].join("\n");

export function rewritePrompt(params: { question: string; history: string }): string {
  return [
    "Rewrite the latest user question into a standalone analytics question.",
    "If the user is not asking for database analysis, set requiresDatabase=false and provide a concise directAnswer.",
    "Preserve follow-up constraints from history when words like now, same, those, only, exclude, or instead are used.",
    "",
    "Conversation history:",
    params.history || "(none)",
    "",
    "Latest question:",
    params.question,
  ].join("\n");
}

export function tableSelectionPrompt(params: { question: string; candidates: TableCandidate[] }): string {
  return [
    "Select the 5-8 tables actually needed to answer the question. Use fewer only when the answer clearly needs fewer.",
    "Choose only from the candidate table names. Prefer tables connected by relationships for joins.",
    "",
    "Question:",
    params.question,
    "",
    "Candidate tables:",
    formatCandidatesForPrompt(params.candidates),
  ].join("\n");
}

export function columnPruningPrompt(params: {
  question: string;
  selectedCandidates: TableCandidate[];
}): string {
  const tables = params.selectedCandidates
    .map((candidate) => {
      const columns = candidate.columns
        .map((column) => {
          const flags = [
            column.isPrimaryKey ? "pk" : null,
            column.isForeignKey ? "fk" : null,
            column.nullable ? "nullable" : "not-null",
          ].filter(Boolean).join(", ");
          return `  - ${column.name}: ${column.type} (${flags})`;
        })
        .join("\n");
      return [
        `Table ${candidate.tableName}`,
        columns,
        candidate.relationshipHints.length > 0 ? `Relationships: ${candidate.relationshipHints.join("; ")}` : null,
      ].filter(Boolean).join("\n");
    })
    .join("\n\n");

  return [
    "Prune each selected table to only columns needed for the question, including join keys and grouping/filter/order columns.",
    "Include primary keys and foreign keys when they are needed to join selected tables.",
    "Return compact join path strings using table.column -> table.column.",
    "",
    "Question:",
    params.question,
    "",
    "Selected table schemas:",
    tables,
  ].join("\n");
}

export function sqlPlanPrompt(params: {
  question: string;
  schema: SchemaInfo;
  pruning: ColumnPruning;
}): string {
  return [
    "Generate one safe PostgreSQL SELECT query for the user question.",
    "",
    "Rules:",
    "- Return a single read-only SQL statement beginning with SELECT or WITH.",
    "- Do not use INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE, GRANT, REVOKE, comments, or multiple statements.",
    "- Use only tables and columns in the skinny schema.",
    "- Use explicit JOINs and clear aliases.",
    "- Apply top/bottom LIMITs requested by the user. The runtime will add a bounded outer LIMIT.",
    "- Use CURRENT_DATE and PostgreSQL intervals for relative dates.",
    "- Prefer business-readable output aliases in snake_case.",
    "",
    "Question:",
    params.question,
    "",
    "Skinny schema:",
    formatSkinnySchemaForPrompt({ schema: params.schema, pruning: params.pruning }),
  ].join("\n");
}

export function explanationTextPrompt(params: {
  question: string;
  sql: string;
  result: BoundedQueryResult;
}): string {
  const rows = params.result.rows.slice(0, 30);
  return [
    "Explain the bounded query result for a BI user.",
    "Be concise and grounded only in the provided rows. Mention truncation if true.",
    "Return plain prose only — no JSON, no structured output.",
    "",
    "Question:",
    params.question,
    "",
    "SQL:",
    params.sql,
    "",
    "Columns:",
    params.result.columns.map((c) => `${c.name}:${c.canonicalType}`).join(", "),
    "",
    "Rows JSON:",
    JSON.stringify(rows),
    "",
    `Returned rows: ${params.result.returnedRowCount}`,
    `Truncated: ${params.result.truncated}`,
  ].join("\n");
}

export function explanationChartHintPrompt(params: {
  question: string;
  sql: string;
  result: BoundedQueryResult;
}): string {
  const rows = params.result.rows.slice(0, 10);
  return [
    "Suggest a chart type for this query result. Return null if a table is most appropriate.",
    "",
    "Question:",
    params.question,
    "",
    "Columns:",
    params.result.columns.map((c) => `${c.name}:${c.canonicalType}`).join(", "),
    "",
    "Sample rows (up to 10):",
    JSON.stringify(rows),
  ].join("\n");
}
