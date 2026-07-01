import { createHash } from "node:crypto";
import type { SchemaInfo, SchemaTable } from "@/types";
import { Prisma } from "@prisma/client";
import { getAppDb } from "@query-wise/shared/app-db";
import { toTableCandidate, type TableCandidate } from "./schema-context";

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "by", "for", "from", "in", "is", "me", "of", "on", "or",
  "show", "the", "to", "what", "when", "where", "which", "with", "now", "only",
]);

function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9_]+/g)
    .flatMap((token) => token.split("_"))
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function hashEmbedding(text: string, dimensions = 384): number[] {
  const vector = Array.from({ length: dimensions }, () => 0);
  const textTokens = tokens(text);
  for (const token of textTokens) {
    const digest = createHash("sha256").update(token).digest();
    const index = digest.readUInt16BE(0) % dimensions;
    const sign = digest[2] % 2 === 0 ? 1 : -1;
    vector[index] += sign;
  }
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => Number((value / magnitude).toFixed(6)));
}

function toPgVector(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

function tableText(table: SchemaTable): string {
  return [
    table.name,
    ...table.columns.map((column) => [
      column.name,
      column.type,
      column.fullType,
      column.isPrimaryKey ? "primary key id identifier" : "",
      column.isForeignKey ? "foreign key relationship join" : "",
      column.topValues?.map((item) => String(item.value)).join(" "),
    ].filter(Boolean).join(" ")),
  ].join(" ");
}

function scoreTable(questionTokens: Set<string>, table: SchemaTable): number {
  const haystack = tokens(tableText(table));
  if (haystack.length === 0) return 0;
  let score = 0;
  for (const token of haystack) {
    if (questionTokens.has(token)) score += 1;
  }
  const exactNameBonus = questionTokens.has(table.name.toLowerCase()) ? 3 : 0;
  const keyColumnBonus = table.columns.some((column) => column.isPrimaryKey || column.isForeignKey) ? 0.2 : 0;
  return score / Math.sqrt(haystack.length) + exactNameBonus + keyColumnBonus;
}

export function adaptiveRetrievalLimit(totalTables: number): number | null {
  if (totalTables <= 15) return null;
  if (totalTables <= 25) return 10;
  if (totalTables <= 50) return 20;
  if (totalTables <= 100) return 25;
  return 30;
}

export async function retrieveCandidateTables(params: {
  schema: SchemaInfo;
  question: string;
  limit?: number | null;
}): Promise<TableCandidate[]> {
  if (params.limit === null) {
    return params.schema.tables.map((table) => toTableCandidate(params.schema, table, 1.0));
  }
  const vectorCandidates = await retrieveVectorCandidateTables(params).catch(() => []);
  if (vectorCandidates.length > 0) return vectorCandidates;
  return retrieveLexicalCandidateTables(params);
}

function retrieveLexicalCandidateTables(params: {
  schema: SchemaInfo;
  question: string;
  limit?: number | null;
}): TableCandidate[] {
  const questionTokens = new Set(tokens(params.question));
  const limit = params.limit ?? 30;
  const scored = params.schema.tables
    .map((table) => ({ table, score: scoreTable(questionTokens, table) }))
    .sort((a, b) => b.score - a.score || a.table.name.localeCompare(b.table.name));

  const nonZero = scored.filter((item) => item.score > 0);
  const selected = (nonZero.length > 0 ? nonZero : scored).slice(0, limit);
  return selected.map((item) => toTableCandidate(params.schema, item.table, item.score));
}

async function retrieveVectorCandidateTables(params: {
  schema: SchemaInfo;
  question: string;
  limit?: number | null;
}): Promise<TableCandidate[]> {
  if (!params.schema.connectionId || !params.schema.schemaFingerprint) return [];
  const queryVector = toPgVector(hashEmbedding(params.question));
  const rows = await getAppDb().$queryRaw<Array<{
    entity_id: string;
    score: number;
  }>>(Prisma.sql`
    SELECT entity_id, MAX(1 - (embedding <=> ${queryVector}::vector))::float8 AS score
    FROM v2_schema_embeddings
    WHERE connection_id = ${params.schema.connectionId}::uuid
      AND schema_fingerprint = ${params.schema.schemaFingerprint}
      AND embedding_kind IN ('table-summary', 'question-summary')
    GROUP BY entity_id
    ORDER BY score DESC
    LIMIT ${params.limit ?? 30}
  `);
  if (rows.length === 0) return [];
  const tableByEntityId = new Map<string, SchemaTable>(params.schema.tables.map((table) => {
    const [namespace, ...nameParts] = table.name.includes(".") ? table.name.split(".") : ["public", table.name];
    return [`${namespace}.${nameParts.join(".")}`, table] as const;
  }));
  return rows
    .map((row) => {
      const table = tableByEntityId.get(row.entity_id);
      return table ? toTableCandidate(params.schema, table, row.score) : null;
    })
    .filter((candidate): candidate is TableCandidate => Boolean(candidate));
}
