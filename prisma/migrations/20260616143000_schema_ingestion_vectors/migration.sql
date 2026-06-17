ALTER TYPE v2_schema_sync_status ADD VALUE IF NOT EXISTS 'introspecting';
ALTER TYPE v2_schema_sync_status ADD VALUE IF NOT EXISTS 'describing';
ALTER TYPE v2_schema_sync_status ADD VALUE IF NOT EXISTS 'embedding';

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS v2_schema_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL,
  entity_id text NOT NULL,
  namespace text NOT NULL,
  entity_name text NOT NULL,
  embedding_kind text NOT NULL CHECK (embedding_kind IN ('table-summary', 'question-summary')),
  content text NOT NULL,
  embedding vector(384) NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  schema_fingerprint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, entity_id, embedding_kind),
  FOREIGN KEY (connection_id) REFERENCES v2_database_connections(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS v2_schema_embeddings_connection_kind_idx
  ON v2_schema_embeddings (connection_id, embedding_kind, updated_at DESC);

CREATE INDEX IF NOT EXISTS v2_schema_embeddings_entity_idx
  ON v2_schema_embeddings (connection_id, entity_id);

CREATE INDEX IF NOT EXISTS v2_schema_embeddings_vector_idx
  ON v2_schema_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
