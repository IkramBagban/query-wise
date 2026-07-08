import type { ClerkUserId, ContractVersion, DurableResource, IsoDateTime, JsonValue, OwnedResource, ResourceId, SoftDeletableResource } from "./core";
import type { BoundedResultPreview, CanonicalDataSourceMetadata, DataSourceCapability, DataSourceProviderId, ProviderQuery, SqlDialectId } from "./data-source";
import type { EncryptedPayload } from "./security";

export type ConnectionStatus = "pending" | "connected" | "error" | "disabled" | "deleting" | "deleted";
export type SchemaSyncStatus = "never" | "queued" | "running" | "introspecting" | "describing" | "embedding" | "ready" | "error";
export type SchemaSnapshotStatus = "queued" | "syncing" | "succeeded" | "failed" | "superseded";
export type ConversationStatus = "active" | "archived";
export type MessageRole = "user" | "assistant" | "system";
export type QueryRunStatus = "accepted" | "preparing" | "generating" | "validating" | "executing" | "persisting" | "succeeded" | "failed" | "cancelled" | "expired";
export type JobStatus = "queued" | "running" | "succeeded" | "dead" | "cancelled";

export interface UserRecord extends DurableResource, SoftDeletableResource { clerkUserId: ClerkUserId }
export interface DataSourceConnectionRecord extends OwnedResource, SoftDeletableResource {
  providerId: DataSourceProviderId; dialectId: SqlDialectId; name: string; hostDisplay: string; port: number | null;
  databaseName: string; encryptedSecret: EncryptedPayload | null; credentialVersion: number; status: ConnectionStatus;
  lastTestedAt: IsoDateTime | null; lastTestErrorCode: string | null; lastSchemaSyncAt: IsoDateTime | null; schemaSyncStatus: SchemaSyncStatus;
}
export interface ConnectionDto {
  contractVersion: ContractVersion; id: ResourceId; providerId: DataSourceProviderId; dialectId: SqlDialectId; name: string;
  hostDisplay: string; port: number | null; databaseName: string; status: Exclude<ConnectionStatus, "deleted">;
  lastTestedAt: IsoDateTime | null; lastSchemaSyncAt: IsoDateTime | null; schemaSyncStatus: SchemaSyncStatus; capabilities: DataSourceCapability[];
}
export interface SchemaSnapshotRecord extends DurableResource {
  ownerUserId: ClerkUserId; connectionId: ResourceId; snapshotVersion: number; partitionIndex: number; partitionCount: number;
  status: SchemaSnapshotStatus; schemaHash: string | null; metadata: CanonicalDataSourceMetadata | null; summary: string | null;
  errorCode: string | null; completedAt: IsoDateTime | null;
}
export interface ConversationRecord extends OwnedResource, SoftDeletableResource {
  connectionId: ResourceId; title: string; status: ConversationStatus; lastActivityAt: IsoDateTime;
}
export interface ConversationDto {
  contractVersion: ContractVersion; id: ResourceId; connectionId: ResourceId; title: string; status: ConversationStatus;
  lastActivityAt: IsoDateTime; createdAt: IsoDateTime; updatedAt: IsoDateTime;
}
export interface MessageRecord extends DurableResource {
  conversationId: ResourceId; sequence: number; role: MessageRole; content: string; queryRunId: ResourceId | null;
  metadata: { schemaVersion: 1; errorCode?: string; chartConfig?: ChartConfig };
}
export interface MessageDto {
  contractVersion: ContractVersion; id: ResourceId; sequence: number; role: MessageRole; content: string;
  queryRunId: ResourceId | null; metadata: MessageRecord["metadata"]; createdAt: IsoDateTime;
}
export type QueryResultBlockValidation = "valid" | "blocked";
export interface QueryResultBlock {
  index: number;
  purpose: string;
  sql: string;
  validation: QueryResultBlockValidation;
  resultPreview: BoundedResultPreview;
  rowCount: number;
  totalRowCount: number | null;
  truncated: boolean;
  executionTimeMs: number;
  chartConfig: ChartConfig | null;
}
export interface QueryRunRecord extends OwnedResource {
  conversationId: ResourceId; connectionId: ResourceId; triggeringMessageId: ResourceId; responseMessageId: ResourceId | null;
  idempotencyKey: string; requestFingerprint: string; status: QueryRunStatus; statusVersion: number; providerId: DataSourceProviderId;
  dialectId: SqlDialectId; generatedQuery: ProviderQuery | null; resultPreview: BoundedResultPreview | null; resultBlocks: QueryResultBlock[];
  returnedRowCount: number | null;
  totalRowCount: number | null; truncated: boolean | null; executionTimeMs: number | null; generatedAt: IsoDateTime | null;
  startedAt: IsoDateTime | null; finishedAt: IsoDateTime | null; errorCode: string | null; errorMessage: string | null;
}
export type QueryRunDto = Omit<QueryRunRecord, "ownerUserId" | "requestFingerprint"> & { contractVersion: ContractVersion };
export type ChartType = "bar" | "line" | "pie" | "scatter" | "area" | "table";
export interface ChartConfig { schemaVersion: 1; type: ChartType; xKey?: string; yKey?: string; yKeys?: string[]; nameKey?: string; valueKey?: string; seriesKey?: string; title?: string }
export interface PublicChartConfig { schemaVersion: 1; type: ChartType; xKey?: string; yKey?: string; yKeys?: string[]; nameKey?: string; valueKey?: string; title?: string }
export interface WidgetLayout { schemaVersion: 1; x: number; y: number; w: number; h: number }
// SPEC-06 §2: a widget is "snapshot" (frozen) or "live" (re-executes on demand).
export type WidgetMode = "live" | "snapshot";
// SPEC-06 §5: the global date-range control. Presets or an explicit custom span.
export type DateRangePreset = "7d" | "30d" | "90d" | "mtd" | "qtd" | "ytd";
export type DashboardDateRange = { preset: DateRangePreset } | { from: IsoDateTime; to: IsoDateTime };
// SPEC-06 §5: pin-time binding of the query's primary time predicate. Present only
// when the stored SQL carries the :qw_from/:qw_to parameter markers.
export interface WidgetFilterBinding { dateColumn: string; tableAlias: string | null; defaultRange: DashboardDateRange }
export interface DashboardRecord extends OwnedResource, SoftDeletableResource { name: string }
export interface DashboardWidgetRecord extends DurableResource { dashboardId: ResourceId; queryRunId: ResourceId | null; title: string; chartConfig: ChartConfig; layout: WidgetLayout; snapshot: BoundedResultPreview; queryDefinition: ProviderQuery | null; mode: WidgetMode; connectionId: ResourceId | null; lastRefreshedAt: IsoDateTime | null; lastRefreshError: string | null; filterBinding: WidgetFilterBinding | null }
export interface DashboardAccessGrantRecord extends DurableResource { dashboardId: ResourceId; recipientUserId: ClerkUserId; permission: "view" }
export interface DashboardShareLinkRecord extends DurableResource { dashboardId: ResourceId; tokenHash: string; encryptedToken: EncryptedPayload | null; passwordHash: string | null; version: number; viewCount: number; lastViewedAt: IsoDateTime | null; expiresAt: IsoDateTime | null; revokedAt: IsoDateTime | null }
export interface DashboardOwnerWidgetDto extends DurableResource { id: ResourceId; dashboardId: ResourceId; queryRunId: ResourceId | null; title: string; chartConfig: ChartConfig; layout: WidgetLayout; snapshot: BoundedResultPreview; queryDefinition: ProviderQuery | null; mode: WidgetMode; connectionId: ResourceId | null; lastRefreshedAt: IsoDateTime | null; lastRefreshError: string | null; filterBinding: WidgetFilterBinding | null }
export interface DashboardViewerWidgetDto extends DurableResource { id: ResourceId; dashboardId: ResourceId; title: string; chartConfig: ChartConfig; layout: WidgetLayout; snapshot: BoundedResultPreview; mode: WidgetMode; lastRefreshedAt: IsoDateTime | null; lastRefreshError: string | null; filterBinding: WidgetFilterBinding | null }
export interface DashboardOwnerDto { contractVersion: ContractVersion; id: ResourceId; name: string; access: "owner"; defaultDateRange: DashboardDateRange | null; refreshIntervalSeconds: number | null; widgets: DashboardOwnerWidgetDto[]; createdAt: IsoDateTime; updatedAt: IsoDateTime }
export interface DashboardViewerDto { contractVersion: ContractVersion; id: ResourceId; name: string; access: "viewer"; defaultDateRange: DashboardDateRange | null; refreshIntervalSeconds: number | null; widgets: DashboardViewerWidgetDto[]; createdAt: IsoDateTime; updatedAt: IsoDateTime }
// SPEC-06 §4.1: single-widget refresh outcome. `result` overwrites the rendered
// preview on success; `error` is set (and the old snapshot kept) on failure.
export interface WidgetRefreshResultDto { widgetId: ResourceId; status: "ok" | "error" | "skipped"; result: BoundedResultPreview | null; lastRefreshedAt: IsoDateTime | null; error: { code: string; message: string } | null }
export interface DashboardRefreshResultDto { contractVersion: ContractVersion; dashboardId: ResourceId; widgets: WidgetRefreshResultDto[] }
export interface PublicDashboardWidgetDto { id: ResourceId; title: string; chartConfig: PublicChartConfig; layout: WidgetLayout; result: BoundedResultPreview | null; error: { code: string; message: string } | null }
export interface PublicDashboardDto { contractVersion: ContractVersion; dashboard: { name: string; updatedAt: IsoDateTime; widgets: PublicDashboardWidgetDto[] }; share: { expiresAt: IsoDateTime | null } }
export interface AuditLogRecord extends DurableResource { actorUserId: ClerkUserId | null; action: string; resourceType: string; resourceId: string | null; outcome: string; metadata: Record<string, JsonValue> }
export interface DurableJobRecord extends DurableResource { type: string; payloadVersion: number; payload: Record<string, JsonValue>; idempotencyKey: string; status: JobStatus; priority: number; attempts: number; maxAttempts: number; availableAt: IsoDateTime; leaseOwner: string | null; leaseExpiresAt: IsoDateTime | null; lastErrorCode: string | null; startedAt: IsoDateTime | null; completedAt: IsoDateTime | null }
