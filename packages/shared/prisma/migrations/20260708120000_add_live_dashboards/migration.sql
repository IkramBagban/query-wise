-- SPEC-06 Live Dashboards: additive schema for the whole-dashboard live/snapshot
-- mode, refresh bookkeeping, a denormalized connection, and the global date-range
-- filter. Every column is nullable or defaulted so historical dashboards, widgets,
-- and shares keep rendering unchanged.

-- Dashboard-level mode + controls (§2, §4.2, §5).
-- `mode` defaults to 'live' for NEW rows; the backfill below flips every EXISTING
-- dashboard to 'snapshot' so today's frozen behavior is preserved (AC #1).
ALTER TABLE "v2_dashboards"
  ADD COLUMN IF NOT EXISTS "mode" text NOT NULL DEFAULT 'live',
  ADD COLUMN IF NOT EXISTS "default_date_range" jsonb,
  ADD COLUMN IF NOT EXISTS "refresh_interval_seconds" integer;

UPDATE "v2_dashboards" SET "mode" = 'snapshot' WHERE "mode" = 'live';

-- Widget-level fields (§4.1, §5): refresh bookkeeping, a denormalized connection,
-- and the optional date-range binding. All nullable — historical widgets keep
-- rendering; liveness is decided by the parent dashboard's mode, not per widget.
ALTER TABLE "v2_dashboard_widgets"
  ADD COLUMN IF NOT EXISTS "connection_id" uuid,
  ADD COLUMN IF NOT EXISTS "last_refreshed_at" timestamptz(6),
  ADD COLUMN IF NOT EXISTS "last_refresh_error" text,
  ADD COLUMN IF NOT EXISTS "filter_binding" jsonb;

-- Backfill: denormalize the connection from the widget's originating query run so
-- existing widgets can still resolve a connection once their dashboard is switched
-- to live and can survive later conversation/run deletion (§4.1).
UPDATE "v2_dashboard_widgets" AS widget
SET "connection_id" = run."connection_id"
FROM "v2_query_runs" AS run
WHERE widget."query_run_id" = run."id"
  AND widget."connection_id" IS NULL;
