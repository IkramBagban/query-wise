import { Prisma } from "@prisma/client";
import type { AppDbTransaction } from "@query-wise/shared/app-db";
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

export async function persistSchemaEmbeddings(tx: AppDbTransaction, records: SchemaEmbeddingRecord[]): Promise<"persisted" | "metadata-only"> {
  if (records.length === 0) return "persisted";
  const hasVectorTable = await relationExists(tx, "v2_schema_embeddings");
  if (!hasVectorTable) return "metadata-only";

  for (const record of records) {
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO v2_schema_embeddings (
        connection_id,
        entity_id,
        namespace,
        entity_name,
        embedding_kind,
        content,
        embedding,
        payload,
        schema_fingerprint,
        updated_at
      )
      VALUES (
        ${record.connectionId}::uuid,
        ${record.entityId},
        ${record.namespace},
        ${record.entityName},
        ${record.embeddingKind},
        ${record.text},
        ${toPgVector(record.vector)}::vector,
        ${JSON.stringify(record.payload)}::jsonb,
        ${record.payload.schemaFingerprint},
        now()
      )
      ON CONFLICT (connection_id, entity_id, embedding_kind)
      DO UPDATE SET
        namespace = EXCLUDED.namespace,
        entity_name = EXCLUDED.entity_name,
        content = EXCLUDED.content,
        embedding = EXCLUDED.embedding,
        payload = EXCLUDED.payload,
        schema_fingerprint = EXCLUDED.schema_fingerprint,
        updated_at = now()
    `);
  }

  return "persisted";
}
