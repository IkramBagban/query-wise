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

function toLegacySchema(metadata: CanonicalDataSourceMetadata, summary: string | null): SchemaInfo {
  const entityById = new Map(metadata.entities.map((entity) => [entity.id, entity]));
  const relationships = metadata.relationships.map((relationship) => ({
    ...relationship,
    fromColumns: stringList(relationship.fromColumns),
    toColumns: stringList(relationship.toColumns),
  }));
  return {
    connectionId: undefined,
    schemaFingerprint: typeof (metadata as unknown as { ingestion?: { schemaFingerprint?: unknown } }).ingestion?.schemaFingerprint === "string"
      ? (metadata as unknown as { ingestion: { schemaFingerprint: string } }).ingestion.schemaFingerprint
      : null,
    tables: metadata.entities.map((entity) => ({
      name: entity.namespace === "public" ? entity.name : `${entity.namespace}.${entity.name}`,
      rowCount: entity.estimatedRowCount ?? undefined,
      columns: entity.columns.map((column) => ({
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
      })),
    })),
    relationships: relationships.flatMap((relationship) => {
      const from = entityById.get(relationship.fromEntityId);
      const to = entityById.get(relationship.toEntityId);
      if (!from || !to) return [];
      return relationship.fromColumns.map((fromColumn, index) => ({
        fromTable: from.namespace === "public" ? from.name : `${from.namespace}.${from.name}`,
        fromColumn,
        toTable: to.namespace === "public" ? to.name : `${to.namespace}.${to.name}`,
        toColumn: relationship.toColumns[index] ?? relationship.toColumns[0] ?? "",
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
};

let dependencies: QueryRuntimeDependencies = defaultDependencies;

export function registerQueryRuntimeDependencies(value: QueryRuntimeDependencies): void {
  dependencies = value;
}

export function getQueryRuntimeDependencies(): QueryRuntimeDependencies {
  return dependencies;
}

export type DurableChatHistory = ChatMessage[];
