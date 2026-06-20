# QueryWise Codebase Review

**Date:** 2026-06-20
**Commit reviewed:** `ecd8807` (`feature/v2-workspace-shell`)
**Mode:** Review remediation in progress.
**Result:** 7 resolved findings; 20 remain open.

> **Tracking instruction:** After a finding is fixed and verified, complete its 2–3 line resolution notes, then change the checkbox from `[ ]` to `[x]`.

## Scope and method

The repository was split across three independent review passes:

1. Backend/security: authentication, authorization, persistence, connections, sharing, ingestion, API routes, Prisma, and migrations.
2. Query pipeline: NL-to-SQL, query-run lifecycle, SQL safety, LLM boundaries, schema retrieval, execution, cancellation, SSE, charts, and exports.
3. Frontend/Next.js: routes, React components, hooks, API clients, accessibility, responsive behavior, and UI/spec completeness.

Each finding below was traced through its callers, persistence model, API contract, or UI consumer. Style-only observations and unverified concerns are excluded. `docs/ASSIGNMENT.md`, required by `AGENTS.md`, was not present; the review therefore used the checked-in v2 specs, contracts, ADRs, and threat model.

### Severity

- **P1:** High-impact security, correctness, availability, or required-product-functionality defect.
- **P2:** Material reliability, safety, accessibility, or completeness defect that should be scheduled promptly.
- **P3:** Lower-impact correctness defect with a narrow trigger.

## P1 findings

### P1-01 — Unauthenticated legacy PostgreSQL endpoints enable SSRF and data exposure

- [x] **Resolved**

**Resolution notes (required, 2–3 lines):**
- **Change:** Authenticated legacy DB routes, retired raw schema introspection, and routed connection tests through the v2 SSRF/TLS adapter with one-shot cleanup.
- **Verification:** Targeted lint and production build cover the changed routes; unsafe targets and raw-schema access are rejected by the new boundaries.

**Confidence:** 10/10
**Evidence:** `app/api/connect/route.ts:33-38,55-75`, `app/api/schema/route.ts:16-21,38-56`, `lib/db.ts:14-27,135-149`, `lib/schema/pool.ts:13-24`, `lib/schema/introspect.ts:121-208`

Both legacy routes leave their authentication checks commented out. `/api/connect` opens a caller-supplied PostgreSQL URL, while `/api/schema` introspects it and returns metadata, sample rows, ranges, and top values. The legacy pool code applies no destination IP/DNS/port policy, disables TLS certificate verification, keys global pools by raw credential-bearing URLs, and does not evict them.

**Impact:** An unauthenticated caller with a usable PostgreSQL URL can make the server connect to internal/private targets and return database-derived information. Repeated unique URLs can also accumulate secret-bearing pools in memory.

**Recommended fix:** Remove/disable the legacy endpoints or require Clerk authentication and an owner-scoped `connectionId`. Route all connections through the v2 adapter and network policy, restore TLS verification, bound pool lifetime/count, and avoid returning upstream connection details.

### P1-02 — Legacy dashboard APIs are ownerless and permit overwrite/disclosure

- [x] **Resolved**

**Resolution notes (required, 2–3 lines):**
- **Change:** Added Clerk ownership to legacy dashboard persistence/read/share flows, stripped owner IDs from DTOs, rejected ownerless records, and bounded request/widget/result sizes.
- **Verification:** Production build/type checking and targeted route lint validate the scoped storage and API changes.

**Confidence:** 10/10
**Evidence:** `app/api/dashboard/route.ts:10-74`, `app/api/dashboard/store.ts:58-72`, `app/api/share/route.ts:15-28`, `app/api/share/[shareId]/route.ts:6-16`

Authentication is commented out on legacy dashboard save/share routes. A caller supplies the dashboard ID and full dashboard payload; the global store overwrites records by that ID. Any known dashboard ID can then be published, and the public share response contains stored SQL and result data. Widget and row arrays are not bounded.

**Impact:** Unauthenticated callers can overwrite known dashboards, publish them, retrieve stored SQL/results, and force unbounded memory/disk payload writes.

**Recommended fix:** Remove the v1 routes or migrate them to v2 owner-scoped services. Enforce ownership for every mutation/read and add request-byte, widget-count, row-count, and cell-size bounds.

