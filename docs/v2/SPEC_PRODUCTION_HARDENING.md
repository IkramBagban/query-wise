# SPEC V2-Q: Production Hardening And Verification

## Mission

Verify and strengthen V2 across security, reliability, performance, observability, and operational behavior.

## Dependencies

- Starts after core feature APIs exist.
- May file findings against feature owners; coordinate fixes instead of rewriting owned modules without notice.

## Owned Areas

Suggested ownership:

```text
lib/rate-limit/**
lib/audit/**
background-job infrastructure
integration/e2e/load/security tests
production-readiness documentation
```

## Required Deliverables

### 1. Rate Limits And Concurrency

Apply limits to:

- query execution
- connection tests
- schema refresh
- share-password attempts
- share/email creation

Add per-user and global query concurrency safeguards.

### 2. Audit Logging

Record security-relevant events without secrets:

- connection create/update/delete/test
- schema refresh
- query execution status
- dashboard create/delete/share/revoke
- failed authorization attempts where useful

### 3. Background Work

Move long-running schema sync/profiling and optional title generation into a deployment-appropriate background mechanism. Jobs must be idempotent and observable.

### 4. Query Safety Verification

Verify:

- read-only transaction enforcement
- SQL validation
- result row cap
- statement timeout
- bounded concurrency
- no connection credential leakage

Consider a query-cost policy using `EXPLAIN` only if it can be implemented without creating a false sense of safety.

### 5. Production Database Safety

Document that customers should use:

- dedicated read-only database users
- preferably a read replica
- restricted network access
- least-privilege schema permissions

### 6. Load And Scale Tests

Test representative scenarios:

- hundreds of saved schema tables
- hundreds of thousands or millions of source rows
- large conversation history
- many dashboards/widgets
- concurrent query requests
- repeated connection creation/deletion and pool cleanup

### 7. Failure Modes

Verify behavior for:

- customer DB unavailable
- application DB unavailable
- schema refresh failure
- LLM timeout/rate limit
- revoked/expired shares
- encryption/decryption failure
- partially completed query persistence

## Acceptance Criteria

- No known path exposes database credentials, API keys, or share passwords.
- Cross-user authorization tests cover all private resources.
- Rate limits and concurrency controls protect expensive endpoints.
- Audit events exist for critical mutations.
- Background jobs are idempotent and retry-safe.
- Load tests have documented thresholds and results.
- Production readiness checklist documents remaining risks honestly.
- `npm run build` passes.

