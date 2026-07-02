  # QueryWise — Full Project Context (for AI Transfer)

  > **Purpose**: This document gives a complete, self-contained picture of the current state of the QueryWise project as of July 2026 on the `v2` branch. Use this when handing off to another AI or new contributor.

  ---

  ## 1. Project Overview

  **QueryWise** is a conversational Business Intelligence (BI) application for PostgreSQL.

  **Core value proposition**:
  - Connect to a PostgreSQL database (demo or your own)
  - Ask questions in natural language
  - Get generated SQL + results + automatically chosen charts
  - Save useful results as dashboard widgets
  - Share dashboards via secure public links (with optional password)

  The project has evolved through a major **V2 rewrite** that moved it from a session-based demo to a **persistent, user-owned workspace** with proper authentication, multiple connections, conversations, dashboards, and sharing.

  **Current branch**: `v2`
  **Primary deployment target**: Vercel (web) + separate worker process

  ---

  ## 2. Repository Structure (Monorepo)

  ```
  query-wise/
  ├── apps/
  │   ├── web/                 # Next.js 16 (App Router) — main application
  │   └── worker/              # BullMQ background worker (schema ingestion)
  ├── packages/
  │   └── shared/              # @query-wise/shared — domain types, Prisma, adapters, security
  ├── docs/
  │   └── v2/                  # Very detailed specs, contracts, architecture, coordination
  ├── packages/shared/prisma/schema.prisma
  └── pnpm-workspace.yaml
  ```

  **Key characteristics**:
  - pnpm workspaces (no Turborepo)
  - `packages/shared` contains the Prisma schema + core domain logic used by both web and worker
  - Strong separation between **application database** (QueryWise product data) and **customer data sources**

  ---

  ## 3. Tech Stack

  | Layer              | Technology |
  |--------------------|----------|
  | Frontend           | Next.js 16 (App Router + Turbopack), React 19, Tailwind, shadcn/ui, Recharts |
  | Auth               | Clerk (primary). Some legacy disabled-auth paths exist |
  | Backend            | Node.js runtime in Route Handlers |
  | Database (app)     | PostgreSQL (Neon in dev) + Prisma |
  | ORM / DAL          | Prisma + custom Data Access Layer (DAL) |
  | LLM                | AI SDK (`@ai-sdk/*`) — supports Groq, Google Gemini, Anthropic |
  | Background Jobs    | BullMQ + Redis (worker) |
  | Charts             | Recharts (via V2Chart wrapper) |
  | Data Sources       | Capability-based adapter system (currently only PostgreSQL) |
  | Vector / Embeddings| Used for schema retrieval (in worker) |
  | Caching            | Redis (public dashboard cache), in-memory for some things |
  | Security           | Server-side secret encryption, query safety validation, rate limiting |

  ---

  ## 4. Domain Model & Persistence

  The application database uses prefixed tables (`v2_*`).

  ### Core Entities (from Prisma schema)

  - **User** — lightweight profile keyed by Clerk `userId`
  - **DatabaseConnection** — user-owned connection (credentials encrypted)
  - **SchemaSnapshot** — partitioned metadata + embeddings from the connected DB
  - **Conversation** — persistent chat thread bound to one connection
  - **Message** — ordered entries in a conversation
  - **QueryRun** — durable ledger of a query execution (status machine, idempotency, result preview)
  - **Dashboard** + **DashboardWidget** — widgets store `snapshot` + optional `queryDefinition` for refresh
  - **DashboardAccessGrant** — private sharing (user-to-user)
  - **DashboardShareLink** — public link sharing (token + optional password)
  - **AuditLog** — append-only audit events

  **Important invariants**:
  - Connections are immutable for a conversation once chosen.
  - Public shares **never** expose SQL, credentials, or internal IDs.
  - Widgets can be refreshed live on public shares using saved `queryDefinition`.

  ---

  ## 5. Authentication & Authorization

  **Current primary auth**: Clerk

  - Middleware protects private routes
  - Public routes: `/`, `/sign-in`, `/sign-up`, `/shared/[token]`, `/api/public/shares/*`
  - Server-side: `requireUser()`, `requireDashboardAccess()`, etc. (in `lib/dal/authorization` and services)

  There are **AUTH_DISABLED** documents showing that full auth can be (and has been) turned off for demos/experiments by commenting checks. However, on the `v2` branch the expectation is **Clerk + proper server authorization**.

  Authorization follows a strict server-only DAL pattern — never trust client-provided owner IDs.

  ---

  ## 6. Major Features Implemented

  ### 6.1 Connections & Schema Management

  - Users can add multiple PostgreSQL connections
  - Credentials are encrypted server-side (`encryptedSecret` + `credentialVersion`)
  - Schema introspection via background worker (BullMQ)
  - Metadata is turned into canonical `CanonicalDataSourceMetadata` (tables, columns, relationships, types)
  - Vector embeddings + retrieval for relevant tables during NL queries
  - Status tracking (`pending` → `connected` → schema sync states)

  ### 6.2 Natural Language to SQL (NL-to-SQL Pipeline)

  Located primarily in `apps/web/lib/nl-sql/`

  **Staged pipeline** (`planStagedNlSqlQuery`):
  1. **Rewrite** — turn follow-up question + history into standalone question
  2. **Table Retrieval** — vector + adaptive candidate selection
  3. **Column Pruning** (optional)
  4. **SQL Plan + Generation** — structured LLM output for plan, then SQL
  5. **Validation** — strict read-only + safety checks
  6. **Execution**
  7. **Explanation + Chart Hint**

  Hybrid chart selection:
  - Deterministic `detectChartConfig` base
  - Optional LLM `ChartHint`
  - Strict validation of hint against actual result columns

  ### 6.3 Durable Query Execution

  - Every query creates a `QueryRun` with full state machine (`accepted` → `generating` → `validating` → `executing` → `succeeded/failed`)
  - Idempotency keys + request fingerprints
  - SSE streaming of status + final result
  - Cancellation support
  - Result previews are bounded (`createResultPreview`)
  - Background recovery for stuck runs (`/api/internal/query-runs/recover`)

  ### 6.4 Dashboards & Widgets

  - Multiple dashboards per user
  - Widgets contain:
    - `snapshot` (BoundedResultPreview) — what is shown
    - `chartConfig`
    - `queryDefinition` + `queryRunId` (for future refresh)
  - Drag-and-drop layout (react-grid-layout)
  - Widgets saved from chat results

  ### 6.5 Charts & Visualization (V2)

  - `V2Chart` + `ChartRenderer` abstraction
  - Recharts-based views: Bar, Line, Area, Pie, Scatter, Table
  - Supports multi-series (`yKeys`)
  - Used in both private dashboards and public shares

  **Recent fix**: Public share containers now use proper flex + explicit height so charts actually render (previously `min-h-64` caused 0-height containers).

  ### 6.6 Public Sharing (Significant V2 Feature)

  Full implementation in `lib/sharing/` + `app/api/public/shares/` + `app/shared/[token]`

  Key properties:
  - Cryptographically strong tokens (encrypted copy stored for owner)
  - Optional password protection (with rate-limited attempts)
  - **Live re-execution** on public load (never sends stale snapshot or SQL)
  - Strict provenance check: saved `queryDefinition` must still match the original `queryRun`
  - Bounded results (100 rows, 50 cols, 256KiB per widget, 50 widgets)
  - View count + `lastViewedAt` tracking (now best-effort)
  - Separate public DTO (`PublicDashboardDto`) — no secrets, no SQL

  **Recent reliability work** (this session):
  - Whitespace-normalized query matching (`queriesMatch`)
  - View count increment changed to fire-and-forget to prevent P2024 pool timeouts from killing public responses
  - Layout fixes so charts are visible

  ### 6.7 Other Systems

  - **Audit logging** — best-effort redacted audit trail
  - **Idempotency** — for queries, tests, refreshes, shares
  - **Rate limiting** — especially on password unlock attempts
  - **Redis usage**:
    - Public dashboard response cache (with locking/single-flight)
    - BullMQ for worker
  - **Export**: CSV / JSON / XLSX from results

  ---

  ## 7. Data Source Adapter System (Extensibility)

  Defined in `packages/shared/src/data-sources/` and types.

  **Capability-based** (not provider-specific in product code):

  Capabilities include: `read-sql-execution`, `sql-validation`, `metadata-introspection`, etc.

  Currently only `postgresql` adapter is implemented (using `pg` driver with careful pooling, network policy, read-only validation).

  This design was intentional to allow future MySQL/SQL Server/etc. without rewriting product features.

  ---

  ## 8. LLM Usage

  Multiple distinct LLM call sites (not a single monolith):

  1. **Main query pipeline** (`lib/nl-sql/`) — rewrite, table selection, SQL generation, chart hint, explanation
  2. **Conversation title generation**
  3. **Schema ingestion worker** (separate env vars: `QUERYWISE_INGESTION_LLM_*`)
  4. **Settings** — user can choose provider + model (Groq, Gemini, Anthropic supported)

  Backend config is **never** taken from client — always from server env (`getBackendLlmConfig`).

  ---

  ## 9. API Surface (V2 Contracts)

  Major groups:

  **Private (Clerk-protected)**
  - `/api/connections/*`
  - `/api/conversations/*`
  - `/api/dashboards/*` (including widgets + shares management)
  - `/api/query`
  - `/api/query/[queryRunId]`

  **Public**
  - `GET /api/public/shares/[token]`
  - `POST /api/public/shares/[token]/unlock`

  All responses follow `contractVersion: "querywise.v2"`.

  Strong use of Zod validation + consistent error shapes.

  ---

  ## 10. UI Structure (apps/web)

  - Root layout + Clerk provider
  - `(private)` group for authenticated app
  - Main areas:
    - `/chats/...` + WorkspaceView (three-column intent)
    - `/dashboards/...` + DashboardGrid
    - `/connections/...`
    - `/shared/[token]` — standalone public share viewer (`PublicShareView`)
  - Components are mostly under `components/` (V2 style flattened)
  - Heavy use of `useApiResource` hook for data fetching

  **Important recent component**: `PublicShareView.tsx` + `V2Chart.tsx`

  ---

  ## 11. Background Worker (apps/worker)

  - Uses BullMQ + Redis
  - Responsible for schema ingestion:
    - Introspect tables/columns
    - LLM-generated descriptions
    - Embeddings for retrieval
  - Separate LLM credentials from main app
  - Status reported back to web via DB

  ---

  ## 12. Security & Safety Posture

  **Enforced**:
  - All customer DB queries are validated as read-only single statements
  - No raw credentials ever leave the server
  - Public shares use completely separate trust path + bounded data
  - Server-side encryption for secrets
  - Idempotency + audit
  - Capability checks before using adapter features

  **Known / discussed tradeoffs**:
  - Heavy queries can still be expensive (row/timeout limits exist)
  - Prompt injection surface at LLM layer (mitigated by validation gate)
  - Public live refresh executes using *owner's* credentials (by design)

  ---

  ## 13. Documentation Culture

  This project has **exceptionally detailed** documentation under `docs/v2/`:

  - `contracts/` — hard API, DTO, error, bounds, and public sharing contracts
  - `architecture/` — ADRs, threat model, performance budgets, retention, etc.
  - `coordination/` — multi-agent ownership matrix, decisions, status
  - `SPEC_*.md` files for different workstreams
  - `ENGINEERING_SYSTEM_DESIGN_NOTES.md` — the single most important file for non-UI decisions

  Agents are expected to update `ENGINEERING_SYSTEM_DESIGN_NOTES.md` for important backend changes.

  ---

  ## 14. Current State & Known Realities (as of July 2026)

  **Working**:
  - Full Clerk auth + ownership
  - Multiple connections
  - Persistent conversations + durable query runs + streaming
  - Dashboards with widgets + drag layout
  - Public link sharing (with password) + live chart refresh
  - Schema sync via worker (when Redis present)
  - Hybrid NL→SQL + chart selection

  **Common local dev gotchas**:
  - No Redis → public shares always do full re-execution + no caching
  - Neon dev DB has small connection pools → long public requests can hit P2024 (partially mitigated by best-effort increment)
  - Need proper env vars for LLM keys + app DB

  **Recent changes** (this work session):
  - Fixed public shared charts being invisible (layout/sizing)
  - Made view count updates non-fatal
  - Improved query definition matching tolerance
  - Updated engineering notes

  ---

  ## 15. How to Run (High Level)

  1. `pnpm install`
  2. Configure `.env` (see README)
  3. `pnpm --filter @query-wise/shared db:migrate:dev`
  4. Seed demo data if desired
  5. `pnpm dev` (starts both web + worker)
  6. Sign in via Clerk

  Build: `pnpm build`

  ---

  ## 16. Key Files & Directories to Know

  **Critical backend logic**:
  - `apps/web/lib/nl-sql/` — entire NL pipeline
  - `apps/web/lib/query/orchestrator.ts` — durable execution
  - `apps/web/lib/dashboards/`
  - `apps/web/lib/sharing/service.ts` — public sharing core
  - `apps/web/lib/data-sources/` (thin wrapper)
  - `packages/shared/src/data-sources/postgresql/`

  **Contracts & Truth**:
  - `docs/v2/contracts/`
  - `packages/shared/prisma/schema.prisma`
  - `docs/ENGINEERING_SYSTEM_DESIGN_NOTES.md`

  **Public sharing UI**:
  - `apps/web/app/shared/[token]/page.tsx`
  - `apps/web/components/PublicShareView.tsx`

  ---

  This document should give another AI (or human) a near-complete mental model of the project without needing to read dozens of files first.

  **Last major context update**: 2026-07-01 (public share reliability + visibility work)