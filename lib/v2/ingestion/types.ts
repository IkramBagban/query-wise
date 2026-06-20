import type { CanonicalDataSourceMetadata, MetadataEntity, ResourceId } from "@/types/v2";

export const SCHEMA_INGESTION_QUEUE_NAME = "schema-ingestion";
export const SCHEMA_INGESTION_JOB_TYPE = "schema-ingestion.refresh";
export const SCHEMA_INGESTION_PAYLOAD_VERSION = 1;

export type SchemaIngestionIntent = "initial-connect" | "credential-refresh" | "manual-refresh" | "schema-fingerprint";
export type SchemaIngestionStage = "queued" | "introspecting" | "fingerprinting" | "describing" | "embedding" | "ready" | "failed";

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
  description: string;
  columns: Array<{ name: string; description: string }>;
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
