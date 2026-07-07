import type { CanonicalDataSourceMetadata, MetadataEntity, ResourceId } from "../types";

export const SCHEMA_INGESTION_QUEUE_NAME = "schema-ingestion";
export const SCHEMA_INGESTION_JOB_TYPE = "schema-ingestion.refresh";
export const SCHEMA_INGESTION_PAYLOAD_VERSION = 1;

// SPEC-03 §6.2 — env-gated recurring schema drift detection.
export const SCHEMA_REFRESH_QUEUE_NAME = "schema-refresh";
export const SCHEMA_REFRESH_JOB_NAME = "schema-refresh.scan";

export type SchemaIngestionIntent = "initial-connect" | "credential-refresh" | "manual-refresh" | "schema-fingerprint" | "scheduled-refresh";
export type SchemaIngestionStage = "queued" | "introspecting" | "fingerprinting" | "profiling" | "sampling" | "describing" | "embedding" | "ready" | "failed";

export interface SchemaIngestionJobData {
  connectionId: ResourceId;
  ownerUserId?: string;
  intent: SchemaIngestionIntent;
  requestedAt: string;
  requestIdempotencyKey?: string;
  schemaFingerprint?: string;
}

export interface SchemaIngestionProgress {
  schemaVersion: 1;
  stage: SchemaIngestionStage;
  connectionId: ResourceId;
  schemaFingerprint: string | null;
  describedEntityIds: string[];
  embeddedEntityIds: string[];
  updatedAt: string;
}

export interface SchemaEntityDescription {
  entityId: string;
  entityFingerprint?: string;
  description: string;
  // `description: null` marks a column omitted from LLM enrichment (e.g. wide-table truncation,
  // SPEC-03 §6.3) so the web tier can render nothing instead of useless boilerplate. Widening from
  // `string` to `string | null` is backward-compatible — historical string values still deserialize.
  columns: Array<{ name: string; description: string | null }>;
  sampleQuestions: string[];
}

export interface SchemaEmbeddingRecord {
  connectionId: ResourceId;
  entityId: string;
  namespace: string;
  entityName: string;
  embeddingKind: "table-summary" | "question-summary";
  text: string;
  vector: number[];
  dimensions: number;
  embeddingModel: string;
  payload: {
    metadata: MetadataEntity;
    description: SchemaEntityDescription;
    schemaFingerprint: string;
  };
}

export interface EnrichedSchemaMetadata extends CanonicalDataSourceMetadata {
  ingestion?: SchemaIngestionProgress;
  enrichment?: {
    schemaVersion: 1;
    descriptions: Record<string, SchemaEntityDescription>;
    embeddingIndex: Array<{
      entityId: string;
      embeddingKind: SchemaEmbeddingRecord["embeddingKind"];
      text: string;
      dimensions: number;
    }>;
  };
}
