import "server-only";
import { getConnectionSecret } from "@/lib/connections";
import { requireOwnedConnection } from "@/lib/dal/authorization";
import { AppError } from "@query-wise/shared/dal/core";
import { getDataSourceAdapter, requireCapability } from "@query-wise/shared/data-sources";
import { getLatestConnectionSchema, refreshConnectionSchema } from "@/lib/schema";
import type { ChatMessage, SchemaInfo } from "@/types";
import type {
  BoundedQueryResult,
  CanonicalDataSourceMetadata,
  ProviderQuery,
  QueryValidationResult,
} from "@query-wise/shared/types";

export interface QueryRuntimeContext {
  ownerUserId: string;
  connectionId: string;
  providerId: string;
  dialectId: string;
}

export interface QueryRuntimeDependencies {
  loadGenerationSchema(context: QueryRuntimeContext): Promise<SchemaInfo>;
  validateReadQuery(context: QueryRuntimeContext, query: ProviderQuery): Promise<QueryValidationResult>;
  executeValidatedReadQuery(context: QueryRuntimeContext, query: ProviderQuery, signal?: AbortSignal): Promise<BoundedQueryResult>;
  /**
   * Estimate a statement's cost via `EXPLAIN (FORMAT JSON)` — never ANALYZE
   * (SPEC-02 §1.2). Validates the inner statement through the read-only policy,
   * then plans (does not execute) it in a READ ONLY transaction. Returns the raw
   * planner rows; the caller parses out cost/row estimates.
   */
  explainReadQuery(context: QueryRuntimeContext, sql: string, signal?: AbortSignal): Promise<Array<Record<string, unknown>>>;
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.length > 0);
  }
  if (typeof value !== "string" || !value.trim()) return [];
  const trimmed = value.trim();
  if (trimmed.startsWith("[")) {
    try {
      return stringList(JSON.parse(trimmed));
    } catch {
      return [];
    }
  }
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map((item) => item.trim().replace(/^"(.*)"$/, "$1"))
      .filter(Boolean);
  }
  return [trimmed];
}

/** Enrichment description shape persisted under `metadata.enrichment.descriptions`. */
interface EntityEnrichment {
  description?: string;
  columns?: Array<{ name: string; description?: string }>;
  sampleQuestions?: string[];
}

/** Read the per-entity enrichment map (keyed by entityId = `namespace.name`). */
function readEnrichmentDescriptions(metadata: CanonicalDataSourceMetadata): Record<string, EntityEnrichment> {
  const enrichment = (metadata as unknown as { enrichment?: { descriptions?: unknown } }).enrichment;
  const descriptions = enrichment?.descriptions;
  if (descriptions && typeof descriptions === "object") {
    return descriptions as Record<string, EntityEnrichment>;
  }
  return {};
}

/** Shape of a persisted SPEC-03 column profile as it appears in snapshot metadata. */
interface PersistedColumnProfile {
  distinctCount?: number;
  nullFraction?: number;
  min?: string | number;
  max?: string | number;
  topValues?: Array<{ value: string; count?: number }>;
}

function readColumnProfile(
  entity: CanonicalDataSourceMetadata["entities"][number],
  columnName: string,
): PersistedColumnProfile | undefined {
  const profiles = (entity as unknown as { columnProfiles?: Record<string, PersistedColumnProfile> }).columnProfiles;
  return profiles?.[columnName];
}

/**
 * Per-entity column profiles (SPEC-03): the worker writes numeric/temporal
 * min/max under `entity.columnProfiles[columnName]`. Read defensively — the
 * field may be absent on older snapshots.
 */
function columnRangeFromProfile(
  entity: CanonicalDataSourceMetadata["entities"][number],
  columnName: string,
): { min: string; max: string } | undefined {
  const profile = readColumnProfile(entity, columnName);
  if (!profile || profile.min == null || profile.max == null) return undefined;
  return { min: String(profile.min), max: String(profile.max) };
}

