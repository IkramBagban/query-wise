SET lock_timeout = '5s';
SET statement_timeout = '30s';

ALTER TABLE "v2_query_runs"
ADD COLUMN "result_blocks" JSONB NOT NULL DEFAULT '[]'::jsonb;

RESET lock_timeout;
RESET statement_timeout;
