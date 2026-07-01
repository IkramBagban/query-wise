"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  CONNECTION_KEY,
  CONNECTION_NAME_KEY,
  CONNECTION_TYPE_KEY,
  CONVERSATION_KEY,
} from "@/store/app-state/constants";
import type { AppStateContextValue, PendingQueryState } from "@/store/app-state/types";
import {
  createFallbackDashboard,
  getConnectionCacheKey,
  getSchemaAnalysisStorageKey,
  getSchemaStorageKey,
  maskConnectionString,
} from "@/store/app-state/utils";
import {
  resetPersistedConnectionState,
  useAppState as useAppStateStore,
} from "@/store/app-state/use-app-state";
import type {
  ChartType,
  ChatMessage,
  Dashboard,
  DashboardWidget,
  DbConnection,
  SchemaInfo,
} from "@/types";

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [connection, setConnection] = useState<DbConnection | null>(null);
  const [connectionInitialized, setConnectionInitialized] = useState(false);
  const [schema, setSchema] = useState<SchemaInfo | null>(null);
  const [schemaAnalysis, setSchemaAnalysisState] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pendingQuery, setPendingQuery] = useState<PendingQueryState>({
    isLoading: false,
    stage: null,
    content: "",
  });
  const [dashboard, setDashboard] = useState<Dashboard>(createFallbackDashboard);
  const [dashboardInitialized, setDashboardInitialized] = useState(false);
  const [dashboardVersion, setDashboardVersion] = useState(0);
  const [chatVersion, setChatVersion] = useState(0);
  const pendingQueryReset: PendingQueryState = {
    isLoading: false,
    stage: null,
    content: "",
  };

  useAppStateStore({
    connectionInitialized,
    setConnectionInitialized,
    setConnection,
    setSchema,
    setSchemaAnalysis: setSchemaAnalysisState,
    messages,
    setMessages,
    dashboard,
    dashboardInitialized,
    setDashboardInitialized,
    setDashboard,
  });

  const setSchemaAnalysis = useCallback((analysis: string | null) => {
    setSchemaAnalysisState(analysis);

    if (typeof window === "undefined") return;
    const connectionForKey = connection ?? { type: "demo" as const, name: "Demo database" };
    const schemaAnalysisStorageKey = getSchemaAnalysisStorageKey(connectionForKey);
    if (!schemaAnalysisStorageKey) return;

    if (!analysis) {
      window.sessionStorage.removeItem(schemaAnalysisStorageKey);
      return;
    }
    window.sessionStorage.setItem(schemaAnalysisStorageKey, analysis);
  }, [connection]);

  const saveConnection = useCallback((next: DbConnection | null) => {
    setConnection(next);

    if (typeof window === "undefined") return;

    if (!next) {
      resetPersistedConnectionState({
        setSchema,
        setSchemaAnalysis: setSchemaAnalysisState,
        setMessages,
        setPendingQuery,
        pendingQueryReset,
      });
      return;
    }

    const currentKey = getConnectionCacheKey(connection);
    const nextKey = getConnectionCacheKey(next);
    const isDifferentConnection = currentKey !== nextKey;

    window.sessionStorage.setItem(CONNECTION_KEY, JSON.stringify(next));
    window.sessionStorage.setItem(CONNECTION_TYPE_KEY, next.type);
    window.sessionStorage.setItem(CONNECTION_NAME_KEY, next.name);

    if (isDifferentConnection) {
      const schemaStorageKey = getSchemaStorageKey(next);
      const schemaAnalysisStorageKey = getSchemaAnalysisStorageKey(next);
      const rawSchema = schemaStorageKey ? window.sessionStorage.getItem(schemaStorageKey) : null;
      const rawSchemaAnalysis = schemaAnalysisStorageKey
        ? window.sessionStorage.getItem(schemaAnalysisStorageKey)
        : null;
      setSchema(rawSchema ? (JSON.parse(rawSchema) as SchemaInfo) : null);
      setSchemaAnalysisState(rawSchemaAnalysis ?? null);
      setMessages([]);
      setPendingQuery(pendingQueryReset);
      window.sessionStorage.removeItem(CONVERSATION_KEY);
    }
  }, [connection, pendingQueryReset]);

  const updateMessageChartType = (messageId: string, type: ChartType) => {
    setMessages((prev) =>
      prev.map((message) =>
        message.id === messageId && message.chartConfig
          ? { ...message, chartConfig: { ...message.chartConfig, type } }
          : message,
      ),
    );
  };

  const addDashboardWidget = (widget: DashboardWidget) => {
    setDashboard((prev) => ({
      ...prev,
      widgets: [...prev.widgets, widget],
      updatedAt: Date.now(),
    }));
  };

  const bumpDashboardVersion = useCallback(() => setDashboardVersion((v) => v + 1), []);
  const bumpChatVersion = useCallback(() => setChatVersion((v) => v + 1), []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setPendingQuery({
      isLoading: false,
      stage: null,
      content: "",
    });
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(CONVERSATION_KEY);
    }
  }, []);

  const value = useMemo<AppStateContextValue>(
    () => ({
      connection,
      connectionInitialized,
      maskedConnection: maskConnectionString(connection?.connectionString),
      saveConnection,
      clearConnection: () => saveConnection(null),
      schema,
      schemaAnalysis,
      setSchemaAnalysis,
      clearSchemaAnalysis: () => setSchemaAnalysis(null),
      messages,
      setMessages,
      clearMessages,
      updateMessageChartType,
      pendingQuery,
      setPendingQuery,
      dashboard,
      dashboardInitialized,
      setDashboard,
      addDashboardWidget,
      dashboardVersion,
      bumpDashboardVersion,
      chatVersion,
      bumpChatVersion,
    }),
    [
      connection,
      connectionInitialized,
      schema,
      schemaAnalysis,
      messages,
      pendingQuery,
      dashboard,
      dashboardInitialized,
      setSchemaAnalysis,
      saveConnection,
      clearMessages,
      dashboardVersion,
      bumpDashboardVersion,
      chatVersion,
      bumpChatVersion,
    ],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error("useAppState must be used within AppStateProvider");
  }
  return context;
}

