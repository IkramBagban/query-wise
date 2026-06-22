# SQL Data Source Adapter Contract

## Scope

V2 implements PostgreSQL only. The abstraction supports future **SQL dialects**
without introducing generic NoSQL concepts. Product workflows use relational
metadata, SQL query payloads, and advertised capabilities.

```ts
type DataSourceProviderId = "postgresql";
type SqlDialectId = "postgresql";

type DataSourceCapability =
  | "connection-test"
  | "metadata-introspection"
  | "relationships"
  | "estimated-row-counts"
  | "bounded-sampling"
  | "sql-generation"
  | "sql-preview"
  | "sql-validation"
  | "read-sql-execution";

interface ProviderQuery {
  kind: "sql";
  dialectId: SqlDialectId;
  text: string;
}
```

Adding a future SQL provider extends provider/dialect unions, registers an
adapter and generation strategy, and maps native metadata. It MUST NOT require
changes to ownership, conversation, dashboard, sharing, or pagination models.

## Adapter Interface

```ts
interface SqlDataSourceAdapter {
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
```

The registry rejects unknown providers and mismatched query dialects with typed
errors. Product code checks capabilities; it MUST NOT branch on
`providerId === "postgresql"` when a capability expresses the requirement.

## Generation And SQL Preview

```ts
interface SqlGenerationStrategy {
  readonly dialectId: SqlDialectId;
  generate(input: SqlGenerationInput): Promise<ProviderQuery>;
}

interface SqlPreviewDto {
  dialectId: SqlDialectId;
  language: "sql";
  text: string;
  generatedAt: IsoDateTime;
  validation: "pending" | "valid" | "blocked";
}
```

- Generation requires `sql-generation`; preview requires `sql-preview`.
- A generated query's `dialectId` MUST equal the active adapter dialect.
- The right-sidebar label may remain **SQL Preview** because all supported data
  sources are SQL. It MUST render the dialect label and syntax mode.
- If preview is unsupported, return capability error
  `DATA_SOURCE_CAPABILITY_UNSUPPORTED`; do not return an empty fake SQL string.
- SQL text is owner/private-viewer data. Public shares MUST NOT expose it.
- The generation prompt and identifier quoting rules are dialect-strategy
  responsibilities. Core product modules MUST NOT assume PostgreSQL syntax.

## Query Safety Policy

```ts
interface QuerySafetyPolicy {
  schemaVersion: 1;
  readOnly: true;
  singleStatement: true;
  maxExecutionMs: number; // default 15_000; allowed 1_000..60_000
  maxReturnedRows: number; // default and maximum 500 in V2
  blockComments: boolean;
  blockSystemCatalogs: boolean;
}

interface QueryValidationResult {
  valid: boolean;
  normalizedQuery: ProviderQuery | null;
  violations: Array<{ code: string; message: string }>;
}
```

Validation is dialect-aware and MUST occur after generation and before
execution. Execution MUST independently enforce read-only transaction/session
behavior, statement timeout, single-statement behavior, and the row cap. Prompt
instructions and string keyword checks are defense-in-depth, not the execution
boundary.

## Bounded Execution Result

```ts
interface BoundedQueryResult {
  columns: ResultColumn[];
  rows: Record<string, JsonValue>[];
  returnedRowCount: number;
  totalRowCount: number | null;
  truncated: boolean;
  executionTimeMs: number;
  bytesReturned: number;
}
```

`returnedRowCount === rows.length`. `truncated` is true when the adapter knows
more rows existed than returned. `totalRowCount` is null unless cheaply known;
the adapter MUST NOT run an unbounded count merely to populate it.

## Metadata Bounds

Default V2 introspection limits:

| Measure | Bound |
| --- | --- |
| namespaces | 100 |
| entities | 2,000 |
| columns per entity | 500 |
| relationships | 10,000 |
| sample rows per sampled entity | 3 |
| sampled entities per foreground sync | 25 |
| top values per sampled column | 5 |
| foreground sync timeout | 30 seconds |

Exceeding a structural limit returns partial metadata with an explicit
`truncatedSections` list or a typed limit error; it MUST NOT silently omit data.
Exact full-table counts and unrestricted profiling are not foreground
introspection operations.

## Security Boundary

- Secrets are decrypted only in a server-only connection service immediately
  before adapter use.
- Logs and errors identify `connectionId`, provider, dialect, timing, counts,
  and result state; they never include secret material or returned row values.
- Pool keys use `(connectionId, credentialVersion)`. Credential update/delete
  MUST call `dispose(connectionId)`.
- SSRF/network policy is enforced before adapter connection attempts.

