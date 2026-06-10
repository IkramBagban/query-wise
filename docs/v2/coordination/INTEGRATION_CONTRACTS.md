# QueryWise V2 Integration Contracts

This file defines cross-workstream boundaries. The coordinator owns it. Agents
must not silently change a published contract.

## SQL-Provider-Neutral Data Source Model

Use `data source` in domain-level code. A PostgreSQL database is one supported
SQL data source implementation. NoSQL providers are out of scope for V2.

```ts
type DataSourceProviderId = "postgresql";

type DataSourceCapability =
  | "connection-test"
  | "metadata-introspection"
  | "read-sql"
  | "sql-validation"
  | "estimated-counts"
  | "relationships"
  | "sampling";

interface DataSourceAdapter {
  readonly providerId: DataSourceProviderId;
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
    secret: DataSourceSecret,
    query: ProviderQuery,
    options: QueryExecutionOptions,
  ): Promise<QueryResult>;
  dispose(connectionId: string): Promise<void>;
}
```

`ProviderQuery` is SQL with an explicit dialect. Future SQL providers extend
the dialect union and register a matching adapter and generation strategy.

```ts
type ProviderQuery =
  { kind: "sql"; dialect: "postgresql"; text: string };
```

Adding a provider extends unions and registers an adapter. Product modules
must not branch on provider IDs when a capability check can express the
requirement.

## Canonical Metadata

Schema UI and LLM context selection consume canonical metadata rather than raw
PostgreSQL catalog output.

```ts
interface CanonicalDataSourceMetadata {
  sourceName: string;
  namespaces: MetadataNamespace[];
  entities: MetadataEntity[];
  relationships: MetadataRelationship[];
  providerDetails?: Record<string, unknown>;
}
```

An entity represents a relational table, view, materialized view, or comparable
SQL-provider object. Provider details are server-side by default and must be
explicitly mapped into safe DTOs.

## Query Generation Boundary

The query-generation orchestrator receives:

- provider ID and capabilities
- a bounded, relevance-selected canonical metadata context
- conversation context
- a provider query-generation strategy

It returns a `ProviderQuery`, not a raw SQL string. The PostgreSQL strategy can
reuse existing SQL generation and safety code behind this boundary.

## Published API Rules

- Private endpoints authenticate and authorize before resource access.
- Resource APIs use stable IDs, never connection URLs.
- List endpoints use cursor pagination and compact DTOs.
- Feature routes call server-only services/DALs; they do not access the
  application database or customer data source directly.
- Public sharing uses a separate, narrowly scoped DTO path.

## Contract Change Process

1. Record the proposed change and affected consumers in the agent work log.
2. Notify the coordinator before implementation if the change blocks another
   workstream.
3. Coordinator reviews and updates this file.
4. Consumers integrate against the accepted contract.
