# QueryWise V2 Wave 0 Architecture

## Status And Scope

These documents are the accepted Wave 0 target architecture for QueryWise V2.
They guide implementation; they do not change the coordinator-owned contracts.

V2 is a user-owned conversational BI service for SQL data sources. PostgreSQL
is the only implemented customer data-source adapter and the application
database is PostgreSQL. Future adapters may support other SQL dialects. NoSQL,
cross-database joins, and writes to customer data sources are out of scope.

## System Boundaries

```text
browser
  -> Next.js 16 App Router (Node.js runtime)
      -> Clerk identity
      -> server-only services and authorization-aware DAL
          -> QueryWise application PostgreSQL
          -> Redis rate limits and concurrency leases
          -> durable Postgres job queue
          -> SQL data-source adapter registry
              -> PostgreSQL customer database
          -> user-selected LLM provider
```

The application database is authoritative for product state. Customer
databases are external, read-only data sources. Browser storage is transient UI
state only. Route Handlers and Server Actions are untrusted public entry points.

## Architecture Invariants

1. Every private resource operation authenticates and authorizes inside a
   server-only service or DAL. Page or proxy checks are not sufficient.
2. Clients submit stable resource IDs, never connection URLs, encrypted
   credentials, owner user IDs, or durable job state.
3. Only adapters touch customer database secrets, native catalogs, pools,
   dialect-specific validation, and query execution.
4. Customer SQL runs in a database-enforced read-only transaction with a
   parser-backed single-statement policy, timeout, row cap, and concurrency
   lease.
5. Credentials, LLM API keys, share passwords, raw samples, and unrestricted
   query results never enter logs, analytics, cache keys, or public DTOs.
6. Durable state and coordination cannot depend on process memory or local
   files. Instances are disposable.
7. Jobs and retried mutations are idempotent. External side effects use stable
   idempotency keys.
8. Metadata and result payloads are bounded. Large-schema behavior is measured
   against the budgets in `PERFORMANCE_BUDGETS.md`.

## Decision Index

| ADR | Status | Decision |
| --- | --- | --- |
| [ADR-001](adr/ADR-001-persistence-and-migrations.md) | Accepted | Drizzle ORM over `pg`, PostgreSQL, forward-only migrations |
| [ADR-002](adr/ADR-002-runtime-and-caching.md) | Accepted | Node.js runtime, disposable instances, explicit safe caches |
| [ADR-003](adr/ADR-003-background-jobs.md) | Accepted | Durable PostgreSQL job queue with leased workers |
| [ADR-004](adr/ADR-004-rate-limits-and-concurrency.md) | Accepted | Redis distributed limits and leases |
| [ADR-005](adr/ADR-005-query-execution-safety.md) | Accepted | Adapter-enforced read-only SQL execution policy |

## Operational Documents

- [Threat model](THREAT_MODEL.md)
- [Data classification and LLM privacy policy](DATA_CLASSIFICATION_AND_PRIVACY.md)
- [Lifecycle, retention, and deletion](LIFECYCLE_RETENTION_DELETION.md)
- [Performance budgets](PERFORMANCE_BUDGETS.md)
- [Failure, retry, and idempotency](FAILURE_RETRY_IDEMPOTENCY.md)
- [Deployment and operations](DEPLOYMENT_OPERATIONS.md)

## Required Implementation Sequence

1. Foundation establishes application DB, migrations, server-only DAL,
   encryption, and domain records.
2. Authorization and adapters establish the trust and customer-data boundaries.
3. Features persist conversations, query runs, dashboards, and sharing through
   those boundaries.
4. Hardening adds distributed limits, jobs, audit events, load tests, alerts,
   and production readiness evidence.
