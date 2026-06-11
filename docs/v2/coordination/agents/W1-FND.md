# Work Log: W1-FND

## Prisma Pivot

- Replaced the uncommitted Drizzle application persistence foundation with
  Prisma `6.19.0`; customer PostgreSQL adapters remain separate and continue to
  use `pg`.
- Added the full V2 Prisma schema, reviewed initial Prisma migration, server-only
  singleton client, transaction types/helper, and Prisma-compatible owner
  filters.
- PostgreSQL migration SQL enforces checks, bounded JSON payloads, partial
  durable-job idempotency, and compound ownership/conversation consistency that
  Prisma schema syntax cannot fully express.
- Preserved the existing versioned AES-256-GCM credential lifecycle, redaction,
  DTO, ID, pagination, and shared V2 type helpers.
- Verification commands: `npm run db:format`, `npm run db:generate`,
  `npx tsc --noEmit`, and `npm run build`.
