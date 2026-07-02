import { devLogError } from "@query-wise/shared/observability";
import type { CanonicalDataSourceMetadata } from "@query-wise/shared/types";
import { getDataSourceAdapter } from "@query-wise/shared/data-sources";
import { getConnectionSecretForIngestion } from "@query-wise/shared/connections";

// Per-column read is time-boxed by the adapter; this is the overall budget across the whole
// snapshot so a large database (hundreds of tables/columns) cannot hold the ingestion job open.
const SAMPLING_BUDGET_MS = 30_000;
const PER_COLUMN_TIMEOUT_MS = 2_000;
const MAX_SAMPLE_VALUES = 15;

function isSampleableTextColumn(nativeType: string, name: string, primaryKey: boolean): boolean {
  const type = nativeType.toLowerCase();
  const isText = type.includes("varchar") || type.includes("text") || type.includes("char");
  const lowerName = name.toLowerCase();
  return isText && !primaryKey && lowerName !== "id" && !lowerName.endsWith("_id");
}

/**
 * Samples distinct example values for low-cardinality text columns and attaches them to each
 * entity's `topValues` map (columnName -> values). Mutates `metadata` in place; callers persist
 * the enriched metadata on the next snapshot write (e.g. completeSnapshot).
 */
export async function sampleEntityValues(
  connectionId: string,
  metadata: CanonicalDataSourceMetadata,
): Promise<void> {
  try {
    const { record, secret } = await getConnectionSecretForIngestion(connectionId);
    if (!record) return;

    const adapter = getDataSourceAdapter(record.providerId);
    const deadline = Date.now() + SAMPLING_BUDGET_MS;

    for (const entity of metadata.entities) {
      if (Date.now() >= deadline) break;

      const sampleCols = entity.columns.filter((c) =>
        isSampleableTextColumn(c.nativeType, c.name, c.primaryKey),
      );
      if (sampleCols.length === 0) continue;

      const topValues: Record<string, string[]> = {};
      for (const col of sampleCols) {
        if (Date.now() >= deadline) break;
        try {
          const sql = `SELECT DISTINCT "${col.name}" as val FROM (SELECT "${col.name}" FROM "${entity.namespace}"."${entity.name}" WHERE "${col.name}" IS NOT NULL LIMIT 5000) s LIMIT ${MAX_SAMPLE_VALUES}`;
          const query = { kind: "sql", dialectId: "postgresql", text: sql } as const;
          const result = await adapter.executeReadQuery(connectionId, record.credentialVersion, secret, query, {
            timeoutMs: PER_COLUMN_TIMEOUT_MS,
            maxRows: MAX_SAMPLE_VALUES,
            maxBytes: 10 * 1024 * 1024,
          });
          if (result.rows && result.rows.length > 0 && result.rows.length <= MAX_SAMPLE_VALUES) {
            topValues[col.name] = result.rows.map((r) => String(r.val));
          }
        } catch {
          // Ignore per-column sampling failures; sampling is best-effort enrichment.
        }
      }

      if (Object.keys(topValues).length > 0) {
        entity.topValues = topValues;
      }
    }
  } catch (error) {
    devLogError("schema-ingestion.sampling-failed", "Value sampling failed", error, { connectionId });
  }
}
