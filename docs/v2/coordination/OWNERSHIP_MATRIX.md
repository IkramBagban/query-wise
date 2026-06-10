# QueryWise V2 Ownership Matrix

This matrix replaces suggested ownership with disjoint implementation
boundaries. New V2 code uses V2-specific namespaces so agents can work without
colliding with legacy V1 modules. Ownership is exclusive unless an exception is
recorded in the owner's work log and `CONTRACT_CHANGELOG.md`.

## Global Rules

1. Own means create, edit, move, and delete within the listed paths.
2. Read-only means inspect and import, but do not modify.
3. Unlisted existing files are read-only until the coordinator assigns them.
4. Do not refactor a legacy file merely to make V2 implementation convenient.
5. Cross-owner edits require a recorded handoff naming the exact paths, reason,
   producer, consumer, and integration order.
6. Never edit `.env*`. Environment requirements are documentation only.
7. SQL databases only. V2 implements PostgreSQL; future SQL providers integrate
   through capabilities, `ProviderQuery`, and canonical relational metadata.

## Exclusive Ownership

| Workstream | Exclusive create/edit paths | Explicitly read-only or prohibited |
| --- | --- | --- |
| `W0-COORD` | `docs/v2/coordination/DEPENDENCY_GRAPH.md`; `docs/v2/coordination/OWNERSHIP_MATRIX.md`; `docs/v2/coordination/AGENT_PROMPT_STANDARD.md`; `docs/v2/coordination/CONTRACT_CHANGELOG.md`; `docs/v2/coordination/agents/W0-COORD.md` | all implementation code; `STATUS.md`; `DECISIONS.md`; `INTEGRATION_CONTRACTS.md`; specs |
| `W1-FND` | `lib/v2/app-db/**`; `lib/v2/dal/core/**`; `lib/v2/domain/**`; `lib/v2/security/encryption.ts`; `types/v2/**`; `db/**`; `drizzle.config.*` or coordinator-approved equivalent; `docs/v2/coordination/agents/W1-FND.md` | feature repositories/routes/UI; auth implementation; customer DB adapters |
| `W1-AUTH` | `lib/v2/auth/**`; `lib/v2/dal/authorization/**`; `app/(auth)/**`; `components/v2/auth/**`; `proxy.ts`; auth-specific tests; `docs/v2/coordination/agents/W1-AUTH.md` | feature repositories; public-share authorization implementation; shared domain types |
| `W1-DATA` | `lib/v2/data-sources/**`; `lib/v2/connections/**`; `lib/v2/schema/**`; `app/api/connections/**`; connection/data-source tests; `docs/v2/coordination/agents/W1-DATA.md` | `lib/db.ts`; `lib/schema/**`; conversations; dashboards; UI components |
| `W2-CONV` | `lib/v2/conversations/**`; `lib/v2/query-runs/**`; `lib/v2/query/**`; `app/api/conversations/**`; `app/api/query/**`; conversation/query tests; `docs/v2/coordination/agents/W2-CONV.md` | connection adapter internals; dashboard repositories; visual chat components |
| `W2-DASH` | `lib/v2/dashboards/**`; `lib/v2/sharing/**`; `app/api/dashboards/**`; `app/api/public/shares/**`; dashboard/share tests; `docs/v2/coordination/agents/W2-DASH.md` | workspace shell; query execution; auth helper implementation |
| `W2-UI` | `app/(private)/**`; `app/share/**` pages only; `components/v2/**` except `components/v2/auth/**`; `hooks/v2/**`; `lib/v2/api-client/**`; UI tests; `docs/v2/coordination/agents/W2-UI.md` | all `app/api/**`; all server-only DAL/services; shared backend DTO definitions |
| `W3-HARDEN` | `lib/v2/rate-limit/**`; `lib/v2/audit/**`; `lib/v2/jobs/**`; `tests/v2/integration/**`; `tests/v2/security/**`; `tests/v2/load/**`; production-readiness docs assigned by coordinator; `docs/v2/coordination/agents/W3-HARDEN.md` | feature-owned implementation paths unless handed off |

## Shared Files Requiring Serialized Ownership

These files cannot have concurrent editors. The listed owner makes the edit
after consumers record requirements in their work logs.

