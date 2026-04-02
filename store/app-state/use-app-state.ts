"use client";

import { useEffect } from "react";

import {
  CONNECTION_KEY,
  CONNECTION_NAME_KEY,
  CONNECTION_TYPE_KEY,
  CONVERSATION_KEY,
  DASHBOARD_KEY,
} from "@/store/app-state/constants";
import {
  createFallbackDashboard,
  getSchemaAnalysisStorageKey,
  getSchemaStorageKey,
} from "@/store/app-state/utils";
import type { PendingQueryState } from "@/store/app-state/types";
import type { ChatMessage, Dashboard, DbConnection, SchemaInfo } from "@/types";

type UseAppStateParams = {
  connectionInitialized: boolean;
  setConnectionInitialized: React.Dispatch<React.SetStateAction<boolean>>;
  setConnection: React.Dispatch<React.SetStateAction<DbConnection | null>>;
  setSchema: React.Dispatch<React.SetStateAction<SchemaInfo | null>>;
  setSchemaAnalysis: React.Dispatch<React.SetStateAction<string | null>>;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  dashboard: Dashboard;
  dashboardInitialized: boolean;
  setDashboardInitialized: React.Dispatch<React.SetStateAction<boolean>>;
  setDashboard: React.Dispatch<React.SetStateAction<Dashboard>>;
};

export function useAppState({
  connectionInitialized,
  setConnectionInitialized,
  setConnection,
  setSchema,
  setSchemaAnalysis,
  messages,
  setMessages,
  dashboard,
  dashboardInitialized,
  setDashboardInitialized,
  setDashboard,
}: UseAppStateParams) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const rawConnection = window.sessionStorage.getItem(CONNECTION_KEY);
      if (rawConnection) {
        const parsed = JSON.parse(rawConnection) as DbConnection;
        setConnection(parsed);

        const schemaStorageKey = getSchemaStorageKey(parsed);
        if (schemaStorageKey) {
          const rawSchema = window.sessionStorage.getItem(schemaStorageKey);
          if (rawSchema) {
            setSchema(JSON.parse(rawSchema) as SchemaInfo);
          }
        }

        const schemaAnalysisStorageKey = getSchemaAnalysisStorageKey(parsed);
        if (schemaAnalysisStorageKey) {
          const rawAnalysis = window.sessionStorage.getItem(schemaAnalysisStorageKey);
          if (rawAnalysis) {
            setSchemaAnalysis(rawAnalysis);
          }
        }
      }

      const rawConversation = window.sessionStorage.getItem(CONVERSATION_KEY);
      if (rawConversation) {
        setMessages(JSON.parse(rawConversation) as ChatMessage[]);
      }
    } finally {
      setConnectionInitialized(true);
    }
  }, [setConnection, setConnectionInitialized, setMessages, setSchema, setSchemaAnalysis]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const rawDashboard = window.localStorage.getItem(DASHBOARD_KEY);
      if (rawDashboard) {
        setDashboard(JSON.parse(rawDashboard) as Dashboard);
      } else {
        const fallback = createFallbackDashboard();
        window.localStorage.setItem(DASHBOARD_KEY, JSON.stringify(fallback));
        setDashboard(fallback);
      }
    } finally {
      setDashboardInitialized(true);
    }
  }, [setDashboard, setDashboardInitialized]);

  useEffect(() => {
    if (!dashboardInitialized || typeof window === "undefined") return;
    window.localStorage.setItem(DASHBOARD_KEY, JSON.stringify(dashboard));
  }, [dashboard, dashboardInitialized]);

  useEffect(() => {
    if (!connectionInitialized || typeof window === "undefined") return;
    window.sessionStorage.setItem(CONVERSATION_KEY, JSON.stringify(messages));
  }, [connectionInitialized, messages]);
}

type ResetPersistedConnectionParams = {
  setSchema: React.Dispatch<React.SetStateAction<SchemaInfo | null>>;
  setSchemaAnalysis: React.Dispatch<React.SetStateAction<string | null>>;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setPendingQuery: React.Dispatch<React.SetStateAction<PendingQueryState>>;
  pendingQueryReset: PendingQueryState;
};

export function resetPersistedConnectionState({
  setSchema,
  setSchemaAnalysis,
  setMessages,
  setPendingQuery,
  pendingQueryReset,
}: ResetPersistedConnectionParams) {
  if (typeof window === "undefined") return;

  window.sessionStorage.removeItem(CONNECTION_KEY);
  window.sessionStorage.removeItem(CONVERSATION_KEY);
  window.localStorage.removeItem(CONNECTION_TYPE_KEY);
  window.localStorage.removeItem(CONNECTION_NAME_KEY);
  setSchema(null);
  setSchemaAnalysis(null);
  setMessages([]);
  setPendingQuery(pendingQueryReset);
}