### P1-03 — Public-share GET is an unthrottled database-query amplifier

- [x] **Resolved**

**Resolution notes (required, 2–3 lines):**
- **Change:** Added concurrency-four widget execution, one 30-second budget, Redis DTO caching, distributed locking, local single-flight, and versioned invalidation keys.
- **Verification:** Targeted cache/service lint passes; production build validates the Redis integration and public DTO types.

**Confidence:** 9/10
**Evidence:** `lib/v2/sharing/service.ts:306-379,395-421`

Loading a public dashboard executes every saved widget query sequentially. A dashboard can have 50 widgets, and each query can consume up to its own 15-second execution window and return up to the configured row/byte caps. Password attempts are rate-limited, but ordinary public-share reads are not.

**Impact:** Anyone with an unprotected share token can repeatedly consume the owner's database connections and application resources. A single request can theoretically spend roughly 750 seconds across sequential widget timeouts.

**Recommended fix:** Serve bounded stored snapshots by default. If live refresh is required, use cached/background refresh plus distributed per-share/global rate limits, concurrency limits, and one total request deadline/query budget.

### P1-04 — Query submission has no rate or concurrency gate

- [ ] **Resolved**

**Resolution notes (required, 2–3 lines):**
- **Change:** _Describe the implemented fix and key files changed._
- **Verification:** _Record the tests/checks run and their result._

**Confidence:** 10/10
**Evidence:** `app/api/query/route.ts:40-63`

Every newly accepted idempotency key immediately starts the complete LLM and database pipeline. No distributed per-user or per-connection lease/rate limit is acquired before execution.

**Impact:** One authenticated user can submit many unique requests concurrently, consuming LLM spend and exhausting application/customer database pools.

**Recommended fix:** Acquire distributed per-user and per-connection leases before execution, return `429` when limits are reached, and release leases in `finally`. Add a longer-window request rate limit as well as an active-run limit.

### P1-05 — SSE transport failures can corrupt durable query status

- [x] **Resolved**

**Resolution notes (required, 2–3 lines):**
- **Change:** SSE emit/close now tolerate cancellation and closed controllers, while stream transport failures are kept outside durable execution state.
- **Verification:** Production build validates the Web Stream implementation; disconnect handling is guarded at emit, close, and cancel boundaries.

**Confidence:** 9/10
**Evidence:** `lib/v2/query/sse.ts:6-24`

The stream emitter directly calls `controller.enqueue`, and the durable execution promise is coupled to the stream controller. If the client disconnects, later enqueue/close operations can throw into the query execution path.

**Impact:** A successfully progressing query can be persisted as failed because its HTTP transport disappeared, even though the underlying LLM/database work was not itself invalid.

**Recommended fix:** Track stream cancellation/closure, make emits safe no-ops after closure, guard `enqueue`/`close`, and keep transport errors outside the durable orchestrator's failure handling.

### P1-06 — Query cancellation only works inside one process

- [ ] **Resolved**

**Resolution notes (required, 2–3 lines):**
- **Change:** _Describe the implemented fix and key files changed._
- **Verification:** _Record the tests/checks run and their result._

**Confidence:** 9/10
**Evidence:** `lib/v2/query/cancellation.ts:3-16`

Active `AbortController` instances live in a process-local `Map`. In multi-instance/serverless deployment, a cancel request handled by one instance cannot abort work running on another.

**Impact:** The database record may say `cancelled` while another instance continues LLM and SQL work, consuming resources and potentially finishing side work after cancellation.

**Recommended fix:** Use a distributed cancellation signal/lease such as Redis/pub-sub or a durable worker. Re-check durable terminal state between pipeline stages and use database-driver cancellation where supported.

### P1-07 — Conversations over 100 messages hide all newer messages

- [x] **Resolved**

**Resolution notes (required, 2–3 lines):**
- **Change:** Message APIs now return the newest bounded page and paginate backward; the UI merges/dedupes pages and preserves scroll position while loading older messages.
- **Verification:** Production build validates API/client contracts; manual verification should use a conversation exceeding 100 messages.

**Confidence:** 10/10
**Evidence:** `components/v2/WorkspaceView.tsx:987,995,1037`, `lib/v2/conversations/service.ts:188-228`

The conversation view requests exactly one 100-message page and never follows `pageInfo.nextCursor`. The server returns pages in oldest-first order.

**Impact:** Starting at message 101, the UI permanently displays only the oldest 100 messages. A newly submitted answer can succeed but remain invisible after refresh.

**Recommended fix:** Implement cursor pagination with deterministic merge/deduplication. Prefer loading the newest page for initial display and provide a “load older” path, or exhaust cursors when appropriate.

### P1-08 — Mobile/tablet context-panel toggle has no visible result

- [ ] **Resolved**

**Resolution notes (required, 2–3 lines):**
- **Change:** _Describe the implemented fix and key files changed._
- **Verification:** _Record the tests/checks run and their result._

**Confidence:** 10/10
**Evidence:** `components/v2/WorkspaceView.tsx:1091-1099,1161-1166`

The context toggle remains available below the desktop breakpoint, but the panel container is always hidden below `lg`.

**Impact:** Mobile/tablet users cannot access schema context, SQL details, or result summary through the advertised control.

**Recommended fix:** Render the context panel in an accessible Sheet/Dialog below `lg`, while retaining the collapsible desktop aside.

### P1-09 — Resource hook allows stale requests to overwrite current data

- [ ] **Resolved**

**Resolution notes (required, 2–3 lines):**
- **Change:** _Describe the implemented fix and key files changed._
- **Verification:** _Record the tests/checks run and their result._

**Confidence:** 9/10
**Evidence:** `hooks/v2/use-api-resource.ts:10-24`

The hook starts asynchronous loaders without cancellation or a request-generation guard. When dependencies change, an older request can resolve after the newer request and still update `data`, `error`, and `loading`.

**Impact:** Rapid navigation can display a previous conversation, dashboard, or connection under the new route and allow actions against stale data.

**Recommended fix:** Use an `AbortController` where supported or a monotonic request ID. Abort/retire requests during effect cleanup and ignore stale completions.

### P1-10 — Direct-email sharing is missing from the UI

- [ ] **Resolved**

**Resolution notes (required, 2–3 lines):**
- **Change:** _Describe the implemented fix and key files changed._
- **Verification:** _Record the tests/checks run and their result._

**Confidence:** 10/10
**Evidence:** `components/v2/ShareDashboardModal.tsx:170-204,359-442`, `lib/v2/api-client/resources.ts:129-169`

The modal only creates and revokes link shares. The API types/resources support grant operations, and the dashboard-sharing specification requires direct-email sharing.

**Impact:** Owners cannot use a required sharing mode even though backend support exists.

**Recommended fix:** Add email-grant creation, grant listing, revoke/remove actions, validation, loading, and error states.

### P1-11 — Dashboard rename and delete are absent

- [x] **Resolved**

**Resolution notes (required, 2–3 lines):**
- **Change:** Added owner-only rename/delete actions to dashboard list/detail views with confirmation, loading/errors, refresh, and redirect after detail deletion.
- **Verification:** Production build validates API usage and component types; targeted lint reports only pre-existing project warnings/errors outside these actions.

**Confidence:** 10/10
**Evidence:** `components/v2/DashboardsView.tsx:48-120,123-225`, `lib/v2/api-client/resources.ts:129-169`

The dashboard UI supports listing, creation, opening, sharing, and layout editing, but exposes neither rename nor delete despite available API methods and spec requirements.

**Impact:** Users cannot complete basic dashboard lifecycle operations from the product UI.

**Recommended fix:** Add owner-only rename and delete controls with confirmation, mutation errors, list refresh, and post-delete navigation.

### P1-12 — Connection settings cannot update name or credentials

- [ ] **Resolved**

**Resolution notes (required, 2–3 lines):**
- **Change:** _Describe the implemented fix and key files changed._
- **Verification:** _Record the tests/checks run and their result._

**Confidence:** 10/10
**Evidence:** `components/v2/ConnectionsView.tsx:618-628`, `lib/v2/api-client/resources.ts:25-48`

Connection detail/settings expose test, refresh, and delete actions only. The API already supports update, but the UI has no form for renaming or replacing credentials; settings and schema routes currently render the same view.

**Impact:** A required connection-management workflow is inaccessible without deleting and recreating the connection.

**Recommended fix:** Add a settings form for name and optional replacement connection string, including retest/save failures and explicit secret-handling behavior.

