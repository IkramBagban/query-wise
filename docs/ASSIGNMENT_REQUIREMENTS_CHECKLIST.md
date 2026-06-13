# Assignment Requirements Checklist

Source of truth: `docs/ASSIGNMENT.md`  
Use this file to track completion. Check boxes as work is finished.

## Core Requirements


- [x] Pre-seeded demo PostgreSQL database with realistic ecommerce data (Faker.js).
- [x] Demo DB has 10,000+ orders across the last 12 months.
- [x] Users can connect their own PostgreSQL database via connection details.
- [x] Supports both demo DB and custom DB querying.
- [x] On connect, schema introspection runs automatically.
- [x] Schema summary includes tables, columns, data types, foreign keys, and sample values.
- [x] Users can ask plain-English questions and get SQL-backed results.
- [x] Follow-up questions use conversation context.
- [x] Auto chart generation from query result type (bar/line/pie/scatter/table).
- [x] Users can manually switch chart type.
- [x] Users can save query results as dashboard widgets.
- [x] Users can arrange multiple widgets in dashboard view.
- [x] Dashboards can be shared with a link.
- [x] Query safety: block destructive SQL.
- [x] Query safety: enforce result row limits.
- [x] Query safety: enforce timeout for long-running queries.
- [x] Basic authentication with fixed demo username/password.
- [x] User LLM API key handled securely per assignment expectations.

## LLM Requirements

- [x] Uses a frontier model (OpenAI / Anthropic / Google).
- [x] SQL generation includes full schema context + sample data.
- [x] Retry + fallback behavior implemented for model errors.

## Constraints Compliance

- [x] No managed text-to-SQL SaaS wrappers (e.g., Vanna AI).
- [x] No BI framework embedding that abstracts SQL generation (e.g., Metabase/Superset embed).
- [x] SQL generation, schema analysis, and chart recommendation are implemented in-house using raw LLM calls.
- [x] PostgreSQL only (no MySQL/SQLite requirement creep).

## Example Query Coverage

- [ ] "Top 5 products by revenue last month"
- [ ] "Order count by day for past 30 days"
- [ ] "Customers with >10 orders and no reviews"
- [ ] "Revenue by category this quarter vs last quarter"
- [ ] "Average order value by customer segment"

## Submission Checklist

- [ ] GitHub repo with clear README + setup instructions.
- [ ] 2-3 minute walkthrough demo video.
- [ ] Deployed web app.
- [ ] Demo database is accessible and pre-seeded.

## Progress Notes

Use this section for quick proof links while checking items:
- API route/file:
- UI screen/file:
- Test/manual verification:
