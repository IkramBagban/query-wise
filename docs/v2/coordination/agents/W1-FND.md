# Work Log: W1-FND

## Scope And Ownership

- Mission: publish C1 application persistence and shared server-side foundation.
- Owned files/modules: `lib/v2/app-db/**`, `lib/v2/dal/core/**`,
  `lib/v2/domain/**`, `lib/v2/security/encryption.ts`,
  `lib/v2/security/redaction.ts`, `types/v2/**`, `db/**`,
  `drizzle.config.ts`, package manifests, and this log.
- Explicitly out of scope: feature repositories/routes/UI, auth implementation,
  customer database adapters, shared coordination docs, `.env*`, and
  user-owned engineering notes.
- Dependencies: accepted Wave 0 architecture/contracts and bundled Next.js 16
  data-security/server guidance.

## Exploration Findings

- Existing modules inspected: legacy `lib/db.ts`, `lib/auth.ts`, `lib/logger.ts`,
  root types/tooling, all V2 specs, architecture, contracts, coordination docs,
  and existing workstream logs.
- Relevant Next.js 16 docs inspected: data security, authentication, server
  actions/server-only modules, fetching data, and mutating data.
- Existing behavior worth preserving: explicit PostgreSQL transactions,
  read-only customer-query boundary, statement timeout, and bounded results.
- Gaps or conflicts discovered: no durable application DB, migrations, typed
  V2 records, owner-scoped DAL primitives, credential envelope, or durable job
  schema. The worktree contains unrelated user-owned/untracked changes,
  including `docs/ENGINEERING_SYSTEM_DESIGN_NOTES.md`; they will remain
  untouched.

## Design Before Implementation

- Existing code to reuse: `pg` runtime dependency and V2 contract vocabulary.
- Proposed modules and boundaries: typed Drizzle schema/client; explicit
  transaction API; UUIDv7 ID helper; stable records/DTOs; signed cursor codec;
  typed safe errors; owner-scope query helper; minimal DTO mappers; AES-256-GCM
  credential envelope; recursive redaction; immutable SQL migration.
- Contracts consumed: `docs/v2/contracts/**`, accepted ADR-001/ADR-003, data
  classification, threat model, and C1 checkpoint.
- Contracts published or changed: C1 types, app DB schema/client, repository
  conventions, transaction/pagination/error/ID primitives, encryption and
  redaction APIs. No coordinator-owned contract files will be edited.
- Coordinator corrections incorporated: query runs include `expired` and are
  executed during the request lifetime after durable acceptance because LLM
  API keys are transport-only; recovery jobs expire/fail interrupted runs.
  Users, connections, conversations, and dashboards have nullable `deletedAt`;
  connections additionally use `deleting`/`deleted` statuses for asynchronous
  credential/pool cleanup. Canonical metadata includes completeness,
  truncation/omitted counts, and snapshot version/partition fields. C1 durable
  jobs provide records/indexes only; handlers belong to later workstreams.
  SQL types follow `contracts/SQL_DATA_SOURCE.md` naming.
- Migration/environment impact: initial V2 schema plus durable jobs.
  Required environment variables are `QUERYWISE_APP_DATABASE_URL`,
  `QUERYWISE_CREDENTIAL_ENCRYPTION_KEY_V1` (base64-encoded 32-byte key), and
  `QUERYWISE_CURSOR_SIGNING_KEY` (base64-encoded key, minimum 32 bytes).
- Risks and tradeoffs: PostgreSQL JSON constraints enforce byte ceilings but
  semantic JSON validation remains at repository boundaries; hard ownership
  isolation depends on feature repositories always applying the published
  owner-scope helper; PostgreSQL jobs provide at-least-once delivery.
- Exact dependencies installed: `drizzle-orm@0.45.2` for typed PostgreSQL
  queries/transactions and `server-only@0.0.1` for compile-time server
  boundaries. `drizzle-kit@0.31.9` installation was attempted but blocked by
  the environment approval/usage limit; the reviewed initial SQL migration is
  committed directly and config is ready for the tool when available.

## Security, Privacy, And Scale

- Authorization checks: private lookup helpers require owner ID and collapse
  absent/cross-owner resources into `RESOURCE_NOT_FOUND`.
- Secret/PII handling: encryption/redaction modules are server-only; public DTO
  types and mappers omit credentials; jobs/audit payloads are documented and
  constrained to secret-free metadata.
- Query/data bounds: deterministic signed cursor pagination and database checks
  for result preview/message/SQL/job payload sizes.
- Failure and observability behavior: stable typed application errors retain
  causes server-side while exposing only safe messages.
- Provider-extensibility impact: stable SQL provider/dialect/capability and
  canonical relational metadata contracts; PostgreSQL remains the only V2
  provider.

## Progress

- [x] Exploration complete
- [x] Design recorded
- [x] Implementation complete
- [x] Focused tests complete
- [ ] Build complete
- [x] Final diff reviewed
- [ ] Atomic commit(s) created

## Verification Evidence

| Command | Result | Notes |
| --- | --- | --- |
| `npx tsc --noEmit` | passed | shared types, schema, and server foundation compile |
| `npx eslint lib/v2 types/v2 drizzle.config.ts` | passed | no errors; final config warning corrected |
| `git diff --check` / scoped review | passed | only owned paths; no whitespace errors |
| UUIDv7 inline smoke command | blocked | PowerShell quoting failed before project code executed |
| migration/encryption/owner/rollback integration tests | blocked | no assigned test path/tooling and no `QUERYWISE_APP_DATABASE_URL` |
| `npm run build` | blocked | compilation blocked by existing root layout Google Font fetches; network-enabled retry approval rejected by environment usage limit |

## Commits

- Blocked: scoped commit attempt failed because `.git/index.lock` is
  sandbox-restricted; required git-write approval was rejected by the
  environment usage limit. No files were staged or committed.

## Integration Notes And Follow-Ups

- Coordinator actions required: publish C1 commit hashes and copy the
  ready-to-integrate engineering notes below into the serialized user-owned
  engineering notes file.
- Proposed shared decisions/contracts: feature repositories import shared
  records/DTOs from `types/v2`, use `withAppDbTransaction` for multi-record
  writes, use owner-scoped predicates for private reads, and never expose
  Drizzle rows directly.
- Ready-to-integrate engineering notes: QueryWise V2 uses a separate
  PostgreSQL application database through a server-only Drizzle/`pg` client and
  forward-only migrations. Private records carry `owner_user_id`; repositories
  must query by owner and ID and map to minimal DTOs. Customer credentials use
  a versioned AES-256-GCM envelope keyed by
  `QUERYWISE_CREDENTIAL_ENCRYPTION_KEY_V1`. Durable jobs use leased,
  at-least-once PostgreSQL records. Test with focused foundation tests,
  migration smoke tests against an empty PostgreSQL database, and
  `npm run build`.
- Known risks: migration smoke/transaction rollback tests require an available
  `QUERYWISE_APP_DATABASE_URL`; `drizzle-kit` installation remains blocked;
  full build requires network access for existing Google Fonts. No `.env` file
  is modified. Atomic commits remain blocked by rejected git-write approval.
- Follow-up work: feature owners implement resource-specific repositories using
  the published core conventions; W3-HARDEN implements worker claim/lease
  behavior and integration security tests.
