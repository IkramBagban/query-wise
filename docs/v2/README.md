# QueryWise V2 Specifications

This directory is the execution plan for QueryWise V2. It is designed for multiple coding agents working concurrently without overlapping ownership.

## Product Goal

V2 turns QueryWise from a session-scoped demo into a user-owned, persistent BI workspace:

- Clerk authentication and server-side authorization
- multiple saved PostgreSQL connections
- persistent conversations and chat history
- multiple dashboards
- dashboard sharing by link, email, and optional password
- a new three-column workspace with persistent left navigation and a contextual right sidebar
- database-provider boundaries that allow a future MySQL adapter without rewriting product features

## Required Decisions

These decisions are fixed for V2 unless the user explicitly changes them:

1. Ownership is user-level. Clerk Organizations are out of scope until a later version.
2. V2 implements PostgreSQL only.
3. Database-provider code must use an adapter interface so MySQL can be added later.
4. QueryWise has its own PostgreSQL application database for product data.
5. Customer database credentials are encrypted server-side and never returned to the browser.
6. Client requests reference `connectionId`; they never send a connection URL to query/schema routes.
7. Clerk handles identity. QueryWise authorization is enforced in a server-only Data Access Layer (DAL).
8. Conversations, dashboards, and connections are durable. Browser storage is only an optional UI cache.
9. Dashboard sharing does not grant access to database credentials.
10. Existing query safety remains mandatory: validation, read-only execution, timeout, and row cap.

## Read Order For Every Agent

1. `AGENTS.md`
2. `docs/ASSIGNMENT.md`
3. `docs/v2/CONTEXT.md`
4. The assigned feature spec
5. Relevant Next.js 16 guides in `node_modules/next/dist/docs/`

## Workstreams

| Agent | Spec | Can Start | Primary Ownership |
|---|---|---|---|
| V2-F | `SPEC_FOUNDATION.md` | Immediately | app DB, migrations, DAL contracts, encryption, shared domain types |
| V2-A | `SPEC_AUTHORIZATION.md` | After V2-F publishes initial DAL/auth contracts | Clerk, auth guards, ownership helpers |
| V2-C | `SPEC_CONNECTIONS.md` | After V2-F publishes DB schema and encryption contract | multiple connections, PostgreSQL adapter, schema snapshots |
| V2-H | `SPEC_CONVERSATIONS.md` | After V2-F publishes DB schema | persistent conversations/messages/query runs |
| V2-D | `SPEC_DASHBOARDS_SHARING.md` | After V2-F and V2-A contracts | multiple dashboards and sharing |
| V2-U | `SPEC_WORKSPACE_UI.md` | After API DTOs are agreed; mock DTOs allowed first | left sidebar, main workspace, right sidebar, settings/connections UI |
| V2-Q | `SPEC_PRODUCTION_HARDENING.md` | After feature APIs exist | rate limits, audit logs, background jobs, load/security tests |

## Recommended Execution Waves

### Wave 1: Foundation

Only V2-F edits shared persistence and domain contracts. V2-U may build static/mock UI components in parallel but must not redefine backend contracts.

### Wave 2: Independent Product Features

V2-A, V2-C, V2-H, and V2-D work concurrently in their owned modules. V2-U integrates published DTOs and endpoints.

### Wave 3: Integration And Hardening

V2-Q verifies cross-feature authorization, secrets handling, rate limits, auditability, and production behavior.

## Agent Completion Contract

Every agent must:

- stay within its file ownership unless a dependency owner explicitly coordinates a shared edit
- add focused tests for non-trivial behavior
- update `docs/ENGINEERING_SYSTEM_DESIGN_NOTES.md` for important non-UI changes
- run `npm run build` after its changes
- report changed files, API/schema changes, tests run, and unresolved risks
- make an atomic commit only when explicitly asked

