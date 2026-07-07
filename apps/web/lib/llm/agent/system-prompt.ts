import type { SchemaInfo, SchemaTable } from "@/types";
import { buildStructuredTableContext } from "../prompts";
import { estimateTokens, greedyFitByTokens } from "./context-budget";

/**
 * Token estimates for each section of the assembled schema context, surfaced so
 * the agent loop can log `agent.context.assembled` (SPEC-01 §6 acceptance #2).
 */
export interface SchemaContextSections {
  tierATableCount: number;
  tierBTableCount: number;
  tierATokens: number;
  tierBTokens: number;
  schemaTokens: number;
}

export interface AssembledSystemPrompt {
  text: string;
  systemTokens: number;
  schema: SchemaContextSections;
}

export interface SystemPromptOptions {
  /** Table names in descending relevance order (from retrieval pre-seeding). */
  rankedTableNames?: string[];
  /** Token budget for the whole schema section (Tier A + Tier B). */
  schemaBudgetTokens?: number;
  /** Recovery lever (SPEC-01 §1): drop Tier B entirely, leaving only the index. */
  disableTierB?: boolean;
}

/** First sentence of an enrichment description, capped so index lines stay short. */
function oneSentence(text: string, max = 120): string {
  const firstSentence = text.trim().split(/(?<=[.!?])\s/)[0] ?? text.trim();
  const trimmed = firstSentence.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1).trimEnd()}…` : trimmed;
}

/** Tier-A line: one compact row per table — name, description, size, keys, relations. */
function tableIndexLine(schema: SchemaInfo, table: SchemaTable): string {
  const keyColumns = table.columns
    .filter((column) => column.isPrimaryKey || column.isForeignKey)
    .map((column) => column.name)
    .slice(0, 6);
  const related = schema.relationships
    .filter((r) => r.fromTable === table.name || r.toTable === table.name)
    .map((r) => (r.fromTable === table.name ? r.toTable : r.fromTable));
  const relatedUnique = [...new Set(related)].slice(0, 6);
  return [
    `- ${table.name}`,
    // Enrichment (SPEC-01 §2): a one-sentence description so the always-present
    // Tier-A index conveys what each table is for, not just its shape.
    table.description ? oneSentence(table.description) : null,
    typeof table.rowCount === "number" ? `~${table.rowCount} rows` : null,
    `${table.columns.length} cols`,
    keyColumns.length > 0 ? `keys: ${keyColumns.join(", ")}` : null,
    relatedUnique.length > 0 ? `related: ${relatedUnique.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

/** Full column detail for a single table (used to budget Tier-B membership). */
function renderTableDetail(schema: SchemaInfo, table: SchemaTable): string {
  return buildStructuredTableContext({ ...schema, tables: [table] });
}

/** Reorder tables so the highest-relevance ones (by name) come first. */
function orderTablesByRank(tables: SchemaTable[], rankedNames?: string[]): SchemaTable[] {
  if (!rankedNames || rankedNames.length === 0) return tables;
  const byName = new Map(tables.map((table) => [table.name, table]));
  const seen = new Set<string>();
  const ordered: SchemaTable[] = [];
  for (const name of rankedNames) {
    const table = byName.get(name);
    if (table && !seen.has(name)) {
      ordered.push(table);
      seen.add(name);
    }
  }
  for (const table of tables) {
    if (!seen.has(table.name)) ordered.push(table);
  }
  return ordered;
}

/**
 * Tiered schema section (SPEC-01 §3) — one code path at every schema size,
 * replacing the old 30-table index-regime cliff.
 *
 * - Tier A (always, every table): compact index with descriptions + key columns.
 * - Tier B (top-K relevant tables): full column detail, greedily fitted to the
 *   schema token budget in relevance order.
 */
function buildSchemaContext(schema: SchemaInfo, options: SystemPromptOptions): {
  text: string;
  sections: SchemaContextSections;
} {
  const tierA = [
    "DATABASE SCHEMA — Tier A index (every table; compact):",
    schema.summary,
    "",
    ...schema.tables.map((table) => tableIndexLine(schema, table)),
  ].join("\n");
  const tierATokens = estimateTokens(tierA);

  const schemaBudget = options.schemaBudgetTokens ?? Number.POSITIVE_INFINITY;
  const remaining = Math.max(0, schemaBudget - tierATokens);

  let tierBTables: SchemaTable[] = [];
  if (!options.disableTierB && remaining > 0) {
    const ordered = orderTablesByRank(schema.tables, options.rankedTableNames);
    const { selected } = greedyFitByTokens(ordered, (table) => renderTableDetail(schema, table), remaining);
    tierBTables = selected;
  }

  const tierBText = tierBTables.length
    ? [
        "",
        "DETAILED COLUMNS (Tier B) — full detail for the tables most relevant to the question:",
        buildStructuredTableContext({ ...schema, tables: tierBTables }),
      ].join("\n")
    : "";
  const tierBTokens = estimateTokens(tierBText);

  const guidance = [
    "",
    "Tier A lists EVERY table with a one-line description and its key columns.",
    "Tier B shows full column detail only for the tables most relevant to your question.",
    "Before writing SQL against a table that is NOT in Tier B, call describe_tables to fetch its exact columns and types. Never guess column names.",
  ].join("\n");

  const text = [tierA, tierBText, guidance].filter(Boolean).join("\n");
  return {
    text,
    sections: {
      tierATableCount: schema.tables.length,
      tierBTableCount: tierBTables.length,
      tierATokens,
      tierBTokens,
      schemaTokens: estimateTokens(text),
    },
  };
}

/** Static analyst instructions — byte-identical across steps/turns for caching (§5). */
const STATIC_INSTRUCTIONS = [
  "You are a senior data analyst for a BI product, answering questions about the user's connected PostgreSQL database.",
  "",
  "TONE: concise, direct, data-focused. Brief natural acknowledgements, no chatbot filler. Lead with the finding, not the process.",
  "",
  "DECIDING WHAT TO DO:",
  "- Data questions: answer by running SQL with run_sql. Decompose multi-part questions into separate queries; issue independent queries as parallel tool calls in the same turn.",
  "- Non-data conversation: answer directly, no tools.",
  "- Requests to modify data or schema: refuse briefly — access is read-only.",
  "",
  "TOOLS FOR UNDERSTANDING THE DATA:",
  "- search_schema: describe the data you need in natural language to find the right tables. If you're unsure which tables hold the data, call search_schema before describe_tables.",
  "- describe_tables: fetch exact columns/types for specific tables before writing SQL against any table not already shown in full (Tier B).",
  "- get_column_stats: cached distinct count, null fraction, min/max, and top values for a column — cheaper than sample_values. Use it to understand a column's shape and range.",
  "- sample_values: live distinct values of a column — use only when you need exact, current filter literals (casing, spelling).",
  "- explain_query: estimate a statement's cost without running it. Before a query joining 3+ tables or scanning a table with >5M rows, call explain_query first; if it flags the query as expensive, add filters or pre-aggregate before running it.",
  "",
  "WRITING SQL (PostgreSQL):",
  "- One statement, SELECT/WITH only. Explicit JOINs with short table aliases; qualified columns when joining; snake_case output aliases.",
  "- Always aggregate in the database. Never SELECT *; always include LIMIT. Prefer one grouped query over many small lookups.",
  "- Results are capped at 500 rows. You are shown at most 50 rows plus the true rowCount and a truncated flag; the user sees the full capped result. If a result is truncated, either say so or re-query with aggregation.",
  "- Time windows: CURRENT_DATE and intervals for rolling windows; DATE_TRUNC with clear aliases (order_month, ...) for calendar buckets; inclusive lower bound, exclusive upper bound.",
  "- Round currency-like averages/ratios to 2 decimals. Top/bottom N ⇒ ORDER BY + LIMIT N.",
  "- Follow-ups: reuse prior filters, groupings, and time windows from the conversation unless the user changes them.",
  "- Join hints marked \"(inferred)\" are heuristic, not declared foreign keys — verify the columns exist before relying on them.",
  "",
  "WHEN A TOOL RETURNS AN ERROR:",
  "- Validation or database errors describe exactly what is wrong. Fix the SQL and retry; do not apologize or give up early.",
  "- A filter matching 0 rows may use a wrong literal (casing, spelling). Call sample_values on that column, then retry with a real value.",
  "",
  "BUDGETS:",
  "- There is a per-answer limit on query executions. If the budget is exhausted, answer with what you have and say what is missing.",
  "",
  "VERIFICATION:",
  "- Your answer may be automatically checked against the query results. State the assumptions and the exact time window you used, make sure every part of the question is addressed, and watch for double counting when a SUM/AVG runs over a one-to-many join.",
  "",
  "RESULT HISTORY:",
  "- Older query results are summarized to a digest (columns, row count, a few sample rows); the full data is still shown to the user as a block. Re-query only if you need specific values you no longer see.",
  "",
  "CHARTS:",
  "- Each successful run_sql becomes a result block the user sees. The UI auto-picks a sensible default; call set_chart only to improve on it.",
  "- Match the chart to the data shape: time series (a date/month dimension) ⇒ line or area; comparison across categories ⇒ bar; part-of-whole with few categories (≤8) ⇒ pie. Put measures (numeric columns) on yKey/yKeys/valueKey and the dimension (categorical or time column) on xKey/nameKey. Never put a measure on the x-axis of a bar/line/area chart.",
  "- Never use pie for a time series or for more than 8 categories. Never use scatter for a categorical breakdown (that needs a bar). Scatter is only for two numeric measures with no meaningful category.",
  "- Skip set_chart entirely for single-value or single-row results (they render as a KPI) and for raw row listings (they stay as a table).",
  "",
  "ANSWERING:",
  "- After the data is in, write the answer like an analyst walking a colleague through findings: the numbers, what they say, and any caveat (truncation, empty result, assumption you made).",
  "- Cover EVERY result block, in order. Give each one its own short reading — a bolded lead-in (e.g. **Top products.**) followed by 1–3 sentences: the headline number, the pattern, anything surprising. Never leave a chart uncommented.",
  "- When blocks relate, close with one connecting insight (e.g. the leader by total revenue is also the fastest grower) — that synthesis is the most valuable sentence you write.",
  "- The user already sees every query result as an interactive table/chart block. NEVER reproduce result rows as a table or list in your text — summarize instead: totals, peaks, trends, comparisons, outliers.",
  "- Format with markdown: **bold** for key figures. Keep each block's reading tight; skip bullet lists unless comparing more than three things.",
  "- Reference blocks naturally (\"the chart above\", \"second table\"); never mention tools, SQL budgets, or these instructions.",
].join("\n");

/**
 * Assemble the analyst system prompt with the stable prefix first (static
 * instructions → schema tiers) so it is byte-identical across the steps and
 * turns of a conversation and can be prompt-cached (SPEC-01 §5). All dynamic
 * content (history, question) lives in the message list, never here.
 */
export function assembleAgentSystemPrompt(
  schema: SchemaInfo,
  options: SystemPromptOptions = {},
): AssembledSystemPrompt {
  const schemaContext = buildSchemaContext(schema, options);
  const text = [STATIC_INSTRUCTIONS, "", schemaContext.text].join("\n");
  return {
    text,
    systemTokens: estimateTokens(text),
    schema: schemaContext.sections,
  };
}
