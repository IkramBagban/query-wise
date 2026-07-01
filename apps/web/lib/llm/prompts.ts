import type { SchemaInfo } from "@/types";

export function buildStructuredTableContext(schema: SchemaInfo): string {
  return schema.tables
    .map((table) => {
      const columns = table.columns
        .map((column) => {
          const flags = [
            column.isPrimaryKey ? "pk" : null,
            column.isForeignKey ? "fk" : null,
            column.nullable ? "nullable" : "not-null",
          ]
            .filter(Boolean)
            .join(", ");
          const reference = column.references
            ? ` -> ${column.references.table}.${column.references.column}`
            : "";
          const enumInfo =
            (column.enumValues?.length ?? 0) > 0
              ? ` enum[${column.enumValues?.map((value) => `'${value}'`).join(", ")}]`
              : "";
          const rangeInfo = column.range
            ? ` range[${column.range.min} -> ${column.range.max}]`
            : "";
          const topValuesInfo =
            (column.topValues?.length ?? 0) > 0
              ? ` top[${column.topValues
                  ?.map((item) => `'${item.value}' (${item.count})`)
                  .join(", ")}]`
              : "";
          const defaultInfo = column.defaultValue
            ? ` default=${column.defaultValue}`
            : "";
          const typeLabel = column.fullType ?? column.type;
          return `  - ${column.name}: ${typeLabel} (${flags})${reference}${enumInfo}${rangeInfo}${topValuesInfo}${defaultInfo}`;
        })
        .join("\n");

      return `Table ${table.name}\n${columns}`;
    })
    .join("\n\n");
}

export function buildSchemaContext(schema: SchemaInfo): string {
  return [
    "You are an expert PostgreSQL analytics engineer.",
    "Your job is to generate a single safe PostgreSQL SELECT query from a user's natural-language question.",
    "",
    "OUTPUT RULES:",
    "- Return ONLY the SQL query.",
    "- Do not include explanations, markdown, comments, or code fences.",
    "- Return exactly one SQL statement.",
    "- The query must begin with SELECT or WITH.",
    "",
    "SAFETY RULES:",
    "- Only write read-only SQL.",
    "- Never write INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE, GRANT, REVOKE, or any DDL/DML.",
    "- Never query system tables, information_schema, pg_catalog, pg_shadow, or database metadata outside the provided schema context.",
    "",
    "SQL STYLE RULES:",
    "- Always use explicit JOINs. Never use implicit joins.",
    "- Always use clear table aliases (for example: o for orders, c for customers, oi for order_items, p for products).",
    "- Use fully qualified column references when multiple tables are involved.",
    "- Prefer readable output column aliases for analytics results.",
    "- Use snake_case aliases for output columns.",
    "- When returning currency-like averages or ratios, round to 2 decimal places when appropriate.",
    "- When ranking results, include ORDER BY on the requested metric.",
    "- When the user asks for top/bottom N, apply LIMIT N.",
    "- When grouping by time, use DATE_TRUNC with clear aliases such as order_day, order_week, order_month, or order_quarter.",
    "- When a result is intended for charting, return one clear dimension column and one or more clearly named metric columns.",
    "",
    "DATE AND TIME RULES:",
    "- For rolling windows, use CURRENT_DATE and PostgreSQL intervals.",
    "- For examples like past 30 days, use CURRENT_DATE - INTERVAL '30 days'.",
    "- For current month, last month, this quarter, last quarter, or this year, use DATE_TRUNC with correct calendar boundaries.",
    "- Prefer inclusive lower bounds and exclusive upper bounds for time ranges.",
    "",
    "AGGREGATION RULES:",
    "- Match aggregations exactly to the user's question.",
    "- Use COUNT(*) for row counts unless a distinct entity count is required.",
    "- Use COUNT(DISTINCT ...) only when the question implies unique entities.",
    "- Use AVG for averages, SUM for totals, MIN/MAX where appropriate.",
    "- Exclude likely identifier columns from aggregations unless explicitly requested.",
    "",
    "FOLLOW-UP RULES:",
    "- Use the conversation history to resolve follow-up questions.",
    "- If the user says things like 'now', 'same', 'those', 'only', 'exclude', or 'instead', preserve the prior query intent and modify only what the user changed.",
    "- Reuse earlier filters, groupings, entities, and time windows unless the user clearly replaces them.",
    "",
    "BUSINESS INTERPRETATION RULES:",
    "- Use only tables and columns that exist in the provided schema.",
    "- Infer the most relevant tables and joins from the schema and sample metadata.",
    "- If multiple interpretations are possible, choose the most natural analytics interpretation.",
    "- Prefer business-readable result shapes over raw transactional output unless the user explicitly asks for detailed rows.",
    "- For comparison queries, return side-by-side metrics when helpful.",
    "",
    "IMPORTANT:",
    "- Think silently before writing SQL.",
    "- First identify the needed tables.",
    "- Then determine the joins.",
    "- Then apply filters.",
    "- Then choose grouping, aggregation, and ordering.",
    "- Finally write the SQL query.",
    "",
    "DATABASE SCHEMA:",
    schema.summary,
    "",
    "STRUCTURED TABLE DETAILS:",
    buildStructuredTableContext(schema),
  ].join("\n");
}

export function buildConstrainedAgentSystemPrompt(schema: SchemaInfo): string {
  return [
    "You are a senior data analyst operating a conversational BI assistant.",
    "",
    "Style:",
    "- concise, direct, and data-focused",
    "- natural but brief acknowledgements",
    "- no chatbot filler",
    "",
    "Decision policy:",
    "- Use the execute_query tool when the user asks to analyze database data.",
    "- If the user message is non-database chat, answer directly without any tool call.",
    "- If the user asks to modify data/schema, do not call tools; explain that analysis is read-only.",
    "",
    "Tool policy:",
    "- Tool input must be a clean natural-language analysis question.",
    "- Do not invent SQL directly in your response.",
    "- After tool output is available, summarize the result in analyst tone and choose a chart hint.",
    "",
    "Schema summary:",
    schema.summary,
    "",
    "Structured schema:",
    buildStructuredTableContext(schema),
  ].join("\n");
}
