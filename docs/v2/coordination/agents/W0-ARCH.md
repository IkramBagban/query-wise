# Work Log: W0-ARCH

## Scope And Ownership

- Mission: publish production-grade Wave 0 architecture decisions and operating
  constraints for QueryWise V2.
- Owned files/modules: new files under `docs/v2/architecture/**` and this log.
- Explicitly out of scope: implementation, existing specs, shared coordination
  files, and `docs/ENGINEERING_SYSTEM_DESIGN_NOTES.md`.
- Dependencies: `AGENTS.md`, assignment, all v2 specs/contracts, current
  implementation, and bundled Next.js 16 guidance.

## Exploration Findings

- Existing modules inspected: auth and auth routes; connection/schema/query/
  dashboard/share routes; `lib/db.ts`; schema introspection/pooling/profiling;
  LLM prompts/client/SQL generation; logging; v2 specs and contracts.
- Relevant Next.js 16 docs inspected: data security, authentication, Route
  Handlers, mutating data, and caching.
- Existing behavior worth preserving: PostgreSQL read-only transaction,
  statement timeout, 500-row cap, constrained LLM flow, model retry/fallback,
  Zod validation, and provider-neutral v2 adapter direction.
- Gaps discovered: disabled auth; credentials/API keys cross request boundary;
  credentials used as pool/cache keys and logged; process/local-file state;
  no durable app DB/jobs/distributed limits; schema profiling full scans and raw
  samples; lexical SQL validation; TLS certificate verification disabled.

## Design Before Implementation

- Existing code to reuse: constrained query orchestration and chart selection
  behind provider-neutral services; current read-only behavior as defense in
  depth, strengthened by parser validation and database roles.
- Proposed boundaries: server-only DAL; application PostgreSQL; adapter-only
  customer DB access; Node.js runtime; Postgres durable jobs; Redis limits.
- Contracts consumed: `docs/v2/CONTEXT.md` and
  `coordination/INTEGRATION_CONTRACTS.md`.
- Contracts published or changed: no shared contract edited. Architecture
  recommends concrete accepted defaults for coordinator/feature consumption.
- Migration/environment impact: Drizzle/`pg`, forward migrations, application
  PostgreSQL, managed Redis, Clerk, worker secret, versioned encryption keys.
- Risks/tradeoffs: Postgres jobs reduce infrastructure but need careful leases;
  Redis adds an operational dependency; bounded LLM context trades exhaustive
  raw context for privacy and predictable scale.

## Security, Privacy, And Scale

- Authorization checks: every public entry point delegates to owner-aware
  server-only services/DAL; private failures return non-disclosing 404.
- Secret/PII handling: credentials encrypted; API keys ephemeral; samples
  opt-in/redacted; no restricted data in logs/caches/jobs/DTOs.
- Query/data bounds: parser-backed single read statement, read-only role and
  transaction, timeout, concurrency lease, row/byte/context/preview caps.
- Failure/observability: typed errors, durable query/job states, idempotency,
  structured secret-free telemetry, dependency runbooks.
- Provider extensibility: product flow consumes capability-based SQL adapter and
  canonical metadata; PostgreSQL syntax remains adapter-local.

## Progress

- [x] Exploration complete
- [x] Design recorded
- [x] Implementation complete
- [x] Focused tests complete
- [x] Build complete
- [x] Final diff reviewed
- [x] Atomic commit(s) created

## Verification Evidence

| Command | Result | Notes |
| --- | --- | --- |
| `rg`/`Get-Content` repository exploration | passed | specs, coordination, implementation, Next.js docs |
| architecture coverage review | passed | required topics and accepted ADRs present |
| `npm run build` | passed | Next.js 16.2.1 production build; existing multiple-lockfile workspace-root warning |
| owned-path diff/status review | passed | only architecture files and W0-ARCH log committed |

## Commits

- `06489a6` - `docs(v2): define wave 0 production architecture`

## Integration Notes And Follow-Ups

- Coordinator actions required: incorporate accepted defaults into shared
  decisions/contracts only where desired; assign implementation owners.
- Proposed shared decisions/contracts: Drizzle persistence; Node.js runtime;
  Postgres leased job queue; Redis rate/concurrency controls; parser-backed
  adapter safety; samples off by default for customer LLM context.
- Known risks: read-only SQL can still be expensive; customer schemas/results
  may contain regulated data; private-network customer DB access needs a
  separate connector architecture.
- Follow-up work: Wave 1 implements boundaries; Wave 3 supplies security/load/
  recovery evidence and tunes defaults from measurements.
