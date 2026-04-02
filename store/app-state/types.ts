import type { ChartType, ChatMessage, Dashboard, DashboardWidget, DbConnection, SchemaInfo } from "@/types";

export type PendingQueryState = {
  isLoading: boolean;
  stage: string | null;
  content: string;
};

export type AppStateContextValue = {
  connection: DbConnection | null;
  connectionInitialized: boolean;
  maskedConnection: string;
  saveConnection: (next: DbConnection | null) => void;
  clearConnection: () => void;
  schema: SchemaInfo | null;
  schemaAnalysis: string | null;
  loadingSchema: boolean;
  fetchSchema: (connectionString?: string) => Promise<void>;
  clearSchema: () => void;
  setSchemaAnalysis: (analysis: string | null) => void;
  clearSchemaAnalysis: () => void;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  clearMessages: () => void;
  updateMessageChartType: (messageId: string, type: ChartType) => void;
  pendingQuery: PendingQueryState;
  setPendingQuery: React.Dispatch<React.SetStateAction<PendingQueryState>>;
  dashboard: Dashboard;
  dashboardInitialized: boolean;
  setDashboard: React.Dispatch<React.SetStateAction<Dashboard>>;
  addDashboardWidget: (widget: DashboardWidget) => void;
};
