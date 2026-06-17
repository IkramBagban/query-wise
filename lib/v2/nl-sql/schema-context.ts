import type { ChatMessage, SchemaInfo, SchemaTable } from "@/types";

const SAMPLE_ROWS_ENABLED = process.env.QUERYWISE_LLM_INCLUDE_SAMPLE_ROWS === "true";
const SENSITIVE_COLUMN_PATTERN = /(^|_)(email|phone|password|secret|token|key|address|name|first_name|last_name|full_name|ip|ssn|dob)($|_)/i;

export interface TableCandidate {
  tableName: string;
  summary: string;
  columns: Array<{
    name: string;
    type: string;
    nullable: boolean;
    isPrimaryKey: boolean;
    isForeignKey: boolean;
  }>;
  relationshipHints: string[];
  sampleHints: string[];
  score: number;
}

export function compactHistory(history: ChatMessage[], limit = 8): string {
  return history
    .slice(-limit)
    .map((message) => {
      const sql = message.sql ? `\nSQL: ${message.sql}` : "";
      return `${message.role.toUpperCase()}: ${message.content}${sql}`;
    })
    .join("\n\n");
}

export function tableDisplayName(table: SchemaTable): string {
  return table.name;
}

function tableRelationshipHints(schema: SchemaInfo, tableName: string): string[] {
  return schema.relationships
    .filter((relationship) => relationship.fromTable === tableName || relationship.toTable === tableName)
    .slice(0, 12)
    .map((relationship) => `${relationship.fromTable}.${relationship.fromColumn} -> ${relationship.toTable}.${relationship.toColumn}`);
}

function redactSampleValue(columnName: string, value: unknown): unknown {
  if (value == null) return value;
  if (SENSITIVE_COLUMN_PATTERN.test(columnName)) return "[redacted]";
  if (typeof value === "string") {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "[redacted-email]";
    if (value.length > 80) return `${value.slice(0, 77)}...`;
  }
  return value;
}

function redactedSampleRows(table: SchemaTable): Record<string, unknown>[] {
  if (!SAMPLE_ROWS_ENABLED) return [];
  return (table.sampleData ?? []).slice(0, 2).map((row) =>
    Object.fromEntries(
      Object.entries(row)
        .slice(0, 20)
        .map(([key, value]) => [key, redactSampleValue(key, value)]),
    ),
  );
}

export function toTableCandidate(schema: SchemaInfo, table: SchemaTable, score: number): TableCandidate {
  const relationshipHints = tableRelationshipHints(schema, table.name);
  const keyColumns = table.columns
    .filter((column) => column.isPrimaryKey || column.isForeignKey)
    .map((column) => column.name)
    .slice(0, 10);
  const sampleColumns = table.columns.map((column) => column.name).slice(0, 18);
  const sampleHints = [
    ...table.columns.flatMap((column) => {
      const topValues = column.topValues?.slice(0, 4).map((item) => String(item.value)).join(", ");
      const range = column.range ? `${column.range.min} to ${column.range.max}` : null;
      return [
        topValues ? `${column.name} values: ${topValues}` : null,
        range ? `${column.name} range: ${range}` : null,
      ].filter((value): value is string => Boolean(value));
    }),
    ...redactedSampleRows(table).map((row) => `sample row: ${JSON.stringify(row)}`),
  ].slice(0, 12);
  return {
    tableName: tableDisplayName(table),
    summary: [
      `${table.name} (${table.columns.length} columns${typeof table.rowCount === "number" ? `, ~${table.rowCount} rows` : ""})`,
      keyColumns.length > 0 ? `keys: ${keyColumns.join(", ")}` : null,
      sampleColumns.length > 0 ? `columns: ${sampleColumns.join(", ")}` : null,
    ].filter(Boolean).join("; "),
    columns: table.columns.map((column) => ({
      name: column.name,
      type: column.fullType ?? column.type,
      nullable: column.nullable,
      isPrimaryKey: column.isPrimaryKey,
      isForeignKey: column.isForeignKey,
    })),
    relationshipHints,
    sampleHints,
    score,
  };
}

export function formatCandidatesForPrompt(candidates: TableCandidate[]): string {
  return candidates
    .map((candidate, index) => [
      `${index + 1}. ${candidate.tableName} score=${candidate.score.toFixed(3)}`,
      `   ${candidate.summary}`,
      candidate.relationshipHints.length > 0 ? `   relationships: ${candidate.relationshipHints.join("; ")}` : null,
      candidate.sampleHints.length > 0 ? `   samples: ${candidate.sampleHints.join("; ")}` : null,
    ].filter(Boolean).join("\n"))
    .join("\n");
}

export function formatSkinnySchemaForPrompt(params: {
  schema: SchemaInfo;
  pruning: { tables: Array<{ tableName: string; columns: Array<{ name: string }> }>; joinPaths: string[] };
}): string {
  const tableByName = new Map(params.schema.tables.map((table) => [table.name, table]));
  const sections = params.pruning.tables.map((prunedTable) => {
    const table = tableByName.get(prunedTable.tableName);
    if (!table) return `Table ${prunedTable.tableName}: unavailable`;
    const columnNames = new Set(prunedTable.columns.map((column) => column.name));
    const columns = table.columns
      .filter((column) => columnNames.has(column.name))
      .map((column) => {
        const flags = [
          column.isPrimaryKey ? "pk" : null,
          column.isForeignKey ? "fk" : null,
          column.nullable ? "nullable" : "not-null",
        ].filter(Boolean).join(", ");
        const sample = [
          column.range ? `range ${column.range.min} to ${column.range.max}` : null,
          column.topValues?.length ? `top values ${column.topValues.slice(0, 5).map((item) => String(item.value)).join(", ")}` : null,
        ].filter(Boolean).join("; ");
        return `  - ${column.name}: ${column.fullType ?? column.type} (${flags})${sample ? `; ${sample}` : ""}`;
      })
      .join("\n");
    const rows = redactedSampleRows(table);
    const sampleRows = rows.length
      ? `\nSample rows:\n${rows.map((row) => `  - ${JSON.stringify(row)}`).join("\n")}`
      : "";
    return `Table ${table.name}\n${columns}${sampleRows}`;
  });

  return [
    ...sections,
    params.pruning.joinPaths.length > 0 ? `Join paths:\n${params.pruning.joinPaths.map((path) => `  - ${path}`).join("\n")}` : "Join paths: none provided",
  ].join("\n\n");
}
