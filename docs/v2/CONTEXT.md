# QueryWise V2 Shared Context

All V2 agents must follow this document. Feature specs may add constraints but must not contradict it.

## Product Model

QueryWise is a user-level BI workspace. A signed-in user can own:

- multiple database connections
- multiple conversations
- multiple dashboards
- dashboard share configurations

The selected database connection provides context for a conversation. Dashboard viewers never receive the source database credential.

## Architecture Principles

### Server-Side Trust Boundary

- Treat every Route Handler, Server Action, and DAL call as an authorization boundary.
- Never trust a client-provided `userId`.
- Resolve the Clerk user ID on the server.
- Query private resources by both resource ID and owner user ID.
- Public share access uses a separate, narrowly scoped access path.

### Data Access Layer

Create a server-only DAL for QueryWise application data. Route handlers validate transport input, call the DAL, and return minimal DTOs.

Required authorization helpers:

```ts
requireUser(): Promise<{ userId: string }>
requireOwnedConnection(connectionId: string): Promise<ConnectionSecretRecord>
requireConversationAccess(conversationId: string): Promise<ConversationRecord>
requireDashboardAccess(dashboardId: string, permission: "view" | "edit"): Promise<DashboardRecord>
```

Do not scatter raw ownership checks across UI components.

### Secret Handling

- Store connection credentials encrypted at rest.
- Keep the encryption key in a server-only environment variable.
- Never log connection URLs, database passwords, LLM API keys, share passwords, or decrypted secrets.
- Never return encrypted or decrypted credentials in API DTOs.
- Use stable resource IDs, not connection URLs, as pool/cache keys.

### Database Provider Boundary

Product features depend on a provider-neutral contract:

```ts
export type DatabaseProviderId = "postgresql";

export interface DatabaseAdapter {
  readonly id: DatabaseProviderId;
  testConnection(secret: DatabaseConnectionSecret): Promise<ConnectionTestResult>;
  introspectSchema(secret: DatabaseConnectionSecret): Promise<SchemaInfo>;
  executeQuery(
    secret: DatabaseConnectionSecret,
    sql: string,
    options?: QueryExecutionOptions,
  ): Promise<QueryResult>;
  validateSql(sql: string): SqlValidationResult;
  disposeConnection(connectionId: string): Promise<void>;
}
```

The registry resolves adapters:

```ts
getDatabaseAdapter(provider: DatabaseProviderId): DatabaseAdapter
```

PostgreSQL-specific catalog queries, quoting, pools, and read-only execution stay inside the PostgreSQL adapter.

### Application Persistence

The QueryWise application database is separate from connected customer databases. Use migrations and a typed persistence layer chosen by the foundation agent.

Required entities:

```text
users
database_connections
database_schema_snapshots
conversations
messages
query_runs
dashboards
dashboard_widgets
dashboard_access_grants
dashboard_share_links
audit_logs
```

`users` may be a lightweight local profile keyed by Clerk user ID. Clerk remains the identity source.

### Common Resource Fields

Use UUIDs or another collision-resistant server-generated ID. Durable resources include:

```text
id
owner_user_id
created_at
updated_at
```

Use database timestamps rather than client-generated timestamps.

## API Conventions

- Private APIs require Clerk authentication.
- Validate every request with Zod.
- Private resource endpoints return `404` when the resource is absent or not owned, avoiding ownership disclosure.
- Prefer IDs in paths and bodies: `connectionId`, `conversationId`, `dashboardId`.
- Use cursor pagination for conversations, messages, dashboards, and audit events.
- Do not return full query-result payloads in list endpoints.

Suggested route groups:

```text
/api/connections
/api/connections/[connectionId]
/api/connections/[connectionId]/test
/api/connections/[connectionId]/schema
/api/conversations
/api/conversations/[conversationId]
/api/conversations/[conversationId]/messages
/api/query
/api/dashboards
/api/dashboards/[dashboardId]
/api/dashboards/[dashboardId]/widgets
/api/dashboards/[dashboardId]/shares
/api/public/shares/[token]
```

## Query Execution Contract

The V1 constrained-agent query flow remains the baseline, but V2 inputs change:

```ts
interface QueryRequest {
  conversationId: string;
  question: string;
  provider: LlmProvider;
  model: string;
  apiKey: string;
}
```

Server flow:

1. Authenticate user.
2. Authorize conversation.
3. Resolve conversation connection.
4. Decrypt connection secret server-side.
5. Load relevant schema snapshot.
6. Generate and validate SQL.
7. Execute through the database adapter.
8. Persist user message, assistant message, and query run.
9. Return a minimal response DTO.

Existing SQL safety behavior must not regress.

## Shared DTO Direction

Feature agents may refine fields with V2-F, but must preserve these boundaries:

```ts
interface ConnectionListItem {
  id: string;
  name: string;
  provider: DatabaseProviderId;
  host: string;
  databaseName: string;
  status: "pending" | "connected" | "error";
  lastTestedAt: string | null;
  lastSchemaSyncAt: string | null;
}

interface ConversationListItem {
  id: string;
  title: string;
  connectionId: string;
  connectionName: string;
  updatedAt: string;
}

interface DashboardListItem {
  id: string;
  name: string;
  widgetCount: number;
  updatedAt: string;
}
```

## UI Layout Target

The primary workspace is a three-column application shell:

```text
left navigation | conversation workspace | contextual database panel
```

Left navigation contains app navigation, new chat, recent dashboards, chat history, and Clerk profile controls.

Right sidebar contains Schema, SQL Preview, and DB Summary tabs for the active connection/conversation.

## Out Of Scope For V2

- Clerk Organizations and organization-level ownership
- MySQL implementation
- cross-database joins
- write queries
- billing implementation
- granular row-level permissions inside connected customer databases
- real-time collaborative dashboard editing

