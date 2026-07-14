-- SPEC-13: Per-share live/snapshot mode. Additive — one nullable-defaulted column
-- on the share-link table. Existing links backfill to 'live', which exactly matches
-- today's public-serving behavior (public views always live-executed), so no
-- historical share changes meaning. A CHECK mirrors the v2_dashboards.mode contract.
ALTER TABLE "v2_dashboard_share_links"
  ADD COLUMN IF NOT EXISTS "mode" text NOT NULL DEFAULT 'live';

ALTER TABLE "v2_dashboard_share_links"
  DROP CONSTRAINT IF EXISTS "v2_share_links_mode_check";
ALTER TABLE "v2_dashboard_share_links"
  ADD CONSTRAINT "v2_share_links_mode_check" CHECK ("mode" IN ('live', 'snapshot'));
