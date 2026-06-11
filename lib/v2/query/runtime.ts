import "server-only";
import { getConnectionSecret } from "@/lib/v2/connections";
import { getDataSourceAdapter, requireCapability } from "@/lib/v2/data-sources";
import { getLatestConnectionSchema } from "@/lib/v2/schema";
import type { ChatMessage, SchemaInfo } from "@/types";
import type {
  BoundedQueryResult,
  CanonicalDataSourceMetadata,
  ProviderQuery,
} from "@/types/v2";

export interface QueryRuntimeContext {
  ownerUserId: string;
  connectionId: string;
  providerId: string;
  dialectId: string;
}

export interface QueryRuntimeDependencies {
  loadGenerationSchema(context: QueryRuntimeContext): Promise<SchemaInfo>;
  executeValidatedReadQuery(context: QueryRuntimeContext, query: ProviderQuery): Promise<BoundedQueryResult>;
}

function toLegacySchema(metadata: CanonicalDataSourceMetadata, summary: string | null): SchemaInfo {
  const entityById = new Map(metadata.entities.map((entity) => [entity.id, entity]));
  return {
    tables: metadata.entities.map((entity) => ({
      name: entity.namespace === "public" ? entity.name : `${entity.namespace}.${entity.name}`,
      rowCount: entity.estimatedRowCount ?? undefined,
      columns: entity.columns.map((column) => ({
        name: column.name,
        type: column.nativeType,
        fullType: column.nativeType,
        nullable: column.nullable,
        isPrimaryKey: column.primaryKey,
        isForeignKey: metadata.relationships.some(
          (relationship) =>
            relationship.fromEntityId === entity.id &&
            relationship.fromColumns.includes(column.name),
        ),
      })),
    })),
    relationships: metadata.relationships.flatMap((relationship) => {
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
    const snapshot = await getLatestConnectionSchema(context.connectionId);
    return toLegacySchema(snapshot.metadata as unknown as CanonicalDataSourceMetadata, snapshot.summary);
  },
  async executeValidatedReadQuery(context, query) {
    const { record, secret } = await getConnectionSecret(context.connectionId);
    const adapter = getDataSourceAdapter(record.providerId);
    requireCapability(adapter, "sql-validation");
    requireCapability(adapter, "read-sql-execution");
    return adapter.executeReadQuery(
      record.id,
      record.credentialVersion,
      secret,
      query,
      { timeoutMs: 15_000, maxRows: 500, maxBytes: 2 * 1024 * 1024 },
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
