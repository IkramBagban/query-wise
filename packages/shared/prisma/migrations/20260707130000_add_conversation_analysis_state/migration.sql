-- SPEC-02 §4: additive per-conversation analysis memory. Nullable JSONB so
-- historical conversations continue to load unchanged.
ALTER TABLE v2_conversations ADD COLUMN IF NOT EXISTS analysis_state jsonb;
