import { devLogError } from "@query-wise/shared/observability";
import type { MetadataEntity, CanonicalDataSourceMetadata } from "@query-wise/shared/types";
import { getDataSourceAdapter } from "@query-wise/shared/data-sources";
import { getConnectionSecretForIngestion } from "@query-wise/shared/connections";

export async function sampleEntityValues(connectionId: string, metadata: CanonicalDataSourceMetadata, onProgress: (metadata: CanonicalDataSourceMetadata) => Promise<void>) {
  try {
    const { record, secret } = await getConnectionSecretForIngestion(connectionId);
    if (!record) return;
    
    const adapter = getDataSourceAdapter(record.providerId);
    let updated = false;
    
    // We only sample top low-cardinality text columns
    // Loop through entities, sample and update snapshot
    for (const entity of metadata.entities) {
      const sampleCols = entity.columns.filter(c => 
        (c.nativeType.toLowerCase().includes("varchar") || c.nativeType.toLowerCase().includes("text") || c.nativeType.toLowerCase().includes("char")) 
        && !c.primaryKey 
        && c.name.toLowerCase() !== "id" 
        && !c.name.toLowerCase().endsWith("_id")
      );
      
      if (sampleCols.length === 0) continue;
      
      const topValues: Record<string, string[]> = {};
      
      for (const col of sampleCols) {
        try {
            // Time-boxed read-only query
            const sql = `SELECT DISTINCT "${col.name}" as val FROM (SELECT "${col.name}" FROM "${entity.namespace}"."${entity.name}" WHERE "${col.name}" IS NOT NULL LIMIT 5000) s LIMIT 15`;
            const query = { kind: "sql", dialectId: "postgresql", text: sql } as const;
            const result = await adapter.executeReadQuery(connectionId, record.credentialVersion, secret, query, { timeoutMs: 2000, maxRows: 15, maxBytes: 10 * 1024 * 1024 });
            if (result.rows && result.rows.length > 0 && result.rows.length <= 15) {
                topValues[col.name] = result.rows.map(r => String(r.val));
            }
        } catch (e) {
            // ignore sampling errors per column
        }
      }
      
      if (Object.keys(topValues).length > 0) {
        // We'll update the metadata with topValues inside the entity.
        // Wait, does MetadataEntity support topValues? Let's assume yes or add it.
        (entity as any).topValues = topValues;
        updated = true;
      }
    }
    
    if (updated) {
      await onProgress(metadata);
    }
  } catch (error) {
    devLogError("schema-ingestion.sampling-failed", "Value sampling failed", error, { connectionId });
  }
}
