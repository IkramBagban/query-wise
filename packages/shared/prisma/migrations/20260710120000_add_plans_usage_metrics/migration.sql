-- Plans, entitlements, usage & metrics + per-user limit override columns. Fully
-- additive: new enums, new tables, one new nullable+defaulted column on
-- v2_database_connections. Nothing existing changes behavior; the demo backfill
-- only flags rows that are already the platform demo by name.

-- Enums.
CREATE TYPE "v2_plan_id" AS ENUM ('free', 'pro');
CREATE TYPE "v2_plan_status" AS ENUM ('active', 'disabled');
CREATE TYPE "v2_plan_source" AS ENUM ('default', 'manual');

-- Demo flag on connections: the demo does not consume the Free connection slot.
ALTER TABLE "v2_database_connections"
  ADD COLUMN IF NOT EXISTS "is_demo" boolean NOT NULL DEFAULT false;

-- Backfill: today the demo is identified only by its canonical name. Flag those
-- rows so the boolean is authoritative going forward.
UPDATE "v2_database_connections"
SET "is_demo" = true
WHERE "name" = 'QueryWise Demo (Ecommerce)'
  AND "is_demo" = false;

-- UserPlan (one row per user) + per-user limit override columns.
CREATE TABLE "v2_user_plans" (
  "id"                                uuid NOT NULL,
  "user_id"                           text NOT NULL,
  "plan_id"                           "v2_plan_id" NOT NULL DEFAULT 'free',
  "status"                            "v2_plan_status" NOT NULL DEFAULT 'active',
  "source"                            "v2_plan_source" NOT NULL DEFAULT 'default',
  "pro_granted_at"                    timestamptz(6),
  "notes"                             text,
  "questions_per_day_override"        integer,
  "questions_per_month_override"      integer,
  "max_connections_override"          integer,
  "max_dashboards_override"           integer,
  "schema_refreshes_per_day_override" integer,
  "created_at"                        timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at"                        timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT "v2_user_plans_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "v2_user_plans_user_id_key" ON "v2_user_plans" ("user_id");

-- UserUsagePeriod: rolling day/month counters for fast quota checks.
CREATE TABLE "v2_user_usage_periods" (
  "id"                      uuid NOT NULL,
  "user_id"                 text NOT NULL,
  "period_type"             text NOT NULL,
  "period_key"              text NOT NULL,
  "questions_accepted"      integer NOT NULL DEFAULT 0,
  "questions_succeeded"     integer NOT NULL DEFAULT 0,
  "questions_failed"        integer NOT NULL DEFAULT 0,
  "schema_refreshes"        integer NOT NULL DEFAULT 0,
  "charts_generated"        integer NOT NULL DEFAULT 0,
  "llm_input_tokens"        bigint NOT NULL DEFAULT 0,
  "llm_output_tokens"       bigint NOT NULL DEFAULT 0,
  "llm_cached_input_tokens" bigint NOT NULL DEFAULT 0,
  "llm_call_count"          integer NOT NULL DEFAULT 0,
  "created_at"              timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at"              timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT "v2_user_usage_periods_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "v2_user_usage_periods_user_period_key"
  ON "v2_user_usage_periods" ("user_id", "period_type", "period_key");
CREATE INDEX "v2_user_usage_periods_period_idx"
  ON "v2_user_usage_periods" ("period_type", "period_key");

-- UserUsageTotals: lifetime rollups.
CREATE TABLE "v2_user_usage_totals" (
  "user_id"                 text NOT NULL,
  "questions_accepted"      integer NOT NULL DEFAULT 0,
  "questions_succeeded"     integer NOT NULL DEFAULT 0,
  "questions_failed"        integer NOT NULL DEFAULT 0,
  "charts_generated"        integer NOT NULL DEFAULT 0,
  "dashboards_created"      integer NOT NULL DEFAULT 0,
  "connections_created"     integer NOT NULL DEFAULT 0,
  "shares_created"          integer NOT NULL DEFAULT 0,
  "schema_syncs_succeeded"  integer NOT NULL DEFAULT 0,
  "llm_input_tokens"        bigint NOT NULL DEFAULT 0,
  "llm_output_tokens"       bigint NOT NULL DEFAULT 0,
  "llm_cached_input_tokens" bigint NOT NULL DEFAULT 0,
  "llm_call_count"          integer NOT NULL DEFAULT 0,
  "updated_at"              timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT "v2_user_usage_totals_pkey" PRIMARY KEY ("user_id")
);

-- LlmUsageRecord: one row per model call, with cost-explorer indexes.
CREATE TABLE "v2_llm_usage_records" (
  "id"                  uuid NOT NULL,
  "user_id"             text NOT NULL,
  "query_run_id"        uuid,
  "connection_id"       uuid,
  "task"                text NOT NULL,
  "provider"            text NOT NULL,
  "model"               text NOT NULL,
  "input_tokens"        integer NOT NULL DEFAULT 0,
  "output_tokens"       integer NOT NULL DEFAULT 0,
  "total_tokens"        integer NOT NULL DEFAULT 0,
  "cached_input_tokens" integer NOT NULL DEFAULT 0,
  "reasoning_tokens"    integer,
  "success"             boolean NOT NULL DEFAULT true,
  "latency_ms"          integer,
  "attempt_index"       integer,
  "call_ordinal"        integer,
  "metadata"            jsonb NOT NULL DEFAULT '{}',
  "created_at"          timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT "v2_llm_usage_records_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "v2_llm_usage_user_created_idx"
  ON "v2_llm_usage_records" ("user_id", "created_at" DESC);
CREATE INDEX "v2_llm_usage_query_run_idx"
  ON "v2_llm_usage_records" ("query_run_id");
CREATE INDEX "v2_llm_usage_task_created_idx"
  ON "v2_llm_usage_records" ("task", "created_at" DESC);
CREATE INDEX "v2_llm_usage_provider_model_idx"
  ON "v2_llm_usage_records" ("provider", "model", "created_at" DESC);

-- QueryRunUsage: per-question aggregate.
CREATE TABLE "v2_query_run_usage" (
  "query_run_id"        uuid NOT NULL,
  "user_id"             text NOT NULL,
  "input_tokens"        integer NOT NULL DEFAULT 0,
  "output_tokens"       integer NOT NULL DEFAULT 0,
  "cached_input_tokens" integer NOT NULL DEFAULT 0,
  "llm_call_count"      integer NOT NULL DEFAULT 0,
  "agent_steps"         integer,
  "sql_attempts"        integer,
  "budget_profile"      text,
  "chart_generated"     boolean NOT NULL DEFAULT false,
  "chart_type"          text,
  "primary_provider"    text,
  "primary_model"       text,
  "created_at"          timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at"          timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT "v2_query_run_usage_pkey" PRIMARY KEY ("query_run_id")
);
CREATE INDEX "v2_query_run_usage_user_idx"
  ON "v2_query_run_usage" ("user_id", "created_at" DESC);

-- MetricEvent: append-only product analytics.
CREATE TABLE "v2_metric_events" (
  "id"            uuid NOT NULL,
  "user_id"       text,
  "event_type"    text NOT NULL,
  "resource_type" text,
  "resource_id"   text,
  "query_run_id"  uuid,
  "payload"       jsonb NOT NULL DEFAULT '{}',
  "created_at"    timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT "v2_metric_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "v2_metric_events_user_created_idx"
  ON "v2_metric_events" ("user_id", "created_at" DESC);
CREATE INDEX "v2_metric_events_type_created_idx"
  ON "v2_metric_events" ("event_type", "created_at" DESC);

-- PlanChangeLog: audit of plan mutations.
CREATE TABLE "v2_plan_change_logs" (
  "id"           uuid NOT NULL,
  "user_id"      text NOT NULL,
  "from_plan_id" text NOT NULL,
  "to_plan_id"   text NOT NULL,
  "source"       text NOT NULL,
  "notes"        text,
  "actor_label"  text,
  "created_at"   timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT "v2_plan_change_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "v2_plan_change_log_user_idx"
  ON "v2_plan_change_logs" ("user_id", "created_at" DESC);
