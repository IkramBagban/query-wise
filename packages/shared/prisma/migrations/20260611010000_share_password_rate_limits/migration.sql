CREATE TABLE v2_share_password_attempts (
  id uuid PRIMARY KEY,
  key_hash text NOT NULL UNIQUE,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  resets_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX v2_share_password_attempts_resets_idx
  ON v2_share_password_attempts (resets_at);
