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
} from "@/components/providers/app-state.constants";
import type { AppStateContextValue, PendingQueryState } from "@/components/providers/app-state.types";
import {
  createFallbackDashboard,
  getConnectionCacheKey,
  getSchemaStorageKey,
  maskConnectionString,
} from "@/components/providers/app-state.utils";
import {
  resetPersistedConnectionState,
  usePersistentAppState,
} from "@/components/providers/usePersistentAppState";
import type {
  ChartType,
  ChatMessage,
  Dashboard,
  DashboardWidget,
  DbConnection,
  SchemaInfo,
  SchemaResponse,
} from "@/types";

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [connection, setConnection] = useState<DbConnection | null>(null);
  const [connectionInitialized, setConnectionInitialized] = useState(false);
  const [schema, setSchema] = useState<SchemaInfo | null>(null);
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pendingQuery, setPendingQuery] = useState<PendingQueryState>({
    isLoading: false,
    stage: null,
    content: "",
  });
  const [dashboard, setDashboard] = useState<Dashboard>(createFallbackDashboard);
  const [dashboardInitialized, setDashboardInitialized] = useState(false);
  const pendingQueryReset: PendingQueryState = {
    isLoading: false,
    stage: null,
    content: "",
  };

  usePersistentAppState({
    connectionInitialized,
    setConnectionInitialized,
    setConnection,
    setSchema,
    messages,
    setMessages,
    dashboard,
    dashboardInitialized,
    setDashboardInitialized,
    setDashboard,
  });

  const fetchSchema = useCallback(async (connectionString?: string) => {
    setLoadingSchema(true);
    try {
      const response = await fetch("/api/schema", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionString }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Failed to load schema");
      }
      const body = (await response.json()) as SchemaResponse;
      setSchema(body.schema);

      if (typeof window !== "undefined") {
        const schemaStorageKey = getSchemaStorageKey(
          connectionString
            ? { type: "custom", connectionString, name: "" }
            : { type: "demo", name: "Demo database" },
        );
        if (schemaStorageKey) {
          window.sessionStorage.setItem(schemaStorageKey, JSON.stringify(body.schema));
        }
      }
    } finally {
      setLoadingSchema(false);
    }
  }, []);

  const saveConnection = useCallback((next: DbConnection | null) => {
    setConnection(next);

    if (typeof window === "undefined") return;

    if (!next) {
      resetPersistedConnectionState({
        setSchema,
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
    window.localStorage.setItem(CONNECTION_TYPE_KEY, next.type);
    window.localStorage.setItem(CONNECTION_NAME_KEY, next.name);

    if (isDifferentConnection) {
      const schemaStorageKey = getSchemaStorageKey(next);
      const rawSchema = schemaStorageKey ? window.sessionStorage.getItem(schemaStorageKey) : null;
      setSchema(rawSchema ? (JSON.parse(rawSchema) as SchemaInfo) : null);
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

  const value = useMemo<AppStateContextValue>(
    () => ({
      connection,
      connectionInitialized,
      maskedConnection: maskConnectionString(connection?.connectionString),
      saveConnection,
      clearConnection: () => saveConnection(null),
      schema,
      loadingSchema,
      fetchSchema,
      clearSchema: () => setSchema(null),
      messages,
      setMessages,
      clearMessages: () => setMessages([]),
      updateMessageChartType,
      pendingQuery,
      setPendingQuery,
      dashboard,
      dashboardInitialized,
      setDashboard,
      addDashboardWidget,
    }),
    [
      connection,
      connectionInitialized,
      schema,
      loadingSchema,
      messages,
      pendingQuery,
      dashboard,
      dashboardInitialized,
      fetchSchema,
      saveConnection,
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
