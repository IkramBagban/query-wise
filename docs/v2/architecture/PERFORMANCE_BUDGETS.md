# Performance Budgets

## Measurement Conditions

Budgets are measured at p95 over at least 100 representative operations after
warm-up. Production SLOs exclude user-selected LLM generation time where noted,
but dependency duration is measured separately. Load tests use application DB
data at target scale and customer PostgreSQL fixtures with indexed and
intentionally expensive queries.

## Target Scale

| Dimension | Required Wave 3 test |
| --- | --- |
| Users | 10,000 accounts, 500 concurrently active |
| Connections | 50/user, 100,000 total |
| Large schema | 2,000 entities, 20,000 columns, 5,000 relationships |
| Conversations | 10,000/user, 1,000 messages in an opened conversation |
| Dashboards | 1,000/user, 100 widgets/dashboard |
| Concurrent queries | 40 global, 2/user |
| Customer source rows | At least 10 million in representative fact table |

## API Budgets

| Operation | p95 server budget | Payload budget |
| --- | --- | --- |
| Compact list API | 300 ms | 256 KiB, <= 50 items |
| Private resource detail | 500 ms | 1 MiB |
| Dashboard detail | 750 ms | 2 MiB |
| Public share read | 500 ms | 2 MiB |
| Connection test | 5 s | 64 KiB |
| Schema snapshot read/search | 750 ms | 2 MiB/page |
| Query admission before LLM | 300 ms | 64 KiB request |
| Query execution after SQL generated | 15 s hard statement timeout | 500 rows, 2 MiB |
| Persist query terminal state | 500 ms | 256 KiB preview |

## Schema Budgets

- Basic introspection p95: <= 10 seconds for 2,000 entities/20,000 columns.
- Basic introspection must not run exact `COUNT(*)`, range scans, top-value
  aggregation, or raw sampling across all tables.
- Snapshot canonical JSON: <= 10 MiB uncompressed; partition/version if larger.
- LLM context selection p95: <= 500 ms from persisted snapshot.
- LLM context: <= 200 entities, 2,000 columns, 512 KiB serialized.
- Optional profiling is background-only, separately limited, and cancellable.

## Database And Pool Budgets

- Application DB checkout p95 <= 100 ms; alert at > 80% pool utilization.
- Customer DB checkout p95 <= 1 second.
- Customer pool max 3 per active connection; idle disposal <= 5 minutes.
- No request holds an application DB transaction while awaiting LLM/customer DB.
- List and owner-resource lookups must use indexed plans without sequential
  scans at target scale.

## Reliability SLOs

- Private compact APIs: 99.9% successful responses monthly, excluding valid
  4xx and customer/LLM dependency failures.
- Query admission/persistence: 99.9%.
- Durable job completion: 99% within 15 minutes; schema sync may use a
  type-specific 30-minute SLO.
- Revocation propagation: <= 5 seconds.

## Test Gates

A budget failure blocks production readiness unless documented with measured
impact, owner, and deadline. Reports include fixture size, concurrency, p50,
p95, p99, errors, timeouts, database plans, and environment.
