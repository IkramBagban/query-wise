# Failure, Retry, And Idempotency Model

## Principles

- Return an accepted operation only after durable state exists.
- Retries are bounded and only for transient failures.
- Every retryable mutation or job has a stable idempotency key.
- Do not hold application DB transactions across LLM or customer DB calls.
- Persist query failures as useful terminal history without pretending success.
- Client disconnect does not erase durable work; it may request cancellation.

## Query Run State Machine

```text
accepted
  -> generating
      -> executing
          -> succeeded
          -> failed
          -> cancelled
      -> failed
      -> cancelled
  -> expired
```

Creation transaction stores the user message and `accepted` query run. Later
transitions use compare-and-set on current state/version. Finalization
transaction stores the terminal run and assistant message. A reconciler marks
stale non-terminal runs `expired` and records a safe explanation.

## Error Taxonomy

| Category | Retry? | Public behavior |
| --- | --- | --- |
| `VALIDATION` / `UNSUPPORTED_CAPABILITY` | No | 400/422 safe message |
| `UNAUTHENTICATED` | No | 401 |
| `NOT_FOUND_OR_FORBIDDEN` | No | 404 for private resources |
| `RATE_LIMITED` / `CONCURRENCY_LIMITED` | Later | 429 + `Retry-After` |
| `CUSTOMER_DB_AUTH` / `DECRYPTION` | No automatic retry | safe connection error |
| `CUSTOMER_DB_UNAVAILABLE` / timeout | Bounded when operation is idempotent | dependency error |
| `LLM_AUTH` | No | safe API-key error |
| `LLM_RATE_LIMIT` / unavailable | Bounded backoff/model fallback | provider unavailable |
| `APP_DB_UNAVAILABLE` | Bounded at safe boundary | 503; do not claim acceptance |
| `INTERNAL` | No blind retry | correlation ID, alert |

## Retry Rules

- Use exponential backoff with jitter and honor provider `Retry-After`.
- Interactive LLM calls: maximum 3 attempts total per model; fallback only for
  rate-limit/unavailable/unsupported-model failures, never auth failures.
- Customer read query: do not automatically rerun after execution may have
  started unless the adapter proves no result was produced and the retry stays
  within the same user action budget.
- Application DB transactions may retry serialization/deadlock errors up to 3
  times when the entire transaction is idempotent.
- Jobs follow ADR-003.

## Idempotency Keys

- Client mutations that can be repeated accept an opaque request ID scoped to
  authenticated user and operation.
- Query submission key maps to one user message/query run.
- Schema sync key includes `connectionId` and requested credential/schema
  version.
- Share/email side effects use share/grant ID plus operation version.
- Idempotency records store request hash, terminal response reference, and
  expiry; a reused key with different input is rejected.

## Dependency Failures

- Application DB unavailable: reject writes and private reads requiring
  authorization; never fall back to process-local state.
- Redis unavailable: expensive operations fail closed; ordinary compact reads
  may fail open with alerting.
- Customer DB unavailable: preserve product state and prior schema snapshot.
- LLM unavailable: persist failed run safely; never execute guessed SQL.
- Encryption failure: quarantine the connection as unusable and alert; never
  log payload/key material.

## Verification

- State-transition and concurrent-finalization tests.
- Duplicate request and mismatched idempotency-key tests.
- Dependency fault injection for DB, Redis, LLM, and customer source.
- Stale-run reconciliation and cancellation tests.
