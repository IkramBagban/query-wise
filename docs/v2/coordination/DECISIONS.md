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

## Proposed Decisions

Agents must record proposals in their own work logs for coordinator review.
