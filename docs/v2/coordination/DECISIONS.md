# QueryWise V2 Architecture Decisions

The coordinator owns this file. Agents propose changes in their work logs.

## Accepted Decisions

### D-001: User-Level Ownership

V2 resources are owned by individual Clerk users. Organizations and team
workspaces are out of scope.

### D-002: Separate Application And Customer Databases

QueryWise persists product data in its own PostgreSQL application database.
Connected customer databases are external data sources and are never used as
the QueryWise persistence store.

### D-003: PostgreSQL First, SQL-Provider Adapters

V2 ships a PostgreSQL adapter only. Core product modules depend on a
SQL-provider-neutral adapter contract and capability checks so future MySQL,
SQL Server, analytical SQL, and other SQL adapters can be added without
rewriting conversations, connections, dashboards, or authorization. NoSQL
providers are out of scope.

### D-004: Server-Side DAL Trust Boundary

Private data access occurs through server-only DAL modules that enforce
authorization and return minimal DTOs. Client-provided user IDs are never
trusted.

### D-005: Snapshot Dashboards In V2

Dashboard widgets persist bounded result snapshots and chart definitions.
Automatic live refresh is out of scope for V2.

### D-006: Per-Agent Logs

Each agent writes to its own work log. Shared status, decisions, and contracts
are coordinator-owned to prevent parallel merge conflicts.

### D-007: Application Persistence Stack

The QueryWise application database uses PostgreSQL with Prisma ORM and
forward-only migrations. Customer SQL data sources remain isolated behind SQL
adapter boundaries and are never accessed through the application DAL.

### D-008: Durable Jobs And Distributed Limits

Durable background work uses a leased PostgreSQL job queue in the application
database. Distributed rate limits and concurrency leases use a managed
Redis-compatible service. Feature code consumes shared boundaries rather than
provider SDKs directly.

### D-009: Customer Samples Are Opt-In

Raw sample rows and representative values from customer connections are not
sent to an LLM by default. Per-connection opt-in, sensitive-column filtering,
redaction, and documented byte/row limits are required. Synthetic demo data may
use bounded samples.

### D-010: Durable Query-Run State Machine

Query execution is modeled as forward-only durable states with idempotent
submission. Application database transactions never remain open while waiting
for an LLM or customer database.

### D-011: Bounded Production Defaults

V2 adopts the measurable limits and SLO targets in
`docs/v2/architecture/PERFORMANCE_BUDGETS.md` and the wire/data bounds in
`docs/v2/contracts/PAGINATION_AND_BOUNDS.md`. Changes require measured evidence
and a recorded contract decision.

## Proposed Decisions

Agents must record proposals in their own work logs for coordinator review.
