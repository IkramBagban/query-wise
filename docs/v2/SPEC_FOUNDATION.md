# SPEC V2-F: Application Database And Shared Foundation

## Mission

Create the durable, server-only foundation used by all V2 features. This agent publishes the application database schema, migrations, shared domain contracts, encryption utilities, and DAL conventions.

## Dependencies

- Can start immediately.
- Must read the Next.js 16 data-security guide.
- Coordinate the persistence library choice before feature agents begin writing repositories.

## Owned Areas

Suggested ownership:

```text
lib/app-db/**
lib/dal/**
lib/security/encryption.ts
lib/domain/**
types/v2/**
database migration/config files
docs/v2/**
```

Do not implement feature-specific UI or full feature APIs.

## Required Deliverables

### 1. Application Database

Add a PostgreSQL persistence layer suitable for migrations, transactions, typed queries, and Vercel deployment.

The schema must support:

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

Feature agents may add feature-specific columns through coordinated migrations.

### 2. Core Relationships

- A connection belongs to one Clerk user.
- A conversation belongs to one Clerk user and one connection.
- A message belongs to one conversation.
- A query run belongs to one conversation and may reference its triggering/response messages.
- A dashboard belongs to one Clerk user.
- A widget belongs to one dashboard and may reference a query run.
- An access grant belongs to one dashboard.
- A share link belongs to one dashboard.

### 3. Encryption Utility

Create a versioned encryption envelope for customer database credentials.

Required API:

```ts
encryptSecret(plaintext: string): Promise<EncryptedPayload>
decryptSecret(payload: EncryptedPayload): Promise<string>
```

Requirements:

- authenticated encryption
- random nonce/IV
- version field for future key rotation
- server-only module
- no plaintext logging
- clear failure behavior for missing/invalid encryption key

Do not edit `.env`. Document required environment variable names in an example or setup document only.

### 4. Shared Domain Contracts

Publish stable domain types and DTOs for feature agents. Separate private records containing encrypted secrets from public DTOs.

At minimum define:

- IDs/resource ownership fields
- database-provider ID
- connection public/private records
- schema snapshot status
- conversation/message/query-run records
- dashboard/widget/share/access records
- pagination contract

### 5. DAL Conventions

Create `server-only` repository boundaries. All private-resource reads must accept the authenticated user ID or use an authorization helper.

Required behavior:

- no unrestricted `getById` exported for private resources
- transactions for multi-record writes
- cursor pagination helpers
- minimal DTO mapping
- consistent not-found/access-denied behavior

## Suggested Schema Notes

Do not persist complete query results directly inside messages. Store query-run result previews separately and enforce a size limit. A later object-storage strategy should remain possible.

Connection schema snapshots should include:

- normalized structured schema JSON
- generated summary
- schema hash/version
- sync status and error
- timestamps

## Acceptance Criteria

- A migration can create the V2 schema on an empty PostgreSQL database.
- A typed server-only database client is available to other agents.
- Secrets round-trip through encryption/decryption tests.
- Public connection DTOs cannot include credential fields.
- Shared contracts compile without importing client-only code.
- Ownership-aware DAL examples/tests demonstrate that one user cannot read another user's resource.
- `npm run build` passes.

## Tests

- migration smoke test
- encryption round-trip and tamper failure
- public DTO secret-leak test
- owner-scoped repository test
- transaction rollback test for a multi-record write

## Handoff To Other Agents

Publish:

- schema diagram or relationship summary
- migration commands
- public/private DTO types
- repository naming conventions
- encryption API
- any coordinated extension points required by feature agents
