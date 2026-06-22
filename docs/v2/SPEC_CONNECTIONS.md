# SPEC V2-C: Multiple Database Connections And Metadata

## Mission

Implement multiple saved PostgreSQL connections per user, while establishing a
capability-based SQL data-source adapter boundary for future SQL providers.

## Dependencies

- Requires V2-F persistence, encryption, and domain contracts.
- Requires V2-A `requireOwnedConnection`.
- Coordinates DTOs with V2-U and query-flow integration with V2-H.

## Owned Areas

Suggested ownership:

```text
lib/database-adapters/**
lib/connections/**
lib/schema/** provider-neutral orchestration
app/api/connections/**
connection/schema-sync tests
```

Do not implement generic MySQL behavior in V2.

## Required Deliverables

### 1. Data Source Adapter Contract

Implement the shared adapter interface from `CONTEXT.md`.

Core connection, conversation, dashboard, and UI modules may rely on the
shared SQL/relational contract, but must not assume PostgreSQL syntax, catalogs,
types, quoting, or connection behavior. They consume canonical relational
metadata and provider capabilities. PostgreSQL-specific query payload behavior
and metadata mapping remain inside its adapter and query-generation strategy.

PostgreSQL-specific concerns stay inside:

```text
lib/database-adapters/postgresql/**
```

This includes:

- `pg` pools
- PostgreSQL URL parsing
- catalog introspection
- identifier quoting
- PostgreSQL SQL validation
- read-only transaction execution
- PostgreSQL timeout configuration

### 2. Adapter Registry

Product code resolves adapters by provider ID. Feature code must not import PostgreSQL implementation modules directly.

Adding a future provider should primarily require:

- registering its provider ID and capabilities
- implementing its adapter and query-generation strategy
- mapping native metadata to canonical metadata
- adding provider-specific connection form fields

It must not require rewriting resource ownership, conversations, dashboards,
sharing, or generic connection lifecycle logic.

### 3. Multiple Saved Connections

Required user actions:

- create a named connection
- test before/save during creation
- list owned connections
- view connection details
- update name or credentials
- retest connection
- delete connection
- select a connection when creating a conversation

API DTOs must expose safe metadata only:

- name
- provider
- host
- port if useful
- database name
- status
- last tested/synced timestamps

### 4. Credential Security

- Encrypt credentials before persistence.
- Decrypt only immediately before adapter use.
- Never return credentials after creation.
- Never use credentials as cache/pool keys.
- Redact credentials from logs and errors.

### 5. Pool Lifecycle

Pool registry keys use `connectionId`. Add:

- bounded pool sizes
- idle eviction/disposal
- disposal when credentials change or a connection is deleted
- global/per-user safeguards where practical

### 6. Schema Snapshots

Persist schema metadata and summary per connection.

Required actions:

- initial schema sync after connection creation
- manual refresh
- show sync status/error
- preserve the previous successful snapshot if refresh fails

Avoid production-hostile profiling:

- basic introspection must not full-scan every table
- expensive ranges/top-values are optional or background work
- sample data must be constrained and treated as potentially sensitive

### 7. SSRF And Network Safety

Reject unsafe connection targets according to the deployment model. At minimum document and test handling of localhost, link-local, and private-network targets. Production policy must be explicit.

## API Contract

Suggested endpoints:

```text
GET    /api/connections
POST   /api/connections
GET    /api/connections/[connectionId]
PATCH  /api/connections/[connectionId]
DELETE /api/connections/[connectionId]
POST   /api/connections/[connectionId]/test
GET    /api/connections/[connectionId]/schema
POST   /api/connections/[connectionId]/schema/refresh
```

## Acceptance Criteria

- One user can save and use multiple PostgreSQL connections.
- Another user cannot access those connections.
- Credentials never appear in list/detail responses or logs.
- Query/schema consumers use `connectionId`, not connection URL.
- Existing PostgreSQL query safety remains intact.
- Adapter registry has only PostgreSQL registered but is structurally extensible.
- Failed schema refresh does not erase the previous successful snapshot.
- Pool cleanup occurs on update/delete.
- `npm run build` passes.

## Tests

- connection CRUD ownership
- credential encryption/redaction
- PostgreSQL adapter query safety
- pool disposal on credential change/delete
- schema sync success/failure preservation
- unsafe host policy
- adapter registry unknown-provider failure
