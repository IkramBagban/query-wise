"use client";

import { useRouter } from "next/navigation";
import { Menu, PanelRight, Share2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAppState } from "@/store/app-state";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { SchemaPanel } from "@/components/schema/SchemaPanel";
import { WorkspaceContextPanel } from "@/components/workspace/WorkspaceContextPanel";
import { WorkspaceLeftSidebar } from "@/components/workspace/WorkspaceLeftSidebar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { useQueryHistory } from "@/hooks/useQueryHistory";
import { useSettings } from "@/hooks/useSettings";
import { QueryHistoryPanel } from "@/components/history/QueryHistoryPanel";
import {
  LLM_PROVIDER_OPTIONS,
  SUPPORTED_MODELS_BY_PROVIDER,
  type LlmProvider,
} from "@/lib/llm-config";
import { useToast } from "@/hooks/useToast";
import type { ChatMessage, DashboardWidget, QueryHistoryEntry } from "@/types";

function createDashboardWidget(message: ChatMessage): DashboardWidget | null {
  if (!message.result || !message.sql || !message.chartConfig) return null;
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: message.content.slice(0, 52),
    sql: message.sql,
    result: message.result,
    chartConfig: message.chartConfig,
    x: 0,
    y: 0,
    w: 1,
    h: 1,
  };
}