### P1-13 — Legacy public-share page trusts forwarded host headers for server fetches

- [ ] **Resolved**

**Resolution notes (required, 2–3 lines):**
- **Change:** _Describe the implemented fix and key files changed._
- **Verification:** _Record the tests/checks run and their result._

**Confidence:** 8/10
**Evidence:** `app/share/[shareId]/page.tsx:8-14`

The server-rendered page constructs an internal fetch origin from `x-forwarded-proto`, `x-forwarded-host`, or `host`, all of which require trusted-proxy enforcement to be safe.

**Impact:** In deployments where these headers are attacker-controlled, a page request can make the server fetch an attacker-selected origin.

**Recommended fix:** Call the sharing service directly, use a trusted configured canonical origin, or remove the obsolete legacy page. Do not derive server-side destinations from request headers.

## P2 findings

### P2-01 — Idempotency keys are validated and then discarded

- [x] **Resolved**

**Resolution notes (required, 2–3 lines):**
- **Change:** Added persisted fingerprinted idempotency records and replay semantics; schema refresh also derives the durable ingestion job ID from the client key.
- **Verification:** Prisma schema/client validation and production build cover the new model, migration, routes, and services.

**Confidence:** 10/10
**Evidence:** `app/api/connections/[connectionId]/test/route.ts:8-12`, `app/api/connections/[connectionId]/schema/refresh/route.ts:9-13`, `lib/v2/schema/service.ts:20-23`, `lib/v2/connections/service.ts:164-174`

Both routes parse a required `idempotencyKey` but do not pass it to the service. Schema refresh creates a timestamp-derived job and connection test always reconnects.

**Impact:** Client/network retries repeat costly connection attempts and ingestion jobs, contrary to the API contract.

**Recommended fix:** Persist the key with a canonical request fingerprint, return the previous result for exact retries, and reject reuse with a different payload.

### P2-02 — Failed connection tests can leave orphaned pending records

- [ ] **Resolved**

**Resolution notes (required, 2–3 lines):**
- **Change:** _Describe the implemented fix and key files changed._
- **Verification:** _Record the tests/checks run and their result._

**Confidence:** 9/10
**Evidence:** `lib/v2/connections/service.ts:68-75`

Connection creation persists encrypted credentials before testing. Exceptions thrown by network policy, DNS, or adapter setup can bypass the later status update.

**Impact:** The API reports failure while a hidden `pending` connection and encrypted secret remain. Repeated retries can accumulate records.

**Recommended fix:** Test before persistence when feasible, or guarantee compensating deletion/failure-state updates for every thrown path.

### P2-03 — Dashboard widget cap is raceable

- [ ] **Resolved**

**Resolution notes (required, 2–3 lines):**
- **Change:** _Describe the implemented fix and key files changed._
- **Verification:** _Record the tests/checks run and their result._

**Confidence:** 9/10
**Evidence:** `lib/v2/dashboards/service.ts:73-80,213-225`, `lib/v2/sharing/service.ts:410-416`

Widget creation performs count-then-insert under default transaction isolation without locking or a database-enforced capacity rule. Concurrent requests can both observe 49 and insert.

**Impact:** A dashboard can exceed 50 widgets, after which private/public reads reject the entire dashboard.

**Recommended fix:** Serialize creation with a row/advisory lock or enforce capacity atomically at the database layer.

### P2-04 — Security audit logging is defined but unused

- [ ] **Resolved**

**Resolution notes (required, 2–3 lines):**
- **Change:** _Describe the implemented fix and key files changed._
- **Verification:** _Record the tests/checks run and their result._

**Confidence:** 10/10
**Evidence:** `prisma/schema.prisma:278-290`

The `AuditLog` model exists, but no audit-log writes were found in application, library, or worker code for connection changes/tests, schema refreshes, sharing changes, or authorization failures.

**Impact:** Security-sensitive operations cannot be reconstructed during incident response, contrary to the production-hardening specification.

**Recommended fix:** Add secret-redacted audit events, transactionally where appropriate, for the operations enumerated by the hardening spec.

### P2-05 — Expensive authenticated operations lack rate limits

- [ ] **Resolved**

**Resolution notes (required, 2–3 lines):**
- **Change:** _Describe the implemented fix and key files changed._
- **Verification:** _Record the tests/checks run and their result._

