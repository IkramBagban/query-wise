# ADR-004: Distributed Rate Limits And Concurrency

- Status: Accepted
- Date: 2026-06-10
- Owners: V2-Q implementation, feature routes consume

## Decision

Use a managed Redis-compatible service for distributed token-bucket rate
limits and expiring concurrency leases. Limits are enforced after
authentication when possible and before expensive dependency calls. Expensive
operations fail closed when the limiter is unavailable; ordinary compact reads
may fail open with an alert.

Keys use hashed stable identifiers, never raw IPs, emails, credentials, share
tokens, or API keys.

## Initial Limits

| Operation | Subject | Limit | Concurrency |
| --- | --- | --- | --- |
| Query execution | user | 20/min, burst 5 | 2/user |
| Query execution | global | 300/min | 40/global |
| Connection test/create/update | user | 10/10 min | 2/user |
| Schema refresh | connection | 3/hour | 1/connection |
| Schema refresh | user | 10/hour | 2/user |
| Share password unlock | share + IP hash | 5/15 min | none |
| Share/link/email mutation | user | 20/hour | 2/user |
| LLM key test | user | 10/10 min | 2/user |
| Public share read | IP hash + share | 120/min | none |

Limits are configuration with version-controlled defaults. Production changes
require an operational record and monitoring review.

## Response Contract

- Return `429` with `Retry-After` for exhausted request rates.
- Return `429` or `503` with a typed `CONCURRENCY_LIMITED` code when no lease
  is available.
- Never reveal whether a private resource exists while limiting.
- Always release leases in `finally`; TTL expiration is the crash fallback.
- Track allowed/blocked counts and lease utilization without sensitive labels.

## Abuse And Cost Controls

- Apply a coarse unauthenticated IP-hash limit before authentication endpoints
  and public shares.
- Authorization still runs before exposing private-resource-specific status.
- Enforce body-size, history-count, metadata-context, result-row, and serialized
  byte limits independently of rate limits.
- Provider-side LLM errors do not grant unlimited immediate retries.

## Rationale

In-memory limits do not work across disposable instances. Redis supports atomic
token buckets and leases with low latency. Separate rate and concurrency
controls protect both request volume and scarce customer DB/LLM capacity.

## Verification

- Multi-instance atomic limit tests.
- Lease expiry and release tests.
- Limiter outage fail-open/fail-closed tests by endpoint class.
- `Retry-After` contract tests.
- Secret-free key and metric-label review.
