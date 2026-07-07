/**
 * SPEC-03 §3 — Profiling stage.
 *
 * Produces per-column statistics (`entity.columnProfiles`) from two sources, cheapest first:
 *   3a. Free planner stats from `pg_stats` (a single system-catalog query, no user-table scans):
 *       distinct-count estimate, null fraction, and most-common values with frequencies.
 *   3b. Bounded MIN/MAX scans for date/timestamp/numeric columns — the source of data-freshness
 *       awareness that lets the web tier render real `range[min -> max]` values.
 *
 * Every step is best-effort and individually failure-tolerant: a permissions error on `pg_stats`
 * (step 3a) never aborts step 3b, and a per-table scan failure never aborts the stage. Entities are
 * processed in the importance order supplied by the caller and each profiled entity is stamped with
 * `profiledFingerprint`/`profiledAt` so retries skip already-profiled tables.
 */

import { devLog, devLogError } from "@query-wise/shared/observability";
import type { ColumnProfile, MetadataEntity } from "@query-wise/shared/types";
import { getDataSourceAdapter } from "@query-wise/shared/data-sources";
import { getConnectionSecretForIngestion } from "@query-wise/shared/connections";
import { computeEntityFingerprint } from "./fingerprint";
import { entityKey, quoteIdent, quoteQualified } from "./introspection";
import { convertDistinct, parseTopValues, scannableColumns, serializeBound } from "./ingestion-utils";

const PER_TABLE_BUDGET_MS = 5_000;
const GLOBAL_BUDGET_CAP_MS = 120_000;
const PER_ENTITY_BUDGET_MS = 2_000;

export interface ProfileCoverage {
  entitiesProfiled: number;
  entitiesSkipped: number;
  pgStatsAvailable: boolean;
  pgStatsColumns: number;
  minMaxColumns: number;
}

type PgStatsRow = {
  schemaname: string;
  tablename: string;
  attname: string;
  n_distinct: number | null;
  null_frac: number | null;
  most_common_vals: unknown;
  most_common_freqs: unknown;
};

function ensureProfile(entity: MetadataEntity, columnName: string): ColumnProfile {
  if (!entity.columnProfiles) entity.columnProfiles = {};
  if (!entity.columnProfiles[columnName]) entity.columnProfiles[columnName] = {};
  return entity.columnProfiles[columnName];
}

/**
 * Profiles the supplied entities (assumed already importance-ranked) in place. Returns coverage
 * counters for observability. Never throws — all failures are logged and swallowed so the caller's
 * stage stays failure-tolerant per §2.
 */
