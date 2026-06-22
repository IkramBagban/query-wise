# ADR-005: Customer Query Execution Safety

- Status: Accepted
- Date: 2026-06-10
- Owners: V2-C adapter, V2-H orchestration, V2-Q verification

## Decision

All generated SQL is represented as a provider query with an explicit SQL
dialect and executed only through the selected data-source adapter. PostgreSQL
V2 accepts exactly one read-only query after parser-backed validation and then
enforces safety again in the database session.

Lexical blocked-keyword checks alone are not an accepted safety boundary.

## PostgreSQL Execution Policy

1. Parse exactly one statement using a PostgreSQL-aware parser.
2. Allow `SELECT` and read-only `WITH` query trees only.
3. Reject data-modifying CTEs, `SELECT INTO`, locking clauses, `COPY`, utility
   statements, transaction/session control, and calls to denied volatile or
   unsafe functions.
4. Reject access to system/security catalogs unless explicitly required by the
   metadata-introspection capability.
5. Open a transaction and set:
   - `SET LOCAL TRANSACTION READ ONLY`
   - `SET LOCAL statement_timeout = '15s'`
   - `SET LOCAL lock_timeout = '2s'`
   - `SET LOCAL idle_in_transaction_session_timeout = '20s'`
6. Execute through a wrapper that caps returned rows at 500 and response
   serialization at 2 MiB.
7. Roll back after execution, including successful reads, to guarantee cleanup.

Customer deployments must use a dedicated read-only database role, preferably
against a read replica. Application validation is defense in depth, not a
substitute for database permissions.

## Pool Policy

- Key pools by `connectionId`, not secret material.
- Default customer pool maximum: 3 connections.
- Global and per-user concurrency leases are acquired before pool checkout.
- Use TLS with certificate verification by default. Any compatibility override
  is explicit, warned, and not the production default.
- Dispose pools on credential rotation/delete and idle eviction.

## Query Result And Logging Policy

- Persist generated SQL for the owner and audit metadata, but never credentials.
- Persist at most 100 preview rows and 256 KiB serialized preview by default.
- Client response remains capped at 500 rows and 2 MiB.
- Audit duration, status, row count, connection ID, and query-run ID.
- Do not log result rows, raw samples, API keys, or connection URLs.

## Optional Cost Gate

`EXPLAIN (FORMAT JSON)` may become an advisory budget check only after load
tests demonstrate reliable thresholds. It is not required for V2 and must not
be presented as a complete safety guarantee.

## Verification

- Corpus tests for bypasses, data-modifying CTEs, multi-statements, comments,
  locking, utility statements, and unsafe functions.
- Database-role test proves writes fail even if validator regresses.
- Timeout, row-cap, byte-cap, cancellation, and rollback tests.
- Pool cleanup and bounded concurrency tests.
