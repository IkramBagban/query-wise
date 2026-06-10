SET lock_timeout = '5s';
SET statement_timeout = '60s';

CREATE TYPE v2_connection_status AS ENUM ('pending','connected','error','disabled','deleting','deleted');
CREATE TYPE v2_schema_sync_status AS ENUM ('never','queued','running','ready','error');
CREATE TYPE v2_snapshot_status AS ENUM ('queued','syncing','succeeded','failed','superseded');
CREATE TYPE v2_conversation_status AS ENUM ('active','archived');
CREATE TYPE v2_message_role AS ENUM ('user','assistant','system');
CREATE TYPE v2_query_run_status AS ENUM ('accepted','preparing','generating','validating','executing','persisting','succeeded','failed','cancelled','expired');
CREATE TYPE v2_job_status AS ENUM ('queued','running','succeeded','dead','cancelled');

CREATE TABLE v2_users (
  id uuid PRIMARY KEY, clerk_user_id text NOT NULL UNIQUE, deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE v2_database_connections (
  id uuid PRIMARY KEY, owner_user_id text NOT NULL, provider_id text NOT NULL DEFAULT 'postgresql', dialect_id text NOT NULL DEFAULT 'postgresql',
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100), host_display text NOT NULL, port integer, database_name text NOT NULL,
  encrypted_secret jsonb, credential_version integer NOT NULL DEFAULT 1 CHECK (credential_version > 0),
  status v2_connection_status NOT NULL DEFAULT 'pending', last_tested_at timestamptz, last_test_error_code text,
  last_schema_sync_at timestamptz, schema_sync_status v2_schema_sync_status NOT NULL DEFAULT 'never', deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'deleted' OR encrypted_secret IS NULL)
);
CREATE INDEX v2_connections_owner_updated_idx ON v2_database_connections (owner_user_id, updated_at DESC, id DESC);
CREATE TABLE v2_database_schema_snapshots (
  id uuid PRIMARY KEY, owner_user_id text NOT NULL, connection_id uuid NOT NULL REFERENCES v2_database_connections(id) ON DELETE CASCADE,
  snapshot_version integer NOT NULL, partition_index integer NOT NULL DEFAULT 0, partition_count integer NOT NULL DEFAULT 1,
  status v2_snapshot_status NOT NULL DEFAULT 'queued', schema_hash text, metadata jsonb, summary text, error_code text, completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (snapshot_version > 0 AND partition_count > 0 AND partition_index >= 0 AND partition_index < partition_count),
  UNIQUE (connection_id, snapshot_version, partition_index)
);
CREATE INDEX v2_snapshots_owner_connection_idx ON v2_database_schema_snapshots (owner_user_id, connection_id, snapshot_version DESC);
CREATE TABLE v2_conversations (
  id uuid PRIMARY KEY, owner_user_id text NOT NULL, connection_id uuid NOT NULL REFERENCES v2_database_connections(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120), status v2_conversation_status NOT NULL DEFAULT 'active',
  last_activity_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX v2_conversations_owner_activity_idx ON v2_conversations (owner_user_id, last_activity_at DESC, id DESC);
CREATE TABLE v2_messages (
  id uuid PRIMARY KEY, conversation_id uuid NOT NULL REFERENCES v2_conversations(id) ON DELETE CASCADE, sequence integer NOT NULL,
  role v2_message_role NOT NULL, content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 8000), query_run_id uuid,
  metadata jsonb NOT NULL DEFAULT '{"schemaVersion":1}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, sequence)
);
CREATE INDEX v2_messages_conversation_page_idx ON v2_messages (conversation_id, sequence, id);
CREATE TABLE v2_query_runs (
  id uuid PRIMARY KEY, owner_user_id text NOT NULL, conversation_id uuid NOT NULL REFERENCES v2_conversations(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES v2_database_connections(id) ON DELETE RESTRICT, triggering_message_id uuid NOT NULL, response_message_id uuid,
  idempotency_key text NOT NULL, request_fingerprint text NOT NULL, status v2_query_run_status NOT NULL DEFAULT 'accepted',
  status_version integer NOT NULL DEFAULT 1 CHECK (status_version > 0), provider_id text NOT NULL DEFAULT 'postgresql', dialect_id text NOT NULL DEFAULT 'postgresql',
  generated_query jsonb, result_preview jsonb CHECK (result_preview IS NULL OR pg_column_size(result_preview) <= 262144),
  returned_row_count integer, total_row_count bigint, truncated boolean, execution_time_ms integer, generated_at timestamptz, started_at timestamptz,
  finished_at timestamptz, error_code text, error_message text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, conversation_id, idempotency_key)
);
CREATE INDEX v2_query_runs_owner_updated_idx ON v2_query_runs (owner_user_id, updated_at DESC, id DESC);
CREATE INDEX v2_query_runs_recovery_idx ON v2_query_runs (status, updated_at);
ALTER TABLE v2_query_runs ADD CONSTRAINT v2_query_runs_triggering_message_fk FOREIGN KEY (triggering_message_id) REFERENCES v2_messages(id) ON DELETE RESTRICT;
ALTER TABLE v2_query_runs ADD CONSTRAINT v2_query_runs_response_message_fk FOREIGN KEY (response_message_id) REFERENCES v2_messages(id) ON DELETE SET NULL;
ALTER TABLE v2_messages ADD CONSTRAINT v2_messages_query_run_fk FOREIGN KEY (query_run_id) REFERENCES v2_query_runs(id) ON DELETE SET NULL;
CREATE TABLE v2_dashboards (
  id uuid PRIMARY KEY, owner_user_id text NOT NULL, name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120), deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX v2_dashboards_owner_updated_idx ON v2_dashboards (owner_user_id, updated_at DESC, id DESC);
