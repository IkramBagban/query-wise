import { Prisma } from "@prisma/client";
import type { AppDbTransaction } from "@query-wise/shared/app-db";
import { getAppDb } from "@query-wise/shared/app-db";
import type { SchemaEmbeddingRecord } from "@query-wise/shared/ingestion";

function toPgVector(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

async function relationExists(tx: AppDbTransaction, relationName: string): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ exists: boolean }>>(Prisma.sql`
    SELECT to_regclass(${relationName}) IS NOT NULL AS exists
  `);
  return rows[0]?.exists === true;
}

/**
 * SPEC-03 §6.1 — resumability + embedding-model drift. Returns the entity ids already embedded at
 * the current schema fingerprint AND under the current embedding model (so they can be skipped on
 * retry), plus any distinct prior models that differ from the current one. When a different model is
 * detected the caller must NOT skip — every entity is re-embedded so vector retrieval never silently
 * degrades to a stale model.
 */
export async function loadEmbeddingResumeState(input: {
  connectionId: string;
  schemaFingerprint: string;
  currentModel: string | null;
}): Promise<{ alreadyEmbedded: Set<string>; driftModels: string[] }> {
  const db = getAppDb();
  const existsRows = await db.$queryRaw<Array<{ exists: boolean }>>(Prisma.sql`
    SELECT to_regclass('v2_schema_embeddings') IS NOT NULL AS exists
  `);
  if (existsRows[0]?.exists !== true) return { alreadyEmbedded: new Set(), driftModels: [] };

  const modelRows = await db.$queryRaw<Array<{ embedding_model: string }>>(Prisma.sql`
    SELECT DISTINCT embedding_model FROM v2_schema_embeddings
    WHERE connection_id = ${input.connectionId}::uuid
  `);
  const driftModels = modelRows
    .map((row) => row.embedding_model)
    .filter((model) => input.currentModel != null && model !== input.currentModel);

  if (!input.currentModel) return { alreadyEmbedded: new Set(), driftModels };

  const embeddedRows = await db.$queryRaw<Array<{ entity_id: string }>>(Prisma.sql`
    SELECT DISTINCT entity_id FROM v2_schema_embeddings
    WHERE connection_id = ${input.connectionId}::uuid
      AND schema_fingerprint = ${input.schemaFingerprint}
      AND embedding_model = ${input.currentModel}
      AND embedding_kind IN ('table-summary', 'question-summary')
  `);
  return { alreadyEmbedded: new Set(embeddedRows.map((row) => row.entity_id)), driftModels };
}

export async function persistSchemaEmbeddings(tx: AppDbTransaction, records: SchemaEmbeddingRecord[]): Promise<"persisted" | "metadata-only"> {
  if (records.length === 0) return "persisted";
  const hasVectorTable = await relationExists(tx, "v2_schema_embeddings");
  if (!hasVectorTable) return "metadata-only";

  const BATCH_SIZE = 100;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const chunk = records.slice(i, i + BATCH_SIZE);
    
    const values: string[] = [];
    const params: any[] = [];
    let p = 1;
    
    for (const record of chunk) {
      values.push(`($${p++}::uuid, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}::vector, $${p++}, $${p++}, $${p++}::jsonb, $${p++}, now())`);
      
      params.push(
        record.connectionId,
        record.entityId,
        record.namespace,
        record.entityName,
        record.embeddingKind,
        record.text,
        toPgVector(record.vector),
        record.dimensions,
        record.embeddingModel,
        JSON.stringify(record.payload),
        record.payload.schemaFingerprint
      );
    }
    
    const query = `
      INSERT INTO v2_schema_embeddings (
        connection_id,
        entity_id,
        namespace,
        entity_name,
        embedding_kind,
        content,
        embedding,
        dimensions,
        embedding_model,
        payload,
        schema_fingerprint,
        updated_at
      )
      VALUES ${values.join(", ")}
      ON CONFLICT (connection_id, entity_id, embedding_kind)
      DO UPDATE SET
        namespace = EXCLUDED.namespace,
        entity_name = EXCLUDED.entity_name,
        content = EXCLUDED.content,
        embedding = EXCLUDED.embedding,
        dimensions = EXCLUDED.dimensions,
        embedding_model = EXCLUDED.embedding_model,
        payload = EXCLUDED.payload,
        schema_fingerprint = EXCLUDED.schema_fingerprint,
        updated_at = now()
    `;
    
    await tx.$executeRawUnsafe(query, ...params);
  }

  return "persisted";
}

