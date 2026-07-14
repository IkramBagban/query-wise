import type {
  BoundedResultPreview,
  CanonicalDataSourceMetadata,
  ChartConfig,
  ConnectionDto,
  ConversationDto,
  CursorPage,
  DashboardDateRange,
  DashboardOwnerDto,
  DashboardViewerDto,
  IsoDateTime,
  MessageDto,
  PublicDashboardDto,
  QueryRunDto,
  ResourceId,
  WidgetMode,
  WidgetRefreshResultDto,
} from "@query-wise/shared/types";

export type DashboardDto = DashboardOwnerDto | DashboardViewerDto;

export interface ConnectionListItem extends ConnectionDto {
  updatedAt?: IsoDateTime;
}

export interface ConnectionDeletionImpact {
  contractVersion: "querywise.v2";
  conversations: number;
  dashboards: number;
  liveShareLinks: number;
  snapshotShareLinks: number;
}

export interface ConversationListItem extends ConversationDto {
  messageCount: number;
  connectionDeleted: boolean;
}

export interface ConversationDetail extends ConversationDto {
  connection: { id: string; name: string; providerId: string; dialectId: string };
  connectionDeleted: boolean;
}

export type ConversationMessageDto = MessageDto & {
  queryRun: {
    status: QueryRunDto["status"];
    generatedQuery: QueryRunDto["generatedQuery"];
    resultPreview: QueryRunDto["resultPreview"];
    resultBlocks: QueryRunDto["resultBlocks"];
    returnedRowCount: number | null;
    totalRowCount: number | null;
    truncated: boolean | null;
    executionTimeMs: number | null;
    errorCode: string | null;
    errorMessage: string | null;
  } | null;
};

export interface DashboardListItem {
  id: ResourceId;
  name: string;
  access: "owner" | "viewer";
  mode: WidgetMode;
  widgetCount?: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface SchemaDto {
  contractVersion: "querywise.v2";
  metadata: CanonicalDataSourceMetadata | null;
  summary?: string | null;
  status?: string;
}

export interface ShareLinkListItem {
  id: ResourceId;
  passwordProtected: boolean;
  mode: WidgetMode;
  version: number;
  urlAvailable: boolean;
  url: string | null;
  viewCount: number;
  lastViewedAt: IsoDateTime | null;
  expiresAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface ShareGrantListItem {
  id: ResourceId;
  recipient: { kind: "user"; userId: string } | { kind: "pending-email" };
  permission: "view";
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface ShareCollection {
  links: ShareLinkListItem[];
  grants: ShareGrantListItem[];
}

export type CreateShareResult =
  | {
      type: "link";
      link: {
        id: ResourceId;
        url: string;
        urlAvailable: true;
        passwordProtected: boolean;
        mode: WidgetMode;
        version: number;
        viewCount: number;
        lastViewedAt: IsoDateTime | null;
        expiresAt: IsoDateTime | null;
        createdAt: IsoDateTime;
        updatedAt: IsoDateTime;
      };
    }
  | {
      type: "grant";
      grant: ShareGrantListItem;
    };

export type CreateShareInput =
  | { type: "link"; password?: string; expiresAt?: string; mode?: WidgetMode }
  | { type: "grant"; recipientEmail: string };

export interface ShareUnlockResult {
  unlocked: true;
}

export interface CreateConnectionInput {
  name: string;
  providerId: "postgresql";
  connectionString: string;
}

export interface SubmitQueryInput {
  conversationId: ResourceId;
  question: string;
  idempotencyKey: string;
}

export type QueryStreamEventType = "status" | "text-delta" | "sql-preview" | "query-stats" | "block-data" | "chart-config" | "activity" | "completed" | "failed";

export interface QueryStreamEvent {
  contractVersion: "querywise.v2";
  queryRunId: ResourceId;
  sequence: number;
  type: QueryStreamEventType;
  occurredAt: IsoDateTime;
  data: unknown;
}

export interface CreateWidgetInput {
  title: string;
  queryRunId?: ResourceId | null;
  chartConfig: ChartConfig;
  layout: { schemaVersion: 1; x: number; y: number; w: number; h: number };
  snapshot: BoundedResultPreview;
  // SPEC-09 §2.3: the pinned view's client-side transform (null/omitted = raw dataset).
  viewTransform?: import("@query-wise/shared/types").ViewTransform | null;
}

export type {
  CanonicalDataSourceMetadata,
  ConnectionDto,
  ConversationDto,
  CursorPage,
  DashboardDateRange,
  MessageDto,
  PublicDashboardDto,
  QueryRunDto,
  WidgetMode,
  WidgetRefreshResultDto,
};