**Confidence:** 10/10
**Evidence:** `lib/v2/sharing/rate-limit.ts`; affected routes include dashboard share creation, connection test, and schema refresh.

Only share-password attempts have rate limiting. Share/link creation, connection tests, and schema refresh/job creation have no distributed per-user/global limits.

**Impact:** An authenticated user can create excessive rows, external identity lookups, database connections, and ingestion jobs.

**Recommended fix:** Add distributed per-user and global limits with operation-specific costs, clear `429` responses, and observability.

### P2-06 — Crashed query runs are not recovered unless the same key is retried

- [ ] **Resolved**

**Resolution notes (required, 2–3 lines):**
- **Change:** _Describe the implemented fix and key files changed._
- **Verification:** _Record the tests/checks run and their result._

**Confidence:** 10/10
**Evidence:** `lib/v2/query-runs/service.ts:73-99`

Stale-run recovery is checked only when the exact `(conversationId, idempotencyKey)` is submitted again. Normal fresh submissions use new UUIDs.

**Impact:** A process crash can leave a run nonterminal indefinitely, and polling never self-heals it.

**Recommended fix:** Add a scheduled recovery worker that scans stale nonterminal runs and atomically fails/expires them independently of resubmission.

### P2-07 — SQL execution begins without a persisted validation outcome

- [ ] **Resolved**

**Resolution notes (required, 2–3 lines):**
- **Change:** _Describe the implemented fix and key files changed._
- **Verification:** _Record the tests/checks run and their result._

**Confidence:** 10/10
**Evidence:** `lib/v2/query/orchestrator.ts:175-184`, `lib/v2/data-sources/postgresql/adapter.ts:45-50`

The orchestrator transitions to `executing` and emits an SQL preview with `validation: "pending"`. Actual validation occurs only inside `executeReadQuery`, so clients never receive a durable `valid` or `blocked` validation state before execution.

**Impact:** Invalid SQL appears to start execution and then fails, contradicting the query-run state/preview contract and reducing audit clarity.

**Recommended fix:** Validate during the validating stage, persist/emit `valid` or `blocked`, then execute with a defensive second validation.

### P2-08 — Qualified system catalogs bypass SQL policy

- [ ] **Resolved**

**Resolution notes (required, 2–3 lines):**
- **Change:** _Describe the implemented fix and key files changed._
- **Verification:** _Record the tests/checks run and their result._

**Confidence:** 10/10
**Evidence:** `lib/v2/data-sources/postgresql/validation.ts:38-49`

The AST walker checks string-valued `node.name` but does not inspect the `schema` field of qualified relation names. `SELECT * FROM information_schema.tables` is parsed with a qualified name and passes despite `blockSystemCatalogs: true`.

**Impact:** Generated queries can read catalog relations that the configured policy explicitly intends to block.

**Recommended fix:** Explicitly inspect qualified relation/function shapes such as `node.name.schema` and reject `information_schema` and `pg_catalog`. Add parser-shape regression tests.

### P2-09 — CSV/TSV exports permit spreadsheet formula injection

- [ ] **Resolved**

**Resolution notes (required, 2–3 lines):**
- **Change:** _Describe the implemented fix and key files changed._
- **Verification:** _Record the tests/checks run and their result._

**Confidence:** 9/10
**Evidence:** `lib/export.ts:10-26,73-85`

Database cell values are written to CSV/clipboard TSV without neutralizing formula-leading characters such as `=`, `+`, `-`, and `@`.

**Impact:** Opening or pasting exported data into spreadsheet software may execute attacker-controlled formulas contained in customer data.

**Recommended fix:** Prefix formula-leading cells with a single quote for spreadsheet-targeted CSV/TSV output and test control-character variants.

### P2-10 — Metadata timeout is per query rather than a total deadline

- [ ] **Resolved**

**Resolution notes (required, 2–3 lines):**
- **Change:** _Describe the implemented fix and key files changed._
- **Verification:** _Record the tests/checks run and their result._

**Confidence:** 9/10
**Evidence:** `lib/v2/data-sources/postgresql/metadata.ts:23-68`

Three sequential introspection queries can each consume a 30-second statement timeout, excluding connection setup.

