import type { SchemaSyncStatus } from "@query-wise/shared/types";

export type IngestionStage =
  | SchemaSyncStatus
  | "introspecting"
  | "describing"
  | "embedding"
  | "failed";

export interface IngestionStatusView {
  stage: IngestionStage;
  label: string;
  description: string;
  ready: boolean;
  terminal: boolean;
  tone: "success" | "warning" | "danger" | "neutral";
}

const statusViews: Record<string, IngestionStatusView> = {
  never: {
    stage: "never",
    label: "Not analyzed",
    description: "Schema analysis has not started.",
    ready: false,
    terminal: true,
    tone: "neutral",
  },
  queued: {
    stage: "queued",
    label: "Queued",
    description: "Schema ingestion is waiting to start.",
    ready: false,
    terminal: false,
    tone: "warning",
  },
  running: {
    stage: "introspecting",
    label: "Introspecting",
    description: "Reading schemas, tables, columns, and relationships.",
    ready: false,
    terminal: false,
    tone: "warning",
  },
  fingerprinting: {
    stage: "introspecting",
    label: "Fingerprinting",
    description: "Comparing schema structure for incremental ingestion.",
    ready: false,
    terminal: false,
    tone: "warning",
  },
  introspecting: {
    stage: "introspecting",
    label: "Introspecting",
    description: "Reading schemas, tables, columns, and relationships.",
    ready: false,
    terminal: false,
    tone: "warning",
  },
  describing: {
    stage: "describing",
    label: "Describing",
    description: "Preparing schema summaries for query generation.",
    ready: false,
    terminal: false,
    tone: "warning",
  },
  embedding: {
    stage: "embedding",
    label: "Embedding",
    description: "Indexing schema context for retrieval.",
    ready: false,
    terminal: false,
    tone: "warning",
  },
  ready: {
    stage: "ready",
    label: "Ready",
    description: "Schema context is ready for questions.",
    ready: true,
    terminal: true,
    tone: "success",
  },
  error: {
    stage: "failed",
    label: "Failed",
    description: "Schema ingestion failed. Refresh the schema before querying.",
    ready: false,
    terminal: true,
    tone: "danger",
  },
  failed: {
    stage: "failed",
    label: "Failed",
    description: "Schema ingestion failed. Refresh the schema before querying.",
    ready: false,
    terminal: true,
    tone: "danger",
  },
};

export function getIngestionStatusView(status: string | null | undefined): IngestionStatusView {
  return statusViews[status ?? "never"] ?? {
    stage: "queued",
    label: status?.replaceAll("_", " ") ?? "Unknown",
    description: "Schema ingestion status is pending.",
    ready: false,
    terminal: false,
    tone: "warning",
  };
}

export function isSchemaReady(status: string | null | undefined): boolean {
  return getIngestionStatusView(status).ready;
}
