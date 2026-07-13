-- SPEC-09 Blocks, Datasets & Views: additive schema for the pinned view's
-- client-side transform. A widget pins exactly one BlockView; when that view
-- carries a transform (top-N, cumulative, % of total, pivot) it is stored here
-- and re-applied on every snapshot/live render. Nullable — pre-SPEC-09 widgets,
-- and views that pin the raw dataset, keep rendering the snapshot untouched.
--
-- Note: block `views` themselves need no migration — they nest additively inside
-- the existing JSON `result_blocks` column on v2_query_runs.
ALTER TABLE "v2_dashboard_widgets"
  ADD COLUMN IF NOT EXISTS "view_transform" jsonb;