/**
 * Full cached column statistics from the SPEC-03 profile store, surfaced onto
 * SchemaColumn.stats for the `get_column_stats` tool (SPEC-02 §1.3). Returns
 * undefined when the snapshot predates profiling.
 */
function columnStatsFromProfile(
  entity: CanonicalDataSourceMetadata["entities"][number],
  columnName: string,
): PersistedColumnProfile | undefined {
  const profile = readColumnProfile(entity, columnName);
  if (!profile) return undefined;
  const hasAny =
    profile.distinctCount != null ||
    profile.nullFraction != null ||
    profile.min != null ||
    profile.max != null ||
    (profile.topValues?.length ?? 0) > 0;
  return hasAny ? profile : undefined;
}

function toLegacySchema(metadata: CanonicalDataSourceMetadata, summary: string | null): SchemaInfo {
  const entityById = new Map(metadata.entities.map((entity) => [entity.id, entity]));
  const enrichmentByEntityId = readEnrichmentDescriptions(metadata);
  const relationships = metadata.relationships.map((relationship) => ({
    ...relationship,
    fromColumns: stringList(relationship.fromColumns),
    toColumns: stringList(relationship.toColumns),
    // SPEC-03: the worker may flag heuristically-inferred relationships; carry
    // the flag through defensively (absent on FK-declared or older snapshots).
    inferred: (relationship as unknown as { inferred?: unknown }).inferred === true,
  }));
  return {
    connectionId: undefined,
    schemaFingerprint: typeof (metadata as unknown as { ingestion?: { schemaFingerprint?: unknown } }).ingestion?.schemaFingerprint === "string"
      ? (metadata as unknown as { ingestion: { schemaFingerprint: string } }).ingestion.schemaFingerprint
      : null,
    tables: metadata.entities.map((entity) => {
      const enrichment = enrichmentByEntityId[entity.id];
      const columnDescriptions = new Map(
        (enrichment?.columns ?? []).map((column) => [column.name, column.description] as const),
      );
      return {
        name: entity.namespace === "public" ? entity.name : `${entity.namespace}.${entity.name}`,
        rowCount: entity.estimatedRowCount ?? undefined,
        description: enrichment?.description,
        sampleQuestions: enrichment?.sampleQuestions?.length ? enrichment.sampleQuestions : undefined,
        columns: entity.columns.map((column) => {
          // Sampling attaches distinct example values (no frequency) under entity.topValues[column].
          const sampled = entity.topValues?.[column.name];
          return {
            name: column.name,
            type: column.nativeType,
            fullType: column.nativeType,
            nullable: column.nullable,
            isPrimaryKey: column.primaryKey,
            isForeignKey: relationships.some(
              (relationship) =>
                relationship.fromEntityId === entity.id &&
                relationship.fromColumns.includes(column.name),
            ),
            topValues: sampled?.length ? sampled.map((value) => ({ value })) : undefined,
            range: columnRangeFromProfile(entity, column.name),
            stats: columnStatsFromProfile(entity, column.name),
            description: columnDescriptions.get(column.name) || undefined,
          };
        }),
      };
    }),
    relationships: relationships.flatMap((relationship) => {
      const from = entityById.get(relationship.fromEntityId);
      const to = entityById.get(relationship.toEntityId);
      if (!from || !to) return [];
      return relationship.fromColumns.map((fromColumn, index) => ({
        fromTable: from.namespace === "public" ? from.name : `${from.namespace}.${from.name}`,
        fromColumn,
        toTable: to.namespace === "public" ? to.name : `${to.namespace}.${to.name}`,
        toColumn: relationship.toColumns[index] ?? relationship.toColumns[0] ?? "",
        inferred: relationship.inferred,
      }));
    }),
    summary: summary ?? `${metadata.entities.length} entities and ${metadata.relationships.length} relationships`,
  };
}

