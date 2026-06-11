# V2 Application Database

The V2 application database is separate from every connected customer
database. Apply forward-only migrations from `prisma/migrations/` using one
controlled deployment runner. Do not run migrations during application startup.

## Required Environment

- `QUERYWISE_APP_DATABASE_URL`: PostgreSQL application database connection URL.
- `QUERYWISE_CREDENTIAL_ENCRYPTION_KEY_V1`: base64-encoded 32-byte AES key.
- `QUERYWISE_CURSOR_SIGNING_KEY`: base64-encoded key of at least 32 bytes.

No environment file is modified by W1-FND.

## Relationship Summary

- Clerk users own connections, conversations, query runs, dashboards, and
  schema snapshots through `owner_user_id`.
- Connections own versioned/partitioned schema snapshots and are referenced by
  conversations and query runs.
- Conversations own ordered messages and query runs.
- Dashboards own snapshot widgets, access grants, and share links.
- Durable jobs are handler-neutral leased records. Feature handlers are added
  by later workstreams.

Private repositories must query by both `owner_user_id` and resource ID and
exclude rows with `deleted_at`. Cross-owner and absent resources produce the
same `RESOURCE_NOT_FOUND` error.
