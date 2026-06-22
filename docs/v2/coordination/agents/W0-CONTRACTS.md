# Work Log: W0-CONTRACTS

## Scope And Ownership

- Mission: publish precise cross-feature V2 contracts before implementation.
- Owned files/modules: new files under `docs/v2/contracts/**` and this log.
- Explicitly out of scope: editing coordinator-owned specs/coordination files,
  implementing application code, migrations, or shared types.
- Dependencies: V2 specs/decisions/context, existing V1 behavior, Next.js 16
  Route Handler and data-security guidance.

## Exploration Findings

- Existing modules inspected: `types/index.ts`, query route/SSE/flow/error
  mapping, `lib/db.ts`, schema introspection/types/summary, LLM SQL generation,
  dashboard/share routes/store, state/browser persistence, chart/result shapes,
  SQL Preview UI, and relevant dynamic routes.
- Relevant Next.js 16 docs inspected:
  `01-app/02-guides/data-security.md`,
  `01-app/01-getting-started/15-route-handlers.md`,
  `01-app/01-getting-started/06-fetching-data.md`,
  `01-app/01-getting-started/07-mutating-data.md`, and
  `01-app/03-api-reference/03-file-conventions/route.md`.
- Existing behavior worth preserving: constrained analyst flow, SSE progress,
  generated SQL preview, chart configuration, read-only transaction, statement
  timeout, 500-row execution cap, and bounded chart/table UI.
- Gaps discovered: client sends connection URLs/history/API keys; auth is
  disabled; caches/pools/logs key or include connection strings; schema
  profiling can be expensive; SQL generation is directly PostgreSQL-specific;
  query runs lack durable state/idempotency; list pagination is absent; current
  public share returns the private dashboard shape.

## Design Before Implementation

- Existing code to reuse: V1 query result/chart concepts and safety defaults can
  be adapted behind the new contracts.
- Proposed boundaries: server-only owner-scoped DAL; orchestration services;
  capability/dialect-aware SQL adapter and generation strategy; separate public
  share mapper.
- Contracts consumed: all `docs/v2` specs/context/decisions/integration
  contracts and assignment requirements.
- Contracts published: domain model, SQL adapter/generation/preview, API,
  errors, query-run state/idempotency, public-share DTO, pagination/bounds.
- Migration/environment impact: implementation requires unique query-run
  idempotency constraint, persisted status/version/timing fields, encrypted
  connection private records, share token/password hashes, and bounded JSON.
- Risks and tradeoffs: exact result totals remain nullable to avoid expensive
  counts; dashboard/public snapshots are intentionally limited; V2 SQL Preview
  remains SQL-specific because NoSQL is out of scope.

## Security, Privacy, And Scale

- Authorization checks: identity is server-resolved; private access is
  owner/access scoped; cross-owner misses are indistinguishable `404`s.
- Secret/PII handling: secrets/API keys/raw share credentials never appear in
  DTOs, persistence (for API keys), logs, metrics, or cache keys.
- Query/data bounds: 500 execution rows, 100 persisted/share preview rows,
  cursor pages default 25/max 100, explicit byte/metadata bounds.
- Failure and observability behavior: stable safe error codes, request IDs,
  monotonic query state, measurable timings/counts, terminal SSE events.
- Provider-extensibility impact: PostgreSQL-only implementation behind SQL
  provider/dialect/capability contracts; no NoSQL abstraction.

## Progress

- [x] Exploration complete
- [x] Design recorded
- [x] Implementation complete
- [x] Focused tests complete (documentation consistency review)
- [x] Build complete
- [x] Final diff reviewed
- [x] Atomic commit(s) created

## Verification Evidence

| Command | Result | Notes |
| --- | --- | --- |
| documentation consistency review | passed | required features, boundaries, invariants, bounds, and versions covered |
| `npm run build` | passed | Next.js 16.2.1 production build; existing multiple-lockfile workspace-root warning only |
| `npm run build` (post-log rerun) | blocked | Next.js reported another `next build` process already running; no app-code or contract error reported |

## Commits

- Scoped atomic contract commit created; hash reported in the final handoff.

## Integration Notes And Follow-Ups

- Coordinator actions required: adopt or reconcile these contracts before Wave
  1 shared types/schema are finalized.
- Proposed shared decisions/contracts: require query idempotency keys; keep
  total result count nullable; use SQL capability/dialect contracts for SQL
  Preview/generation; enforce dedicated public DTO mapping.
- Known risks: implementation must choose canonical JSON serialization and
  cursor signing details; LLM API keys remain transport-only per current spec
  and therefore require careful redaction.
- Follow-up work: feature agents should implement compile-time DTO secret-leak
  tests and integration tests for every invariant.