const defaultDependencies: QueryRuntimeDependencies = {
  async loadGenerationSchema(context) {
    const connection = await requireOwnedConnection(context.connectionId);
    if (connection.schemaSyncStatus !== "ready") {
      throw new AppError(
        "SCHEMA_SNAPSHOT_UNAVAILABLE",
        "Schema ingestion is not ready yet. Wait for schema analysis to complete, then retry.",
        true,
      );
    }
    let snapshot;
    try {
      snapshot = await getLatestConnectionSchema(context.connectionId);
    } catch (error) {
      if (!(error instanceof AppError) || error.code !== "SCHEMA_SNAPSHOT_UNAVAILABLE") {
        throw error;
      }
      // A stable internal key prevents repeated query attempts from enqueueing
      // duplicate repair jobs for the same credential generation.
      await refreshConnectionSchema(
        context.connectionId,
        `query-runtime-missing-snapshot-v${connection.credentialVersion}`,
      );
      snapshot = await getLatestConnectionSchema(context.connectionId);
    }
    const schema = toLegacySchema(snapshot.metadata as unknown as CanonicalDataSourceMetadata, snapshot.summary);
    schema.connectionId = context.connectionId;
    return schema;
  },
  async validateReadQuery(context, query) {
    const connection = await requireOwnedConnection(context.connectionId);
    const adapter = getDataSourceAdapter(connection.providerId);
    requireCapability(adapter, "sql-validation");
    return adapter.validateQuery(query, {
      schemaVersion: 1,
      readOnly: true,
      singleStatement: true,
      blockComments: true,
      blockSystemCatalogs: true,
      maxExecutionMs: 15_000,
      maxReturnedRows: 500,
    });
  },
  async executeValidatedReadQuery(context, query, signal) {
    const { record, secret } = await getConnectionSecret(context.connectionId);
    const adapter = getDataSourceAdapter(record.providerId);
    requireCapability(adapter, "sql-validation");
    requireCapability(adapter, "read-sql-execution");
    return adapter.executeReadQuery(
      record.id,
      record.credentialVersion,
      secret,
      query,
      { timeoutMs: 15_000, maxRows: 500, maxBytes: 2 * 1024 * 1024, signal },
    );
  },
  async explainReadQuery(context, sql, signal) {
    signal?.throwIfAborted();
    const { record, secret } = await getConnectionSecret(context.connectionId);
    const adapter = getDataSourceAdapter(record.providerId);
    requireCapability(adapter, "sql-validation");
    // Validate the INNER statement under the same read-only policy as run_sql, so
    // the EXPLAIN can only ever wrap a safe SELECT/WITH — never a write.
    const validation = await adapter.validateQuery(
      { kind: "sql", dialectId: "postgresql", text: sql },
      {
        schemaVersion: 1,
        readOnly: true,
        singleStatement: true,
        blockComments: true,
        blockSystemCatalogs: true,
        maxExecutionMs: 15_000,
        maxReturnedRows: 500,
      },
    );
    if (!validation.valid || !validation.normalizedQuery) {
      throw new AppError(
        "QUERY_VALIDATION_BLOCKED",
        `The statement cannot be explained under the read-only policy: ${validation.violations.map((v) => v.message).join("; ") || "invalid statement"}`,
        true,
      );
    }
    if (!adapter.executeIntrospectionQuery) {
      throw new AppError("QUERY_EXECUTION_FAILED", "This connection does not support query cost estimation.", true);
    }
    // EXPLAIN (no ANALYZE) plans but never executes the query; run it through the
    // trusted introspection path (READ ONLY, bounded timeout) because the
    // user-facing execute path wraps SQL in a subquery, which EXPLAIN forbids.
    const { rows } = await adapter.executeIntrospectionQuery(
      record.id,
      record.credentialVersion,
      secret,
      { text: `EXPLAIN (FORMAT JSON) ${validation.normalizedQuery.text}` },
      { timeoutMs: 15_000 },
    );
    return rows;
  },
};

let dependencies: QueryRuntimeDependencies = defaultDependencies;

export function registerQueryRuntimeDependencies(value: QueryRuntimeDependencies): void {
  dependencies = value;
}

export function getQueryRuntimeDependencies(): QueryRuntimeDependencies {
  return dependencies;
}

export type DurableChatHistory = ChatMessage[];
