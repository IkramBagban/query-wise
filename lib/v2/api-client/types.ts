import type {
  BoundedResultPreview,
  CanonicalDataSourceMetadata,
  ChartConfig,
  ConnectionDto,
  ConversationDto,
  CursorPage,
  DashboardOwnerDto,
  DashboardViewerDto,
  IsoDateTime,
  MessageDto,
  PublicDashboardDto,
  QueryRunDto,
  ResourceId,
} from "@/types/v2";

export type DashboardDto = DashboardOwnerDto | DashboardViewerDto;

export interface ConnectionListItem extends ConnectionDto {
  updatedAt?: IsoDateTime;
}

export interface ConversationListItem extends ConversationDto {}

export interface DashboardListItem {
  id: ResourceId;
  name: string;
  access: "owner" | "viewer";
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

export interface QueryAccepted {
  contractVersion: "querywise.v2";
  queryRunId: ResourceId;
  status: QueryRunDto["status"];
  statusVersion: number;
}

export interface ShareListItem {
  id: ResourceId;
  kind?: "link" | "grant";
  url?: string;
  recipientEmail?: string;
  passwordProtected?: boolean;
  expiresAt?: IsoDateTime | null;
  revokedAt?: IsoDateTime | null;
  createdAt?: IsoDateTime;
}

export interface CreateConnectionInput {
  name: string;
  providerId: "postgresql";
  credential: {
    connectionString: string;
  };
}

export interface SubmitQueryInput {
  conversationId: ResourceId;
  question: string;
  provider: string;
  model: string;
  apiKey: string;
  idempotencyKey: string;
}

export interface CreateWidgetInput {
  title: string;
  queryRunId?: ResourceId | null;
  chartConfig: ChartConfig;
  layout: { schemaVersion: 1; x: number; y: number; w: number; h: number };
  snapshot: BoundedResultPreview;
}

export type {
  CanonicalDataSourceMetadata,
  ConnectionDto,
  ConversationDto,
  CursorPage,
  MessageDto,
  PublicDashboardDto,
  QueryRunDto,
};
