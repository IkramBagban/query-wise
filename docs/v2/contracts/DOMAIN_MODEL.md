# Domain Model Contract

## Common Types

```ts
type ContractVersion = "querywise.v2";
type ResourceId = string; // server-generated UUID
type ClerkUserId = string;
type IsoDateTime = string; // UTC RFC 3339
type DataSourceProviderId = "postgresql";
type SqlDialectId = "postgresql";

interface DurableResource {
  id: ResourceId;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

interface OwnedResource extends DurableResource {
  ownerUserId: ClerkUserId; // server-only; omitted from browser DTOs
}
```

IDs and timestamps are server-generated. Persisted records use database
timestamps. DTO timestamps are UTC RFC 3339 strings.

## Ownership Graph

| Resource | Owner/access root | Required relationship invariant |
| --- | --- | --- |
| `UserProfile` | Clerk user | `id` or unique key maps to exactly one Clerk user |
| `DataSourceConnection` | user | one owner; credentials are private record only |
| `SchemaSnapshot` | connection owner | belongs to exactly one connection |
| `Conversation` | user | belongs to one immutable connection |
| `Message` | conversation owner | belongs to exactly one conversation |
| `QueryRun` | conversation owner | connection MUST equal conversation connection |
| `Dashboard` | user | owner has all permissions |
| `DashboardWidget` | dashboard owner | snapshot data only in V2 |
| `DashboardAccessGrant` | dashboard | view-only recipient access |
| `DashboardShareLink` | dashboard | public/unlisted view access only |
| `AuditEvent` | actor/resource scope | append-only; no secrets |

Private repositories MUST expose owner-scoped operations, not unrestricted
`getById`. Public-share resolution is a separate path and MUST NOT call private
dashboard DTO mappers.

## Connection

```ts
type ConnectionStatus = "pending" | "connected" | "error" | "disabled";
type SchemaSyncStatus = "never" | "queued" | "running" | "ready" | "error";

interface DataSourceConnectionRecord extends OwnedResource {
  providerId: DataSourceProviderId;
  dialectId: SqlDialectId;
  name: string;                  // 1..100 characters
  hostDisplay: string;           // safe display value, no userinfo
  port: number | null;
  databaseName: string;
  encryptedSecret: EncryptedPayload;
  credentialVersion: number;     // increments on secret change
  status: ConnectionStatus;
  lastTestedAt: IsoDateTime | null;
  lastTestErrorCode: string | null;
  lastSchemaSyncAt: IsoDateTime | null;
  schemaSyncStatus: SchemaSyncStatus;
}

interface ConnectionDto {
  contractVersion: ContractVersion;
  id: ResourceId;
  providerId: DataSourceProviderId;
  dialectId: SqlDialectId;
  name: string;
  hostDisplay: string;
  port: number | null;
  databaseName: string;
  status: ConnectionStatus;
  lastTestedAt: IsoDateTime | null;
  lastSchemaSyncAt: IsoDateTime | null;
  schemaSyncStatus: SchemaSyncStatus;
  capabilities: DataSourceCapability[];
}
```

`encryptedSecret`, credential version, usernames, passwords, URLs, SSL
material, and provider-private configuration MUST NOT appear in `ConnectionDto`.
Pool/cache keys use connection ID plus credential version, never a secret.

## Canonical Relational Metadata

```ts
interface CanonicalDataSourceMetadata {
  schemaVersion: 1;
  providerId: DataSourceProviderId;
  dialectId: SqlDialectId;
  sourceName: string;
  namespaces: MetadataNamespace[];
  entities: MetadataEntity[];
  relationships: MetadataRelationship[];
  measuredAt: IsoDateTime;
}

interface MetadataEntity {
  id: string; // stable within snapshot, derived from qualified identity
  namespace: string;
  name: string;
  kind: "table" | "view" | "materialized-view";
  columns: MetadataColumn[];
  estimatedRowCount: number | null;
  estimatedRowCountMeasuredAt: IsoDateTime | null;
}

interface MetadataColumn {
  name: string;
  ordinal: number;
  canonicalType:
    | "boolean" | "integer" | "decimal" | "string" | "date"
    | "time" | "datetime" | "json" | "binary" | "uuid" | "unknown";
  nativeType: string;
  nullable: boolean;
  primaryKey: boolean;
  generated: boolean;
}
```

Metadata snapshots MAY contain separately classified, bounded profiling data.
Sample values and provider details are server-only by default and require an
explicit safe DTO mapper. A failed refresh MUST preserve the latest successful
snapshot.

## Conversation, Message, And Query Run

```ts
type ConversationStatus = "active" | "archived";
type MessageRole = "user" | "assistant" | "system";

interface ConversationRecord extends OwnedResource {
  connectionId: ResourceId; // immutable after first message
  title: string;            // 1..120 characters
  status: ConversationStatus;
  lastActivityAt: IsoDateTime;
}

interface MessageRecord extends DurableResource {
  conversationId: ResourceId;
  sequence: number; // unique, strictly increasing within conversation
  role: MessageRole;
  content: string;
  queryRunId: ResourceId | null;
  metadata: { schemaVersion: 1; errorCode?: string; chartConfig?: ChartConfig };
}
```

Messages MUST NOT contain unrestricted result sets, secrets, or API keys.
Query-run fields and invariants are defined in `QUERY_RUNS.md`.

## Dashboard And Sharing

```ts
interface DashboardRecord extends OwnedResource {
  name: string; // 1..120 characters
}

interface DashboardWidgetRecord extends DurableResource {
  dashboardId: ResourceId;
  queryRunId: ResourceId | null;
  title: string;
  chartConfig: ChartConfig;
  layout: { schemaVersion: 1; x: number; y: number; w: number; h: number };
  snapshot: BoundedResultPreview;
  queryDefinition: ProviderQuery | null; // owner-only, future manual refresh
}

type DashboardPermission = "view";
```

V2 widgets are snapshots. Public DTOs omit `queryRunId`, `queryDefinition`,
connection identity, and owner-only fields. Sharing contracts are defined in
`PUBLIC_SHARING.md`.

## Deletion And Referential Rules

- Deleting a connection MUST be blocked while active conversations reference it,
  unless a later coordinated archive strategy is introduced.
- Deleting a conversation cascades messages and query runs, but MUST NOT delete
  dashboard widget snapshots.
- Deleting a dashboard cascades widgets, grants, and share links.
- Deleting/revoking a share immediately invalidates future public resolution and
  unlock tokens.
- Audit events are append-only and retain redacted resource IDs after deletion.

