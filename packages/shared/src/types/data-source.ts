import type { IsoDateTime, JsonValue, ResourceId } from "./core";

export type DataSourceProviderId = "postgresql";
export type SqlDialectId = "postgresql";
export type DataSourceCapability =
  | "connection-test"
  | "metadata-introspection"
  | "relationships"
  | "estimated-row-counts"
  | "bounded-sampling"
  | "sql-generation"
  | "sql-preview"
  | "sql-validation"
  | "read-sql-execution";

export interface ProviderQuery {
  kind: "sql";
  dialectId: SqlDialectId;
  text: string;
}

export interface DataSourceSecret {
  connectionString: string;
}

export interface ConnectionTestResult {
  success: boolean;
  latencyMs: number;
  serverVersion: string | null;
  errorCode: string | null;
}

export interface MetadataIntrospectionOptions {
  includeNamespaces?: string[];
  enableSampling: boolean;
  maxNamespaces: number;
  maxEntities: number;
  maxColumnsPerEntity: number;
  maxRelationships: number;
  timeoutMs: number;
}

export interface QueryExecutionOptions {
  timeoutMs: number;
  maxRows: number;
  maxBytes: number;
  signal?: AbortSignal;
}

/**
 * A trusted, worker-authored read-only query used by the ingestion pipeline for profiling and join
 * inference (SPEC-03 §3/§5). Unlike user queries it supports bind parameters and system-catalog
 * reads (e.g. `pg_stats`); the adapter still runs it inside a READ ONLY transaction with a statement
 * timeout. `text` is never derived from end-user input.
 */
export interface IntrospectionQuery {
  text: string;
  values?: unknown[];
}

export interface IntrospectionQueryResult {
  rows: Array<Record<string, unknown>>;
}

export interface ResultColumn {
  name: string;
  canonicalType: MetadataColumn["canonicalType"];
  nullable: boolean;
}

export interface BoundedResultPreview {
  schemaVersion: 1;
  columns: ResultColumn[];
  rows: Record<string, JsonValue>[];
  previewRowCount: number;
  returnedRowCount: number;
  totalRowCount: number | null;
  truncated: boolean;
  bytes: number;
}

export type MetadataSection = "namespaces" | "entities" | "columns" | "relationships" | "profiles";

export interface MetadataCompleteness {
  complete: boolean;
  truncatedSections: MetadataSection[];
  omittedCounts: Partial<Record<MetadataSection, number>>;
}

export interface CanonicalDataSourceMetadata {
  schemaVersion: 1;
  snapshotVersion: number;
  partition: { index: number; count: number };
  providerId: DataSourceProviderId;
  dialectId: SqlDialectId;
  sourceName: string;
  namespaces: MetadataNamespace[];
  entities: MetadataEntity[];
  relationships: MetadataRelationship[];
  completeness: MetadataCompleteness;
  measuredAt: IsoDateTime;
}

export interface MetadataNamespace { name: string }

/**
 * Per-column statistics produced by the profiling stage (SPEC-03 §3). All fields are optional so
 * historical snapshots (which never carried this key) keep deserializing. `min`/`max` are rendered
 * by the web tier's `toLegacySchema` into the existing `range[x -> y]` prompt field.
 */
export interface ColumnProfile {
  /** Estimated number of distinct values (pg_stats n_distinct, converted from negative fractions). */
  distinctCount?: number;
  /** Fraction of rows that are NULL (pg_stats null_frac), 0-1. */
  nullFraction?: number;
  /** Minimum observed value (bounded MIN scan). Serialized as string/number for JSON stability. */
  min?: string | number;
  /** Maximum observed value (bounded MAX scan). */
  max?: string | number;
  /** Most-common values with optional frequency counts (pg_stats most_common_vals/freqs). */
  topValues?: Array<{ value: string; count?: number }>;
}

export interface MetadataEntity {
  id: string;
  namespace: string;
  name: string;
  kind: "table" | "view" | "materialized-view";
  columns: MetadataColumn[];
  estimatedRowCount: number | null;
  estimatedRowCountMeasuredAt: IsoDateTime | null;
  topValues?: Record<string, string[]>;
  /**
   * Importance score (0-1) assigned by SPEC-03 §1 scoring. Enrichment stages process entities in
   * descending order; the web tier can use it for Tier-B selection tie-breaking. Optional/additive.
   */
  importanceScore?: number;
  /** Per-column profile statistics (SPEC-03 §3). Additive/optional. */
  columnProfiles?: Record<string, ColumnProfile>;
  /** Entity fingerprint at which profiling last succeeded — enables per-entity resumable skipping. */
  profiledFingerprint?: string;
  profiledAt?: IsoDateTime;
  /** Entity fingerprint at which value sampling last succeeded — enables resumable skipping. */
  sampledFingerprint?: string;
  sampledAt?: IsoDateTime;
}
export interface MetadataColumn {
  name: string;
  ordinal: number;
  canonicalType: "boolean" | "integer" | "decimal" | "string" | "date" | "time" | "datetime" | "json" | "binary" | "uuid" | "unknown";
  nativeType: string;
  nullable: boolean;
  primaryKey: boolean;
  generated: boolean;
}
export interface MetadataRelationship {
  id: string;
  fromEntityId: string;
  fromColumns: string[];
  toEntityId: string;
  toColumns: string[];
  /**
   * True when this relationship was inferred from data (SPEC-03 §5) rather than read from a declared
   * foreign-key constraint. The web tier renders inferred joins marked "(inferred)". Additive/optional.
   */
  inferred?: boolean;
  /** Value-overlap containment ratio (0-1) for inferred relationships. Declared FKs omit this. */
  confidence?: number;
}

export interface QuerySafetyPolicy {
  schemaVersion: 1;
  readOnly: true;
  singleStatement: true;
  maxExecutionMs: number;
  maxReturnedRows: number;
  blockComments: boolean;
  blockSystemCatalogs: boolean;
}
export interface QueryValidationResult {
  valid: boolean;
  normalizedQuery: ProviderQuery | null;
  violations: Array<{ code: string; message: string }>;
}
export interface BoundedQueryResult {
  columns: ResultColumn[];
  rows: Record<string, JsonValue>[];
  returnedRowCount: number;
  totalRowCount: number | null;
  truncated: boolean;
  executionTimeMs: number;
  bytesReturned: number;
}
export interface SqlDataSourceAdapter {
  readonly providerId: DataSourceProviderId;
  readonly dialectId: SqlDialectId;
  readonly capabilities: ReadonlySet<DataSourceCapability>;
  testConnection(secret: DataSourceSecret): Promise<ConnectionTestResult>;
  introspectMetadata(
    secret: DataSourceSecret,
    options: MetadataIntrospectionOptions,
  ): Promise<CanonicalDataSourceMetadata>;
  validateQuery(
    query: ProviderQuery,
    policy: QuerySafetyPolicy,
  ): Promise<QueryValidationResult>;
  executeReadQuery(
    connectionId: ResourceId,
    credentialVersion: number,
    secret: DataSourceSecret,
    query: ProviderQuery,
    options: QueryExecutionOptions,
  ): Promise<BoundedQueryResult>;
  /**
   * Runs a trusted worker-authored read-only introspection query (SPEC-03 profiling/join inference).
   * Optional so the adapter contract stays additive for providers without profiling support.
   */
  executeIntrospectionQuery?(
    connectionId: ResourceId,
    credentialVersion: number,
    secret: DataSourceSecret,
    query: IntrospectionQuery,
    options: { timeoutMs: number },
  ): Promise<IntrospectionQueryResult>;
  dispose(connectionId: ResourceId): Promise<void>;
}
