# ADR-003: Durable Background Jobs

- Status: Accepted
- Date: 2026-06-10
- Owners: V2-F schema, V2-C producers, V2-Q worker/operations

## Decision

Implement a PostgreSQL-backed durable job queue in the application database.
Workers are invoked by a protected scheduled endpoint and may also run as a
dedicated Node.js worker in deployments that support one. Request handlers
enqueue work and return; they do not rely on unawaited promises.

Initial job types:

- `schema.sync`
- `schema.profile`
- `conversation.generate_title`
- `retention.purge`
- `connection.dispose_pool`
- `audit.export` when required later

## Job Record And Lease

Each job stores:

```text
id, type, payload_version, payload_json, idempotency_key,
status, priority, attempts, max_attempts, available_at,
lease_owner, lease_expires_at, last_error_code,
created_at, started_at, completed_at
```

Enforce uniqueness on `(type, idempotency_key)` for active/successful work.
Workers claim jobs with `FOR UPDATE SKIP LOCKED`, set a lease, heartbeat work
that may exceed the lease, and only finalize jobs they still own.

## Delivery Semantics

Delivery is at least once. Handlers must be idempotent:

- Schema sync writes a new version only after successful introspection, then
  atomically promotes it. Failed sync preserves the previous snapshot.
- Profiling writes by `(snapshotId, profileVersion)`.
- Title generation updates only when the title is still eligible.
- Purge jobs delete by stable cutoff and resource ID in bounded batches.
- Email or other external effects use a stable provider idempotency key.

## Retry Policy

- Retry transient network, timeout, rate-limit, and dependency-unavailable
  failures with exponential backoff plus jitter.
- Do not retry invalid input, authorization, unsupported capability,
  decryption/authentication, or permanent provider errors.
- Default: 5 attempts, delays approximately 10 seconds, 1 minute, 5 minutes,
  30 minutes, and 2 hours.
- Exhausted jobs become `dead`; alert and expose operator-safe diagnostics.

## Operational Limits

- Claim at most 10 jobs per worker invocation.
- Process no more than 2 schema jobs per user and 10 globally by default.
- Each job has a type-specific timeout and payload-size limit.
- Payloads contain resource IDs and versions, never decrypted secrets or LLM
  API keys.

## Rationale

A Postgres queue minimizes Wave 0 infrastructure and provides transactional
enqueue with application state. The lease model works in serverless scheduled
invocations and can migrate behind a queue interface later.

## Verification

- Concurrent claim test proves one active lease per job.
- Worker crash/expired lease recovery test.
- Duplicate enqueue/idempotency test.
- Failed schema sync preservation test.
- Dead-job alert and redacted diagnostics test.