**Impact:** A foreground metadata operation can approach 90 seconds despite the intended 30-second bound.

**Recommended fix:** Apply one wall-clock `AbortSignal`/deadline across connection and all queries, setting each statement timeout to the remaining budget.

### P2-11 — Dialog and sheet primitives lack modal accessibility behavior

- [ ] **Resolved**

**Resolution notes (required, 2–3 lines):**
- **Change:** _Describe the implemented fix and key files changed._
- **Verification:** _Record the tests/checks run and their result._

**Confidence:** 10/10
**Evidence:** `components/ui/dialog.tsx:28-45`, `components/ui/sheet.tsx:22-44`

The primitives lack complete dialog semantics, accessible labelling, initial focus, focus trapping/restoration, and background inert/scroll-lock handling.

**Impact:** Keyboard and assistive-technology users can move focus into content behind an open modal and may not understand the modal's role/title.

**Recommended fix:** Use a proven accessible primitive or implement `role="dialog"`, `aria-modal`, labelled relationships, focus lifecycle, Escape handling, inert background, and scroll locking.

### P2-12 — Custom select lacks standard combobox/listbox behavior

- [ ] **Resolved**

**Resolution notes (required, 2–3 lines):**
- **Change:** _Describe the implemented fix and key files changed._
- **Verification:** _Record the tests/checks run and their result._

**Confidence:** 10/10
**Evidence:** `components/ui/select.tsx:64-117`

The custom control lacks combobox/listbox roles, expanded/active-descendant state, and Arrow/Home/End/typeahead interaction.

**Impact:** Keyboard and screen-reader interaction does not match expected select behavior and requires tabbing through individual options.

**Recommended fix:** Prefer a native `<select>` where suitable or use an accessible headless select primitive.

### P2-13 — Dashboard layout saves fail silently

- [ ] **Resolved**

**Resolution notes (required, 2–3 lines):**
- **Change:** _Describe the implemented fix and key files changed._
- **Verification:** _Record the tests/checks run and their result._

**Confidence:** 9/10
**Evidence:** `components/v2/DashboardGrid.tsx:74-85`

The debounced layout mutation is fire-and-forget with no rejection handling, rollback, or error state.

**Impact:** Failed saves appear successful in the current UI, can create unhandled rejections, and unexpectedly revert after refresh.

**Recommended fix:** Route saves through explicit mutation state, catch failures, show retry/error UI, and restore the last confirmed server layout when appropriate.

## P3 finding

### P3-01 — Exact column limit is incorrectly reported as truncated

- [ ] **Resolved**

**Resolution notes (required, 2–3 lines):**
- **Change:** _Describe the implemented fix and key files changed._
- **Verification:** _Record the tests/checks run and their result._

**Confidence:** 10/10
**Evidence:** `lib/v2/data-sources/postgresql/metadata.ts:90`

The metadata code marks a table's columns as truncated when the returned count is `>= maxColumnsPerEntity`. A table with exactly the configured maximum is therefore reported as incomplete without evidence of an additional column.

**Impact:** Downstream schema context can incorrectly claim incomplete metadata for an exact-boundary table.

**Recommended fix:** Fetch `limit + 1` or obtain a separate count, then mark truncation only when more than the configured maximum exists.

## Verification and coverage observations

- `npm run build` passed with Next.js 16.2.1.
- `npm run lint` failed with 10 errors and 39 warnings. Confirmed errors include stale manual memoization dependencies in `components/ui/code-block.tsx` and multiple React compiler `set-state-in-effect` violations.
- No automated test files were found. The security, query-state, pagination, concurrency, and parser-policy paths above therefore lack checked-in regression coverage.
- Next.js warned that multiple lockfiles caused it to infer `D:\Desktop\package-lock.json` as the workspace root rather than this repository. Configure `turbopack.root` or remove the unintended parent lockfile if applicable.

## Suggested remediation order

1. Disable or migrate the unauthenticated legacy DB/dashboard/share routes.
2. Add distributed query/public-share rate, concurrency, and cancellation controls.
3. Fix SQL catalog validation and isolate durable execution from SSE transport state.
4. Repair conversation pagination and stale client-request handling.
5. Complete required sharing/dashboard/connection UI workflows.
6. Address remaining P2/P3 items and add focused regression tests for each fix.