CREATE TABLE v2_dashboard_widgets (
  id uuid PRIMARY KEY, dashboard_id uuid NOT NULL REFERENCES v2_dashboards(id) ON DELETE CASCADE, query_run_id uuid REFERENCES v2_query_runs(id) ON DELETE SET NULL,
  title text NOT NULL, chart_config jsonb NOT NULL, layout jsonb NOT NULL, snapshot jsonb NOT NULL CHECK (pg_column_size(snapshot) <= 262144), query_definition jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX v2_widgets_dashboard_idx ON v2_dashboard_widgets (dashboard_id, created_at, id);
CREATE TABLE v2_dashboard_access_grants (
  id uuid PRIMARY KEY, dashboard_id uuid NOT NULL REFERENCES v2_dashboards(id) ON DELETE CASCADE, recipient_user_id text NOT NULL,
  permission text NOT NULL DEFAULT 'view', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dashboard_id, recipient_user_id)
);
CREATE TABLE v2_dashboard_share_links (
  id uuid PRIMARY KEY, dashboard_id uuid NOT NULL REFERENCES v2_dashboards(id) ON DELETE CASCADE, token_hash text NOT NULL UNIQUE, password_hash text,
  version integer NOT NULL DEFAULT 1, expires_at timestamptz, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX v2_share_links_dashboard_idx ON v2_dashboard_share_links (dashboard_id, created_at DESC, id DESC);
CREATE TABLE v2_audit_logs (
  id uuid PRIMARY KEY, actor_user_id text, action text NOT NULL, resource_type text NOT NULL, resource_id text, outcome text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX v2_audit_actor_created_idx ON v2_audit_logs (actor_user_id, created_at DESC, id DESC);
CREATE TABLE v2_durable_jobs (
  id uuid PRIMARY KEY, type text NOT NULL, payload_version integer NOT NULL, payload jsonb NOT NULL CHECK (pg_column_size(payload) <= 65536),
  idempotency_key text NOT NULL, status v2_job_status NOT NULL DEFAULT 'queued', priority integer NOT NULL DEFAULT 0, attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5, available_at timestamptz NOT NULL DEFAULT now(), lease_owner text, lease_expires_at timestamptz,
  last_error_code text, started_at timestamptz, completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (attempts >= 0 AND max_attempts > 0 AND attempts <= max_attempts), UNIQUE (type, idempotency_key)
);
CREATE INDEX v2_jobs_claim_idx ON v2_durable_jobs (status, available_at, priority DESC, id);
CREATE INDEX v2_jobs_lease_idx ON v2_durable_jobs (status, lease_expires_at);