export async function profileEntities(
  connectionId: string,
  rankedEntities: MetadataEntity[],
  onCheckpoint?: () => Promise<void>,
): Promise<ProfileCoverage> {
  const coverage: ProfileCoverage = {
    entitiesProfiled: 0,
    entitiesSkipped: 0,
    pgStatsAvailable: false,
    pgStatsColumns: 0,
    minMaxColumns: 0,
  };

  try {
    const { record, secret } = await getConnectionSecretForIngestion(connectionId);
    if (!record) return coverage;
    const adapter = getDataSourceAdapter(record.providerId);
    if (!adapter.executeIntrospectionQuery) {
      devLog("warn", "schema-ingestion.profiling.unsupported", "Adapter does not support introspection queries; skipping profiling.", {
        connectionId,
        providerId: record.providerId,
      });
      return coverage;
    }
    const runQuery = adapter.executeIntrospectionQuery.bind(adapter);

    // Only profile entities whose fingerprint has changed since the last profiled snapshot.
    const toProfile = rankedEntities.filter((entity) => {
      const skip = entity.profiledFingerprint === computeEntityFingerprint(entity);
      if (skip) coverage.entitiesSkipped += 1;
      return !skip;
    });
    if (toProfile.length === 0) {
      devLog("info", "schema-ingestion.profiling.skipped-all", "All entities already profiled at current fingerprint.", {
        connectionId,
        skipped: coverage.entitiesSkipped,
      });
      return coverage;
    }

    const byQualifiedName = new Map(toProfile.map((entity) => [entityKey(entity.namespace, entity.name), entity]));

    // 3a — free stats from pg_stats (single query across the relevant namespaces).
    const namespaces = [...new Set(toProfile.map((entity) => entity.namespace))];
    try {
      const { rows } = await runQuery(
        record.id,
        record.credentialVersion,
        secret,
        {
          text:
            "SELECT schemaname, tablename, attname, n_distinct, null_frac, " +
            "most_common_vals::text::text[] AS most_common_vals, most_common_freqs " +
            "FROM pg_stats WHERE schemaname = ANY($1)",
          values: [namespaces],
        },
        { timeoutMs: 15_000 },
      );
      coverage.pgStatsAvailable = true;
      for (const raw of rows as PgStatsRow[]) {
        const entity = byQualifiedName.get(entityKey(raw.schemaname, raw.tablename));
        if (!entity) continue;
        const column = entity.columns.find((candidate) => candidate.name === raw.attname);
        if (!column) continue;
        const profile = ensureProfile(entity, column.name);
        const distinctCount = convertDistinct(raw.n_distinct, entity.estimatedRowCount);
        if (distinctCount != null) profile.distinctCount = distinctCount;
        if (typeof raw.null_frac === "number") profile.nullFraction = raw.null_frac;
        const topValues = parseTopValues(raw.most_common_vals, raw.most_common_freqs, entity.estimatedRowCount);
        if (topValues) profile.topValues = topValues;
        coverage.pgStatsColumns += 1;
      }
    } catch (error) {
      // Permissions or missing stats — log and continue to bounded scans (3b) per the spec.
      devLogError("schema-ingestion.profiling.pg-stats-failed", "pg_stats query failed; continuing with bounded scans.", error, {
        connectionId,
      });
    }

    // 3b — bounded MIN/MAX scans, importance-ordered, with per-table and global budgets.
    const globalDeadline = Date.now() + Math.min(GLOBAL_BUDGET_CAP_MS, toProfile.length * PER_ENTITY_BUDGET_MS);
    const now = new Date().toISOString();
    for (const entity of toProfile) {
      const budgetExhausted = Date.now() >= globalDeadline;
      const columns = budgetExhausted ? [] : scannableColumns(entity);
      if (columns.length > 0) {
        try {
          const projections = columns
            .map((column, index) => `MIN(${quoteIdent(column.name)}) AS min_${index}, MAX(${quoteIdent(column.name)}) AS max_${index}`)
            .join(", ");
          const text = `SELECT ${projections} FROM ${quoteQualified(entity.namespace, entity.name)}`;
          const { rows } = await runQuery(record.id, record.credentialVersion, secret, { text }, { timeoutMs: PER_TABLE_BUDGET_MS });
          const row = rows[0] ?? {};
          columns.forEach((column, index) => {
            const min = serializeBound(row[`min_${index}`]);
            const max = serializeBound(row[`max_${index}`]);
            if (min === undefined && max === undefined) return;
            const profile = ensureProfile(entity, column.name);
            if (min !== undefined) profile.min = min;
            if (max !== undefined) profile.max = max;
            coverage.minMaxColumns += 1;
          });
        } catch (error) {
          devLogError("schema-ingestion.profiling.min-max-failed", "Bounded MIN/MAX scan failed for a table; continuing.", error, {
            connectionId,
            entityId: entity.id,
          });
        }
      }

      // Stamp resumability markers whether stats came from pg_stats, scans, both, or neither, so an
      // entity is not re-scanned on retry once its stage completed at this fingerprint.
      entity.profiledFingerprint = computeEntityFingerprint(entity);
      entity.profiledAt = now;
      coverage.entitiesProfiled += 1;
      await onCheckpoint?.();
    }

    devLog("info", "schema-ingestion.profiling.coverage", "Schema ingestion profiling coverage.", {
      connectionId,
      ...coverage,
      totalEntities: rankedEntities.length,
    });
    return coverage;
  } catch (error) {
    devLogError("schema-ingestion.profiling.failed", "Profiling stage failed.", error, { connectionId });
    return coverage;
  }
}
