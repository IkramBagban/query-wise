ALTER TABLE v2_schema_embeddings ADD COLUMN IF NOT EXISTS embedding_model text;
ALTER TABLE v2_schema_embeddings ADD COLUMN IF NOT EXISTS dimensions int;
ALTER TABLE v2_schema_embeddings ALTER COLUMN embedding TYPE vector;
