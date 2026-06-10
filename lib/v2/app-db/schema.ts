import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { BoundedResultPreview, CanonicalDataSourceMetadata, ChartConfig, EncryptedPayload, JsonValue, ProviderQuery, WidgetLayout } from "@/types/v2";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};
const owned = { ownerUserId: text("owner_user_id").notNull() };
const softDelete = { deletedAt: timestamp("deleted_at", { withTimezone: true }) };

export const connectionStatus = pgEnum("v2_connection_status", ["pending", "connected", "error", "disabled", "deleting", "deleted"]);
export const schemaSyncStatus = pgEnum("v2_schema_sync_status", ["never", "queued", "running", "ready", "error"]);
export const snapshotStatus = pgEnum("v2_snapshot_status", ["queued", "syncing", "succeeded", "failed", "superseded"]);
export const conversationStatus = pgEnum("v2_conversation_status", ["active", "archived"]);
export const messageRole = pgEnum("v2_message_role", ["user", "assistant", "system"]);
export const queryRunStatus = pgEnum("v2_query_run_status", ["accepted", "preparing", "generating", "validating", "executing", "persisting", "succeeded", "failed", "cancelled", "expired"]);
export const jobStatus = pgEnum("v2_job_status", ["queued", "running", "succeeded", "dead", "cancelled"]);

export const users = pgTable("v2_users", {
  id: uuid("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  ...softDelete, ...timestamps,
}, (t) => [uniqueIndex("v2_users_clerk_user_id_uidx").on(t.clerkUserId)]);

export const databaseConnections = pgTable("v2_database_connections", {
  id: uuid("id").primaryKey(), ...owned,
  providerId: text("provider_id").notNull().default("postgresql"),
  dialectId: text("dialect_id").notNull().default("postgresql"),
  name: text("name").notNull(), hostDisplay: text("host_display").notNull(), port: integer("port"),
  databaseName: text("database_name").notNull(), encryptedSecret: jsonb("encrypted_secret").$type<EncryptedPayload>(),
  credentialVersion: integer("credential_version").notNull().default(1), status: connectionStatus("status").notNull().default("pending"),
  lastTestedAt: timestamp("last_tested_at", { withTimezone: true }), lastTestErrorCode: text("last_test_error_code"),
  lastSchemaSyncAt: timestamp("last_schema_sync_at", { withTimezone: true }), schemaSyncStatus: schemaSyncStatus("schema_sync_status").notNull().default("never"),
  ...softDelete, ...timestamps,
}, (t) => [
  index("v2_connections_owner_updated_idx").on(t.ownerUserId, t.updatedAt.desc(), t.id.desc()),
  check("v2_connections_name_len", sql`char_length(${t.name}) between 1 and 100`),
  check("v2_connections_credential_version", sql`${t.credentialVersion} > 0`),
  check("v2_connections_secret_lifecycle", sql`${t.status} <> 'deleted' or ${t.encryptedSecret} is null`),
]);

export const databaseSchemaSnapshots = pgTable("v2_database_schema_snapshots", {
  id: uuid("id").primaryKey(), ...owned,
  connectionId: uuid("connection_id").notNull().references(() => databaseConnections.id, { onDelete: "cascade" }),
  snapshotVersion: integer("snapshot_version").notNull(), partitionIndex: integer("partition_index").notNull().default(0),
  partitionCount: integer("partition_count").notNull().default(1), status: snapshotStatus("status").notNull().default("queued"),
  schemaHash: text("schema_hash"), metadata: jsonb("metadata").$type<CanonicalDataSourceMetadata>(), summary: text("summary"),
  errorCode: text("error_code"), completedAt: timestamp("completed_at", { withTimezone: true }), ...timestamps,
}, (t) => [
  uniqueIndex("v2_snapshots_connection_version_partition_uidx").on(t.connectionId, t.snapshotVersion, t.partitionIndex),
  index("v2_snapshots_owner_connection_idx").on(t.ownerUserId, t.connectionId, t.snapshotVersion.desc()),
  check("v2_snapshots_partition", sql`${t.snapshotVersion} > 0 and ${t.partitionCount} > 0 and ${t.partitionIndex} >= 0 and ${t.partitionIndex} < ${t.partitionCount}`),
]);

export const conversations = pgTable("v2_conversations", {
  id: uuid("id").primaryKey(), ...owned,
  connectionId: uuid("connection_id").notNull().references(() => databaseConnections.id, { onDelete: "restrict" }),
  title: text("title").notNull(), status: conversationStatus("status").notNull().default("active"),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).defaultNow().notNull(), ...softDelete, ...timestamps,
}, (t) => [
  index("v2_conversations_owner_activity_idx").on(t.ownerUserId, t.lastActivityAt.desc(), t.id.desc()),
  check("v2_conversations_title_len", sql`char_length(${t.title}) between 1 and 120`),
]);

