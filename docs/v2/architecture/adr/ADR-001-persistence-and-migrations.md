# ADR-001: Application Persistence And Migrations

- Status: Accepted
- Date: 2026-06-10
- Owners: V2-F implementation, V2-Q verification

## Decision

Use a dedicated PostgreSQL application database with Drizzle ORM and
`drizzle-kit`, using `pg` as the runtime driver. All application persistence
goes through server-only, authorization-aware repositories. Customer databases
are never used for product persistence.

Use forward-only, immutable SQL migration files committed to the repository.
Production migrations run as an explicit deployment step from one controlled
runner, never during application startup or from every serverless instance.

## Required Defaults

- Primary keys: UUID v7 or another server-generated, time-sortable,
  collision-resistant ID.
- Timestamps: database-generated `timestamptz` in UTC.
- Ownership: private resources include `owner_user_id`; owner-scoped indexes
  lead with `owner_user_id`.
- Pagination: cursor fields have deterministic compound indexes, normally
  `(owner_user_id, updated_at DESC, id DESC)`.
- JSON: use `jsonb` only for bounded, versioned payloads such as canonical
  metadata and chart configuration; validate at repository boundaries.
- Secrets: versioned authenticated-encryption envelopes, never plaintext.
- Deletes: use hard deletes for secrets and user-requested erasure; use
  revocation/status fields where auditability requires preserving metadata.
- Query previews: bounded rows and serialized bytes; no unrestricted result
  sets in messages.

## Migration Policy

1. Generate a migration from reviewed schema changes.
2. Review generated SQL and add explicit data migration SQL when needed.
3. Run migration smoke tests against an empty database and the previous
   production schema.
4. Use expand/migrate/contract for breaking changes:
   - add nullable/backward-compatible structures,
   - deploy dual-compatible code,
   - backfill in an idempotent job,
   - enforce constraints,
   - remove obsolete structures in a later release.
5. Set migration `lock_timeout` and `statement_timeout`; never accept an
   unbounded table rewrite on a production-size table.
6. Record migration version in deployment evidence and block application
   promotion if the required version is absent.

Rollback is a new forward migration or application rollback compatible with
the expanded schema. Destructive down migrations are not a production plan.

## Transaction Boundaries

- Multi-record feature writes use a transaction.
- Query-run finalization atomically records terminal run status and the
  assistant message.
- Outbound side effects use an outbox/job record committed in the same
  transaction as the initiating state change.
- Repositories do not hold transactions open across customer DB or LLM calls.

## Rationale

Drizzle keeps SQL and migrations visible, supports typed repositories, and
does not obscure provider-specific application-PostgreSQL behavior. Explicit
migration execution avoids races and cold-start latency in disposable runtimes.

## Rejected Alternatives

- Local JSON/process maps: not durable or multi-instance safe.
- Customer database persistence: violates isolation and credential boundaries.
- Runtime auto-migration: unsafe under concurrent deployments.
- Storing all results in JSON: creates unbounded cost, privacy, and latency.

## Verification

- Empty-database migration smoke test.
- Upgrade test from the prior schema.
- Owner-scoped repository and transaction rollback tests.
- Query plan checks for cursor/list indexes.
- Secret and result-preview size constraint tests.
