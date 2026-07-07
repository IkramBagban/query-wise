import { devLog, devLogError } from "@query-wise/shared/observability";
import type { MetadataColumn, MetadataEntity } from "@query-wise/shared/types";
import { getDataSourceAdapter } from "@query-wise/shared/data-sources";
import { getConnectionSecretForIngestion } from "@query-wise/shared/connections";
import { computeEntityFingerprint } from "./fingerprint";

// Per-table and global budgets replace the previous single 30s global budget (SPEC-03 §4). The
// global budget scales with entity count so large databases still make progress on the most
// important tables rather than starving after the first N in introspection order.
const PER_TABLE_BUDGET_MS = 3_000;
const GLOBAL_BUDGET_CAP_MS = 90_000;
const GLOBAL_BUDGET_FLOOR_MS = 10_000;
const PER_ENTITY_BUDGET_MS = 2_000;
const PER_COLUMN_TIMEOUT_MS = 2_000;
const MAX_SAMPLE_VALUES = 15;
const SAMPLE_CONCURRENCY = 4;

// A column with many distinct values is not enum-like, so sampling it wastes budget (SPEC-03 §4.4).
const HIGH_DISTINCT_ABSOLUTE = 50;
const HIGH_DISTINCT_FRACTION = 0.1;

export interface SamplingCoverage {
  entitiesFullySampled: number;
  entitiesPartiallySampled: number;
  entitiesNeverSampled: number;
  entitiesSkipped: number;
}

function isSampleableTextColumn(nativeType: string, name: string, primaryKey: boolean): boolean {
  const type = nativeType.toLowerCase();
  const isText = type.includes("varchar") || type.includes("text") || type.includes("char");
  const lowerName = name.toLowerCase();
  return isText && !primaryKey && lowerName !== "id" && !lowerName.endsWith("_id");
}

/** Uses profile stats (§3) to drop high-cardinality columns before sampling. */
function isHighCardinality(entity: MetadataEntity, column: MetadataColumn): boolean {
  const distinctCount = entity.columnProfiles?.[column.name]?.distinctCount;
  if (distinctCount == null) return false;
  if (distinctCount > HIGH_DISTINCT_ABSOLUTE) return true;
  const rowCount = entity.estimatedRowCount ?? 0;
  return rowCount > 0 && distinctCount / rowCount > HIGH_DISTINCT_FRACTION;
}

function sampleableColumns(entity: MetadataEntity): MetadataColumn[] {
  return entity.columns.filter(
    (column) =>
      isSampleableTextColumn(column.nativeType, column.name, column.primaryKey) &&
      !isHighCardinality(entity, column),
  );
}

type SampleEntityOutcome = "full" | "partial" | "empty";

/**
 * Samples distinct example values for low-cardinality text columns and attaches them to each
 * entity's `topValues` map (columnName -> values). Entities are processed in the importance order
 * supplied by the caller, in parallel across a small worker pool, and mutated in place; callers
 * persist the enriched metadata on the next snapshot write. Never throws.
 */
export async function sampleEntityValues(
  connectionId: string,
  rankedEntities: MetadataEntity[],
  onCheckpoint?: () => Promise<void>,
): Promise<SamplingCoverage> {
  const coverage: SamplingCoverage = {
    entitiesFullySampled: 0,
    entitiesPartiallySampled: 0,
    entitiesNeverSampled: 0,
    entitiesSkipped: 0,
  };

  try {
    const { record, secret } = await getConnectionSecretForIngestion(connectionId);
    if (!record) return coverage;
    const adapter = getDataSourceAdapter(record.providerId);

    // Skip entities already sampled at the current fingerprint (resumable retries).
    const toSample = rankedEntities.filter((entity) => {
      const skip = entity.sampledFingerprint === computeEntityFingerprint(entity);
      if (skip) coverage.entitiesSkipped += 1;
      return !skip;
    });

    const globalDeadline =
      Date.now() + Math.max(GLOBAL_BUDGET_FLOOR_MS, Math.min(GLOBAL_BUDGET_CAP_MS, toSample.length * PER_ENTITY_BUDGET_MS));
    const now = new Date().toISOString();

    async function sampleOne(entity: MetadataEntity): Promise<void> {
      if (Date.now() >= globalDeadline) {
        coverage.entitiesNeverSampled += 1;
        return;
      }
      const sampleCols = sampleableColumns(entity);
      const tableDeadline = Math.min(Date.now() + PER_TABLE_BUDGET_MS, globalDeadline);
      const topValues: Record<string, string[]> = {};
      let sampledColCount = 0;

      for (const column of sampleCols) {
        if (Date.now() >= tableDeadline) break;
        try {
          const sql = `SELECT DISTINCT "${column.name}" as val FROM (SELECT "${column.name}" FROM "${entity.namespace}"."${entity.name}" WHERE "${column.name}" IS NOT NULL LIMIT 5000) s LIMIT ${MAX_SAMPLE_VALUES}`;
          const query = { kind: "sql", dialectId: "postgresql", text: sql } as const;
          const result = await adapter.executeReadQuery(connectionId, record.credentialVersion, secret, query, {
            timeoutMs: PER_COLUMN_TIMEOUT_MS,
            maxRows: MAX_SAMPLE_VALUES,
            maxBytes: 10 * 1024 * 1024,
          });
          if (result.rows && result.rows.length > 0 && result.rows.length <= MAX_SAMPLE_VALUES) {
            topValues[column.name] = result.rows.map((row) => String(row.val));
          }
          sampledColCount += 1;
        } catch {
          // Ignore per-column sampling failures; sampling is best-effort enrichment.
        }
      }

      if (Object.keys(topValues).length > 0) {
        entity.topValues = { ...entity.topValues, ...topValues };
      }

      const outcome: SampleEntityOutcome =
        sampleCols.length === 0 ? "empty" : sampledColCount >= sampleCols.length ? "full" : "partial";
      if (outcome === "partial") coverage.entitiesPartiallySampled += 1;
      else coverage.entitiesFullySampled += 1;

      // Only mark fully-processed entities so a partially-sampled table is retried on the next run.
      if (outcome !== "partial") {
        entity.sampledFingerprint = computeEntityFingerprint(entity);
        entity.sampledAt = now;
      }
      await onCheckpoint?.();
    }

    // Bounded worker pool: SAMPLE_CONCURRENCY tables in flight, each pulling from a shared cursor.
    let cursor = 0;
    async function worker(): Promise<void> {
      while (cursor < toSample.length) {
        const index = cursor++;
        if (Date.now() >= globalDeadline) {
          coverage.entitiesNeverSampled += 1;
          continue;
        }
        await sampleOne(toSample[index]);
      }
    }
    await Promise.all(Array.from({ length: Math.min(SAMPLE_CONCURRENCY, toSample.length) }, () => worker()));

    devLog("info", "schema-ingestion.sampling.coverage", "Schema ingestion sampling coverage.", {
      connectionId,
      ...coverage,
      totalEntities: rankedEntities.length,
    });
    return coverage;
  } catch (error) {
    devLogError("schema-ingestion.sampling-failed", "Value sampling failed", error, { connectionId });
    return coverage;
  }
}