export const messages = pgTable("v2_messages", {
  id: uuid("id").primaryKey(), conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull(), role: messageRole("role").notNull(), content: text("content").notNull(),
  queryRunId: uuid("query_run_id"), metadata: jsonb("metadata").$type<{ schemaVersion: 1; errorCode?: string; chartConfig?: ChartConfig }>().notNull().default({ schemaVersion: 1 }),
  ...timestamps,
}, (t) => [
  uniqueIndex("v2_messages_conversation_sequence_uidx").on(t.conversationId, t.sequence),
  index("v2_messages_conversation_page_idx").on(t.conversationId, t.sequence, t.id),
  check("v2_messages_content_len", sql`char_length(${t.content}) between 1 and 8000`),
]);

export const queryRuns = pgTable("v2_query_runs", {
  id: uuid("id").primaryKey(), ...owned,
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  connectionId: uuid("connection_id").notNull().references(() => databaseConnections.id, { onDelete: "restrict" }),
  triggeringMessageId: uuid("triggering_message_id").notNull(), responseMessageId: uuid("response_message_id"),
  idempotencyKey: text("idempotency_key").notNull(), requestFingerprint: text("request_fingerprint").notNull(),
  status: queryRunStatus("status").notNull().default("accepted"), statusVersion: integer("status_version").notNull().default(1),
  providerId: text("provider_id").notNull().default("postgresql"), dialectId: text("dialect_id").notNull().default("postgresql"),
  generatedQuery: jsonb("generated_query").$type<ProviderQuery>(), resultPreview: jsonb("result_preview").$type<BoundedResultPreview>(),
  returnedRowCount: integer("returned_row_count"), totalRowCount: bigint("total_row_count", { mode: "number" }), truncated: boolean("truncated"),
  executionTimeMs: integer("execution_time_ms"), generatedAt: timestamp("generated_at", { withTimezone: true }),
  startedAt: timestamp("started_at", { withTimezone: true }), finishedAt: timestamp("finished_at", { withTimezone: true }),
  errorCode: text("error_code"), errorMessage: text("error_message"), ...timestamps,
}, (t) => [
  uniqueIndex("v2_query_runs_owner_conversation_idempotency_uidx").on(t.ownerUserId, t.conversationId, t.idempotencyKey),
  index("v2_query_runs_owner_updated_idx").on(t.ownerUserId, t.updatedAt.desc(), t.id.desc()),
  index("v2_query_runs_recovery_idx").on(t.status, t.updatedAt),
  check("v2_query_runs_status_version", sql`${t.statusVersion} > 0`),
  check("v2_query_runs_preview_size", sql`${t.resultPreview} is null or pg_column_size(${t.resultPreview}) <= 262144`),
]);

export const dashboards = pgTable("v2_dashboards", {
  id: uuid("id").primaryKey(), ...owned, name: text("name").notNull(), ...softDelete, ...timestamps,
}, (t) => [index("v2_dashboards_owner_updated_idx").on(t.ownerUserId, t.updatedAt.desc(), t.id.desc()), check("v2_dashboards_name_len", sql`char_length(${t.name}) between 1 and 120`)]);

