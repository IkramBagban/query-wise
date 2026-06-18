# Assignment Requirements Checklist

Source of truth: `docs/ASSIGNMENT.md`

This checklist reflects the current codebase, not the original open-source
claim set. Mark an item complete only when there is a wired implementation and
manual or automated verification evidence.

## Status Legend

- [x] Implemented in the current codebase.
- [~] Partially implemented, legacy-only, or not fully verified.
- [ ] Not implemented or no evidence found.

## Core Requirements

- [~] Pre-seeded demo PostgreSQL database with realistic ecommerce data (Faker.js).
  - Evidence: `scripts/seed.ts` creates ecommerce tables and seed data.
  - Gap: requires a configured `DEMO_DATABASE_URL`; no committed proof that the hosted demo DB is seeded and reachable.
- [x] Demo seed script creates 10,000 orders across a 12-month generated window.
  - Evidence: `ORDER_COUNT = 10000` and weighted 12-month order dates in `scripts/seed.ts`.
- [x] Users can connect a PostgreSQL database via connection details.
  - Evidence: legacy `/api/connect`; V2 `/api/connections`.
- [~] Supports both demo DB and custom DB querying.
  - Evidence: legacy query flow accepts optional `connectionString`; V2 uses saved `connectionId`.
  - Gap: demo connection availability depends on environment and has not been verified here.
- [x] Schema introspection exists.
  - Evidence: `lib/schema/introspect.ts` and V2 schema services read tables, columns, relationships, row estimates, samples, ranges, and top values.
- [x] Schema summary includes tables, columns, data types, foreign keys, and sample values.
  - Evidence: `lib/schema/introspect.ts`.
- [x] Users can ask plain-English questions and get SQL-backed results.
  - Evidence: legacy `/api/query` flow and V2 durable query flow call raw LLM providers and execute SQL.
- [~] Follow-up questions use conversation context.
  - Evidence: legacy LLM flow accepts chat history; V2 persists conversations/messages.
  - Gap: no committed example-query verification.
- [x] Auto chart generation from query result type.
  - Evidence: `lib/charts/*` and chart renderers for table, bar, line, area, pie, and scatter.
- [x] Users can manually switch chart type.
  - Evidence: chart type options and workspace result controls.
- [~] Users can save query results as dashboard widgets.
  - Evidence: legacy workspace can add widgets to browser state; V2 dashboard widget services exist.
  - Gap: end-to-end save-from-query behavior is not verified in this pass.
- [~] Users can arrange multiple widgets in dashboard view.
  - Evidence: legacy dashboard supports drag reordering; V2 exposes simple layout updates.
  - Gap: no grid layout persistence verification.
- [~] Dashboards can be shared with a link.
  - Evidence: legacy `/api/share` and V2 public share services/routes exist.
  - Gap: share flow was not manually verified here.
- [x] Query safety: block destructive SQL.
  - Evidence: `validateAndSanitizeSql` in `lib/db.ts` and V2 SQL validation modules.
- [x] Query safety: enforce result row limits.
  - Evidence: legacy execution wraps SQL with `LIMIT 500`; V2 has bounded query execution contracts.
- [x] Query safety: enforce timeout for long-running queries.
  - Evidence: legacy execution sets `statement_timeout`; V2 query runtime includes timeout/cancellation code.
- [~] Authentication.
  - Evidence: V2 private pages use Clerk via `proxy.ts`; legacy fixed username/password route still exists.
  - Gap: the original assignment asks for fixed demo username/password, but current primary app routes use Clerk and legacy auth checks are disabled on old API routes.
- [~] User LLM API key handled per assignment expectations.
  - Evidence: UI stores query API keys in browser session/local settings and sends them per request.
  - Gap: users must understand keys are transmitted to the server for request execution; server-side ingestion has separate env-based keys.

## LLM Requirements

- [x] Uses supported frontier providers.
  - Evidence: current code supports Anthropic and Google via the Vercel AI SDK.
- [~] SQL generation includes schema context and metadata.
  - Evidence: prompt builders include schema summary and structured table context.
  - Gap: raw sample rows may be disabled by configuration for privacy.
- [x] Retry and model fallback behavior exists for model errors.
  - Evidence: `withRetry` and `withModelFallback` in `lib/llm/client.ts`.

## Constraints Compliance

- [x] No managed text-to-SQL SaaS wrappers found.
- [x] No embedded BI framework found.
- [x] SQL generation, schema analysis, and chart recommendation are implemented in-house using raw LLM/provider calls and local heuristics.
- [x] PostgreSQL is the implemented database provider.

## Example Query Coverage

- [ ] "Top 5 products by revenue last month"
- [ ] "Order count by day for past 30 days"
- [ ] "Customers with >10 orders and no reviews"
- [ ] "Revenue by category this quarter vs last quarter"
- [ ] "Average order value by customer segment"

## Submission Checklist

- [~] GitHub repo with README and setup instructions.
  - Gap: README needed correction to match current auth/routing behavior.
- [~] 2-3 minute walkthrough demo video.
  - Evidence: README links a Google Drive demo video.
  - Gap: link was not opened or validated in this pass.
- [ ] Deployed web app.
- [ ] Hosted demo database is accessible and pre-seeded.

## Verification Notes

- Code inspection performed on 2026-06-18.
- Build should be run after this documentation correction.
- Example-query coverage still needs real run output against a seeded demo database.
