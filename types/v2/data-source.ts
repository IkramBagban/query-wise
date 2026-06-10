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
export interface MetadataEntity {
  id: string;
  namespace: string;
  name: string;
  kind: "table" | "view" | "materialized-view";
  columns: MetadataColumn[];
  estimatedRowCount: number | null;
  estimatedRowCountMeasuredAt: IsoDateTime | null;
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
  dispose(connectionId: ResourceId): Promise<void>;
}