export const dashboardWidgets = pgTable("v2_dashboard_widgets", {
  id: uuid("id").primaryKey(), dashboardId: uuid("dashboard_id").notNull().references(() => dashboards.id, { onDelete: "cascade" }),
  queryRunId: uuid("query_run_id").references(() => queryRuns.id, { onDelete: "set null" }), title: text("title").notNull(),
  chartConfig: jsonb("chart_config").$type<ChartConfig>().notNull(), layout: jsonb("layout").$type<WidgetLayout>().notNull(),
  snapshot: jsonb("snapshot").$type<BoundedResultPreview>().notNull(), queryDefinition: jsonb("query_definition").$type<ProviderQuery>(), ...timestamps,
}, (t) => [index("v2_widgets_dashboard_idx").on(t.dashboardId, t.createdAt, t.id), check("v2_widgets_snapshot_size", sql`pg_column_size(${t.snapshot}) <= 262144`)]);

export const dashboardAccessGrants = pgTable("v2_dashboard_access_grants", {
  id: uuid("id").primaryKey(), dashboardId: uuid("dashboard_id").notNull().references(() => dashboards.id, { onDelete: "cascade" }),
  recipientUserId: text("recipient_user_id").notNull(), permission: text("permission").notNull().default("view"), ...timestamps,
}, (t) => [uniqueIndex("v2_grants_dashboard_recipient_uidx").on(t.dashboardId, t.recipientUserId)]);

export const dashboardShareLinks = pgTable("v2_dashboard_share_links", {
  id: uuid("id").primaryKey(), dashboardId: uuid("dashboard_id").notNull().references(() => dashboards.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(), passwordHash: text("password_hash"), version: integer("version").notNull().default(1),
  expiresAt: timestamp("expires_at", { withTimezone: true }), revokedAt: timestamp("revoked_at", { withTimezone: true }), ...timestamps,
}, (t) => [uniqueIndex("v2_share_links_token_hash_uidx").on(t.tokenHash), index("v2_share_links_dashboard_idx").on(t.dashboardId, t.createdAt.desc(), t.id.desc())]);

export const auditLogs = pgTable("v2_audit_logs", {
  id: uuid("id").primaryKey(), actorUserId: text("actor_user_id"), action: text("action").notNull(), resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id"), outcome: text("outcome").notNull(), metadata: jsonb("metadata").$type<Record<string, JsonValue>>().notNull().default({}), ...timestamps,
}, (t) => [index("v2_audit_actor_created_idx").on(t.actorUserId, t.createdAt.desc(), t.id.desc())]);

export const durableJobs = pgTable("v2_durable_jobs", {
  id: uuid("id").primaryKey(), type: text("type").notNull(), payloadVersion: integer("payload_version").notNull(),
  payload: jsonb("payload").$type<Record<string, JsonValue>>().notNull(), idempotencyKey: text("idempotency_key").notNull(),
  status: jobStatus("status").notNull().default("queued"), priority: integer("priority").notNull().default(0), attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(5), availableAt: timestamp("available_at", { withTimezone: true }).defaultNow().notNull(),
  leaseOwner: text("lease_owner"), leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }), lastErrorCode: text("last_error_code"),
  startedAt: timestamp("started_at", { withTimezone: true }), completedAt: timestamp("completed_at", { withTimezone: true }), ...timestamps,
}, (t) => [
  uniqueIndex("v2_jobs_type_idempotency_uidx").on(t.type, t.idempotencyKey),
  index("v2_jobs_claim_idx").on(t.status, t.availableAt, t.priority.desc(), t.id),
  index("v2_jobs_lease_idx").on(t.status, t.leaseExpiresAt),
  check("v2_jobs_attempts", sql`${t.attempts} >= 0 and ${t.maxAttempts} > 0 and ${t.attempts} <= ${t.maxAttempts}`),
  check("v2_jobs_payload_size", sql`pg_column_size(${t.payload}) <= 65536`),
]);
