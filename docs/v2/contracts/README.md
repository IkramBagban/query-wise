# QueryWise V2 Cross-Feature Contracts

Status: **W0 baseline**  
Contract family: `querywise.v2`  
Published: `2026-06-10`

These documents are the implementation baseline for V2 feature workstreams.
They refine the V2 specs without changing the coordinator-owned shared files.
When a shared file and this contract set conflict, stop and coordinate before
implementation.

## Contract Documents

| Document | Primary consumers |
| --- | --- |
| [DOMAIN_MODEL.md](./DOMAIN_MODEL.md) | V2-F, V2-A, V2-C, V2-H, V2-D, V2-U |
| [SQL_DATA_SOURCE.md](./SQL_DATA_SOURCE.md) | V2-C, V2-H, V2-U, V2-Q |
| [API.md](./API.md) | V2-A, V2-C, V2-H, V2-D, V2-U, V2-Q |
| [ERRORS.md](./ERRORS.md) | all route, service, DAL, adapter, and UI owners |
| [QUERY_RUNS.md](./QUERY_RUNS.md) | V2-H, V2-C, V2-U, V2-Q |
| [PUBLIC_SHARING.md](./PUBLIC_SHARING.md) | V2-D, V2-U, V2-Q |
| [PAGINATION_AND_BOUNDS.md](./PAGINATION_AND_BOUNDS.md) | V2-F, V2-C, V2-H, V2-D, V2-U, V2-Q |

## Normative Language

`MUST`, `MUST NOT`, `SHOULD`, and `MAY` are normative. TypeScript snippets
describe wire/domain shape; persistence libraries may use equivalent internal
representations while preserving fields and invariants.

## Versioning Rules

- Every JSON response MUST include `contractVersion: "querywise.v2"`.
- Every SSE event payload MUST include `contractVersion` and `queryRunId`.
- Additive optional fields are backward-compatible within `querywise.v2`.
- Renaming/removing fields, changing meanings, relaxing security boundaries, or
  changing state transitions requires a new contract family.
- Persisted structured JSON MUST include its own `schemaVersion` integer.
- Cursors and public-share unlock tokens are opaque and versioned internally;
  consumers MUST NOT parse them.

## Global Invariants

1. Identity is resolved server-side. No private API accepts `ownerUserId`.
2. A private-resource miss and cross-owner access both return `404`.
3. Browser-facing DTOs never contain credentials, encrypted secrets, LLM API
   keys, share password hashes, share token hashes, or raw provider details.
4. Product modules depend on SQL capabilities and canonical relational
   metadata, never PostgreSQL catalogs or `pg` pools.
5. V2 supports SQL data sources only. No NoSQL query abstraction is introduced.
6. Every expensive operation is authorized, bounded, observable, and safe to
   retry according to its idempotency contract.
7. Query results and dashboard snapshots are bounded. List endpoints never
   embed result rows.
8. Server-only DAL/services perform authorization and map minimal DTOs. Route
   Handlers validate transport input and do not directly access databases.