| Path | Serialized owner | Process |
| --- | --- | --- |
| `package.json`, lockfiles | `W1-FND` through C1, then coordinator-assigned | requesting agent records exact package/version/reason; owner installs and commits separately |
| `tsconfig.json`, `next.config.ts`, `eslint.config.mjs` | `W1-FND` through C1, then coordinator-assigned | change only when required by a published contract or build issue |
| `app/layout.tsx`, `app/globals.css` | `W2-UI`, except Clerk provider wiring coordinated with `W1-AUTH` | auth proposes provider requirement; UI owner applies or grants exact-file handoff |
| `docs/ENGINEERING_SYSTEM_DESIGN_NOTES.md` | serialized per integrating workstream | append only the workstream's non-UI decision after checking current file; never rewrite another entry |
| `docs/v2/coordination/STATUS.md`, `DECISIONS.md`, `INTEGRATION_CONTRACTS.md` | coordinator only | agents propose changes in their own logs; coordinator applies accepted changes |
| V2 specs | coordinator only unless explicitly delegated | implementation agents do not edit specs |

## Legacy Replacement Boundaries

V1 remains readable and reusable, but its files have no default V2 owner. The
following replacement points prevent accidental concurrent rewrites:

| Legacy concern | Current evidence | V2 replacement owner and boundary |
| --- | --- | --- |
| Raw customer connection URLs | `types/index.ts`, `store/app-state/**`, `/api/connect`, `/api/schema`, `/api/query` | `W1-DATA` publishes `connectionId` services; `W2-CONV` consumes them; `W2-UI` stops sending URLs |
| PostgreSQL pools keyed by URL | `lib/db.ts`, `lib/schema/pool.ts` | `W1-DATA` owns new adapter pools keyed by stable `connectionId` |
| PostgreSQL catalog metadata | `lib/schema/introspect.ts` | `W1-DATA` maps PostgreSQL-native records to canonical metadata inside adapter boundary |
| Disabled fixed-cookie auth | `lib/auth.ts`, several pages/routes with commented checks | `W1-AUTH` owns Clerk V2 auth; legacy files stay untouched unless coordinator assigns removal |
| Session/browser-owned conversations | `store/app-state/**`, `hooks/useQueryHistory.ts` | `W2-CONV` owns durable APIs; `W2-UI` owns client consumption and transient UI state |
| `/tmp` dashboard persistence | `app/api/dashboard/store.ts` | `W2-DASH` owns PostgreSQL-backed V2 dashboard APIs |
| Existing query agent and safety | `lib/llm/**`, `lib/db.ts`, `app/api/query/_lib/**` | `W2-CONV` may reuse behavior; `W1-DATA` owns adapter validation/execution; legacy edits need explicit handoff |
| Existing charts/schema/chat UI | `components/charts/**`, `components/schema/**`, `components/chat/**` | read-only reusable components; V2 modifications are wrappers/copies under `components/v2/**` unless handed off |

## Contract Producer And Consumer Matrix

| Contract | Producer | Required consumers | Publication gate |
| --- | --- | --- | --- |
| app DB client, transaction API, IDs, records, pagination, errors | `W1-FND` | all backend workstreams | `C1` |
| safe public DTO mapping conventions | `W1-FND` | `W1-DATA`, `W2-CONV`, `W2-DASH`, `W2-UI` | `C1` |
| user/session and resource authorization helpers | `W1-AUTH` | all private API/service owners | `C2` |
| data-source capabilities, canonical metadata, adapter registry | `W1-DATA` | `W2-CONV`, `W2-UI`, `W3-HARDEN` | `C3` |
| connection and schema API DTOs | `W1-DATA` | `W2-UI`, `W2-CONV` | `C3` |
| conversation/query API DTOs and stream events | `W2-CONV` | `W2-UI`, `W2-DASH`, `W3-HARDEN` | `C4` |
| dashboard/share API and public DTOs | `W2-DASH` | `W2-UI`, `W3-HARDEN` | `C5` |
| integrated private/public UI scenarios | `W2-UI` | `W3-HARDEN` | `C6` |
| rate-limit, audit, and job interfaces | `W3-HARDEN` | relevant feature owners | `C7` |

## Integration Procedure

1. Producer records the proposed contract and exact consumer impact in its log.
2. Coordinator records review state in `CONTRACT_CHANGELOG.md` and, when
   accepted, updates coordinator-owned shared contracts.
3. Producer commits implementation and tests without consumer-path edits.
4. Consumers integrate in their owned paths and record the producer commit hash.
5. At the checkpoint, producer and consumers run focused tests plus
   `npm run build`, review diffs, and record evidence.