export default function WorkspacePage() {
  const router = useRouter();
  const { pushToast } = useToast();
  const {
    connection,
    connectionInitialized,
    saveConnection,
    clearConnection,
    maskedConnection,
    schema,
    schemaAnalysis,
    loadingSchema,
    fetchSchema,
    clearSchema,
    addDashboardWidget,
    dashboard,
    clearSchemaAnalysis,
    clearMessages,
    setDashboard,
    messages,
  } = useAppState();
  const { provider, setProvider, model, setModel, apiKey, setApiKey } = useSettings();
  const { history, addEntry, removeEntry, clearHistory } = useQueryHistory();

  const [connectionOpen, setConnectionOpen] = useState(false);
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [rerunQuestion, setRerunQuestion] = useState<string | null>(null);
  const [schemaWidth, setSchemaWidth] = useState(320);
  const [resizingSchema, setResizingSchema] = useState(false);

  const [connectTab, setConnectTab] = useState<"demo" | "custom">("demo");
  const [connectionString, setConnectionString] = useState("");
  const [testingConnection, setTestingConnection] = useState(false);
  const [canConnectCustom, setCanConnectCustom] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [testingApiKey, setTestingApiKey] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [apiKeyTestResult, setApiKeyTestResult] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!connectionInitialized) return;
    if (loggingOut) return;
    setConnectionOpen(!connection);
  }, [connection, connectionInitialized, loggingOut]);

  useEffect(() => {
    if (!resizingSchema) return;

    const handleMouseMove = (event: MouseEvent) => {
      const nextWidth = Math.min(520, Math.max(260, event.clientX));
      setSchemaWidth(nextWidth);
    };

    const handleMouseUp = () => {
      setResizingSchema(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizingSchema]);

  useEffect(() => {
    if (!connection || schema) return;

    void fetchSchema(connection.connectionString).catch((error: unknown) => {
      pushToast({
        title: "Schema error",
        description: error instanceof Error ? error.message : "Network error",
        variant: "error",
      });
    });
  }, [connection, fetchSchema, pushToast, schema]);

  // Auto-record completed queries to history
  const lastRecordedIdRef = useRef<string | null>(null);
  useEffect(() => {
    const lastAssistant = [...messages].reverse().find(
      (m) => m.role === "assistant" && m.sql && m.result,
    );
    if (!lastAssistant || lastAssistant.id === lastRecordedIdRef.current) return;
    lastRecordedIdRef.current = lastAssistant.id;

    const assistantIdx = messages.indexOf(lastAssistant);
    const userMsg = [...messages.slice(0, assistantIdx)].reverse().find((m) => m.role === "user");

    addEntry({
      id: lastAssistant.id,
      question: userMsg?.content ?? "",
      sql: lastAssistant.sql!,
      timestamp: lastAssistant.timestamp,
      rowCount: lastAssistant.result!.rowCount,
      executionTimeMs: lastAssistant.result!.executionTimeMs,
      chartType: lastAssistant.chartConfig?.type ?? null,
    });
  }, [messages, addEntry]);

  const handleRerun = useCallback((entry: QueryHistoryEntry) => {
    setRerunQuestion(entry.question);
    setHistoryOpen(false);
  }, []);

  const connectToDatabase = async (type: "demo" | "custom", cs?: string) => {
    setConnecting(true);
    try {
      const response = await fetch("/api/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, connectionString: cs }),
      });
      const body = (await response.json().catch(() => null)) as { success?: boolean; error?: string; name?: string } | null;
      if (!response.ok || !body?.success || !body.name) {
        throw new Error(body?.error ?? "Connection failed");
      }
      saveConnection({ type, connectionString: cs, name: body.name });
      setConnectionOpen(false);
      pushToast({ title: "Connected", description: body.name, variant: "success" });
    } catch (error) {
      pushToast({ title: "Connection failed", description: error instanceof Error ? error.message : "Network error", variant: "error" });
    } finally {
      setConnecting(false);
    }
  };

  const testConnection = async () => {
    if (!connectionString.trim()) return;
    setTestingConnection(true);
    try {
      const response = await fetch("/api/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "custom", connectionString }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Test failed");
      }
      setCanConnectCustom(true);
      pushToast({ title: "Connection valid", description: "Database reachable.", variant: "success" });
    } catch (error) {
      setCanConnectCustom(false);
      pushToast({ title: "Connection test failed", description: error instanceof Error ? error.message : "Network error", variant: "error" });
    } finally {
      setTestingConnection(false);
    }
  };

  const providerOptions = useMemo(
    () => LLM_PROVIDER_OPTIONS.map((item) => ({ label: item.label, value: item.value })),
    [],
  );

  const modelOptions = useMemo(
    () => (SUPPORTED_MODELS_BY_PROVIDER[provider] ?? []).map((item) => ({ label: item, value: item })),
    [provider],
  );

  useEffect(() => {
    const availableModels = SUPPORTED_MODELS_BY_PROVIDER[provider] as readonly string[];
    if (!availableModels.includes(model)) {
      setModel(availableModels[0] ?? model);
    }
  }, [model, provider, setModel]);

  const handleProviderChange = (value: string) => {
    const next = value as LlmProvider;
    setProvider(next);
    // Auto-select first model for the new provider
    const fallback = SUPPORTED_MODELS_BY_PROVIDER[next][0];
    if (fallback) {
      setModel(fallback);
    }
  };

  const onSaveWidget = async (message: ChatMessage) => {
    const widget = createDashboardWidget(message);
    if (!widget) return;
    const next = {
      ...dashboard,
      widgets: [...dashboard.widgets, widget],
      updatedAt: Date.now(),
    };
    addDashboardWidget(widget);

    await fetch("/api/dashboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dashboard: next }),
    }).catch(() => undefined);

    // Track widget creation in Vercel Analytics (client-side)
    try {
      const { track } = await import("@vercel/analytics");
      track("widget_saved", {
        chartType: message.chartConfig?.type || "unknown",
      });
    } catch {
      // Analytics tracking is optional
    }

    pushToast({ title: "Widget saved", description: "Added to dashboard.", variant: "success" });
  };

  const testApiKey = async () => {
    if (!apiKey) {
      setApiKeyTestResult({
        type: "error",
        message: "API key is missing.",
      });
      return;
    }
    setTestingApiKey(true);
    setApiKeyTestResult(null);

    try {
      const response = await fetch("/api/llm-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          model,
          apiKey,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Provider call failed");
      }
      setApiKeyTestResult({
        type: "success",
        message: "API key works. Provider call succeeded.",
      });
    } catch (error) {
      setApiKeyTestResult({
        type: "error",
        message:
          error instanceof Error ? error.message : "Unable to reach provider.",
      });
    } finally {
      setTestingApiKey(false);
    }
  };

  const logout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) {
        throw new Error("Logout failed");
      }

      clearConnection();
      clearSchema();
      clearSchemaAnalysis();
      clearMessages();
      setDashboard((prev) => ({
        ...prev,
        widgets: [],
        updatedAt: Date.now(),
      }));
      if (typeof window !== "undefined") {
        window.sessionStorage.clear();
      }

      router.push("/signin");
      router.refresh();
    } catch {
      pushToast({ title: "Logout failed", description: "Please try again.", variant: "error" });
      setLoggingOut(false);
    }
  };
  return (
    <main className="flex h-screen min-h-screen overflow-hidden bg-white text-text-1">
      <WorkspaceLeftSidebar
        dashboard={dashboard}
        history={history}
        onNewChat={clearMessages}
        onOpenConnections={() => setConnectionOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenHistory={() => setHistoryOpen(true)}
        onRerunHistory={handleRerun}
      />

      <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#fbfdfc]">
        <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-[#e5ebe7] bg-white px-4 lg:px-6">
          <button
            onClick={() => setHistoryOpen(true)}
            className="flex size-10 items-center justify-center rounded-lg border border-[#dce5df] text-[#405249] lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="size-4" />
          </button>
          <div className="hidden min-w-0 lg:block">
            <p className="truncate text-sm font-semibold text-[#17291f]">
              {connection?.name ?? "QueryWise workspace"}
            </p>
            <p className="text-[11px] text-[#718178]">
              {connection ? "Connected and ready to analyze" : "Connect a database to begin"}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => router.push("/dashboard")}
              className="hidden h-10 items-center gap-2 rounded-lg border border-[#dce5df] bg-white px-4 text-xs font-semibold text-[#263c32] transition hover:bg-[#f4f8f5] sm:flex"
            >
              <Share2 className="size-4" />
              Share
            </button>
            <button
              onClick={() => setSchemaOpen(true)}
              className="flex size-10 items-center justify-center rounded-lg border border-[#dce5df] text-[#405249] xl:hidden"
              aria-label="Open database context"
            >
              <PanelRight className="size-4" />
            </button>
          </div>
        </header>

        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <ChatPanel
            isDatabaseConnected={Boolean(connection)}
            onOpenConnectionModal={() => setConnectionOpen(true)}
            onOpenSettingsModal={() => setSettingsOpen(true)}
            connectionString={connection?.connectionString}
            provider={provider}
            model={model}
            providerOptions={providerOptions}
            modelOptions={modelOptions}
            onProviderChange={handleProviderChange}
            onModelChange={setModel}
            apiKey={apiKey}
            onSaveWidget={onSaveWidget}
            externalQuestion={rerunQuestion}
            onExternalQuestionConsumed={() => setRerunQuestion(null)}
          />
        </div>
      </section>

      <WorkspaceContextPanel
        connection={connection}
        schema={schema}
        schemaAnalysis={schemaAnalysis}
        loadingSchema={loadingSchema}
        messages={messages}
        onRefreshSchema={() => {
          if (!connection) return;
          void fetchSchema(connection.connectionString);
        }}
      />

      <Sheet open={schemaOpen} onOpenChange={setSchemaOpen}>
        <div className="h-full overflow-hidden">
          <SchemaPanel
            schema={schema}
            isLoading={loadingSchema}
            connectionString={connection?.connectionString}
            provider={provider}
            model={model}
            apiKey={apiKey}
          />
        </div>
      </Sheet>

      {/* Auth disabled - Logout dialog hidden */}
      {/* <Dialog
        open={logoutConfirmOpen}
        onOpenChange={(open) => {
          if (!loggingOut) {
            setLogoutConfirmOpen(open);
          }
        }}
        panelClassName="max-w-md"
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-text-1">Log out?</h2>
            <p className="text-sm text-text-2">
              This will end your session and clear current in-browser workspace data.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setLogoutConfirmOpen(false)}
              disabled={loggingOut}
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void logout()} loading={loggingOut}>
              Log out
            </Button>
          </div>
        </div>
      </Dialog> */}

      <Dialog open={connectionOpen} onOpenChange={setConnectionOpen}>
        <div className="space-y-4">
          {connection ? (
            <div className="flex items-center justify-between rounded-md border border-[#174128]/16 bg-[#f5fbf1] px-3 py-2">
              <div className="text-xs">
                <p className="font-semibold text-[#1f5a35]">Connected: {maskedConnection}</p>
                <p className="text-[#355442]">Switch database or disconnect below.</p>
              </div>
              <Button
                variant="ghost"
                onClick={() => {
                  clearConnection();
                  clearSchema();
                  pushToast({ title: "Disconnected", description: "Database connection cleared.", variant: "success" });
                }}
                className="border border-danger/20 bg-white text-danger hover:bg-danger/10"
              >
                Disconnect
              </Button>
            </div>
          ) : null}
          <div className="inline-flex items-center rounded-md border border-border bg-surface-2 p-1" role="tablist" aria-label="Database source">
            <button
              type="button"
              role="tab"
              aria-selected={connectTab === "demo"}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                connectTab === "demo"
                  ? "bg-surface text-text-1 shadow-[0_0_0_1px_rgba(22,66,40,0.16)]"
                  : "text-text-2 hover:text-text-1"
              }`}
              onClick={() => setConnectTab("demo")}
            >
              Demo Database
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={connectTab === "custom"}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                connectTab === "custom"
                  ? "bg-surface text-text-1 shadow-[0_0_0_1px_rgba(22,66,40,0.16)]"
                  : "text-text-2 hover:text-text-1"
              }`}
              onClick={() => setConnectTab("custom")}
            >
              Custom Database
            </button>
          </div>

          {connectTab === "demo" ? (
            <div className="space-y-4">
              <p className="text-sm text-text-2">Instantly query the pre-seeded ecommerce dataset.</p>
              <Button
                loading={connecting}
                onClick={() => void connectToDatabase("demo")}
                className="bg-accent text-white"
              >
                Connect to Demo
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <Input
                label="Connection string"
                monospace
                value={connectionString}
                onChange={(event) => {
                  setConnectionString(event.target.value);
                  setCanConnectCustom(false);
                }}
                placeholder="postgresql://user:pass@host:5432/dbname"
              />
              <div className="flex gap-2">
                <Button variant="ghost" loading={testingConnection} onClick={() => void testConnection()}>Test Connection</Button>
                <Button
                  loading={connecting}
                  disabled={!canConnectCustom}
                  onClick={() => void connectToDatabase("custom", connectionString)}
                >
                  Connect
                </Button>
              </div>
            </div>
          )}
        </div>
      </Dialog>

      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <QueryHistoryPanel
          history={history}
          onRerun={handleRerun}
          onRemove={removeEntry}
          onClearAll={clearHistory}
        />
      </Sheet>

      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <div className="space-y-5">
          <div>
            <h2 className="font-syne text-2xl text-text-1">Settings</h2>
            <p className="text-sm text-text-2">Provider, model, API key and connection controls.</p>
          </div>

          <div className="space-y-3 rounded-lg border border-border p-3">
            <h3 className="text-xs uppercase tracking-[0.12em] text-text-3">LLM configuration</h3>
            <Select
              value={provider}
              onChange={handleProviderChange}
              options={providerOptions}
            />
            <Select value={model} onChange={setModel} options={modelOptions} />
            <Input
              label="API key"
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
            />
            <Button
              variant="ghost"
              loading={testingApiKey}
              disabled={testingApiKey}
              onClick={() => void testApiKey()}
            >
              Test API Key
            </Button>
            {apiKeyTestResult ? (
              <div
                className={`rounded-md border p-2 text-xs ${
                  apiKeyTestResult.type === "success"
                    ? "border-success/40 bg-success/10 text-success"
                    : "border-danger/40 bg-danger/10 text-danger"
                }`}
              >
                {apiKeyTestResult.message}
              </div>
            ) : null}
          </div>

          <div className="space-y-3 rounded-lg border border-border p-3">
            <h3 className="text-xs uppercase tracking-[0.12em] text-text-3">Database</h3>
            <p className="text-xs text-text-2">Current: {connection ? maskedConnection : "Not connected"}</p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => { setSettingsOpen(false); setConnectionOpen(true); }}>
                {connection ? "Change Database" : "Connect Database"}
              </Button>
              {connection ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    clearConnection();
                    clearSchema();
                    pushToast({ title: "Disconnected", description: "Database connection cleared.", variant: "success" });
                  }}
                  className="border border-danger/20 bg-white text-danger hover:bg-danger/10"
                >
                  Disconnect
                </Button>
              ) : null}
            </div>
          </div>

        </div>
      </Sheet>
    </main>
  );
}





