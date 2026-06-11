# Work Log: W1-DATA

## Implementation

- Added a capability-based SQL data-source registry with PostgreSQL URL parsing,
  public-endpoint DNS/SSRF policy, verified TLS, bounded pools keyed by
  `connectionId:credentialVersion`, parser-backed read-only validation, bounded
  execution, safe connection testing, and bounded catalog introspection.
- Added owner-scoped connection CRUD/test services and APIs. Credentials are
  encrypted before persistence, decrypted only immediately before adapter use,
  omitted from DTOs, and pools are disposed on rotation/delete.
- Added synchronous bounded schema refresh/read APIs. Refresh creates a new
  snapshot, persists success/failure state, and never removes the previous
  successful snapshot. Samples and full scans are disabled by default.

## Tradeoffs And Blockers

- Public SaaS policy permits only publicly routable endpoints on PostgreSQL port
  5432 and requires `sslmode=verify-full`.
- The C1 Prisma model has no durable idempotency-operation record for connection
  tests/schema refreshes. Routes require and validate idempotency keys, but
  durable replay/conflict semantics require a coordinator-owned Prisma change.
- Foreground metadata is structurally bounded and uses estimated counts only.

## Verification

- Run `npx tsc --noEmit` and `npm run build`.
