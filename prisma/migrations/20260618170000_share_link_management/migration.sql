ALTER TABLE v2_dashboard_share_links
  ADD COLUMN encrypted_token jsonb,
  ADD COLUMN view_count integer NOT NULL DEFAULT 0,
  ADD COLUMN last_viewed_at timestamptz;
