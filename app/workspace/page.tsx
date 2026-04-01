"use client";

import Link from "next/link";
import { Database, PanelLeft, Settings } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useAppState } from "@/components/providers/AppStateProvider";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { SchemaPanel } from "@/components/schema/SchemaPanel";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { Tooltip } from "@/components/ui/tooltip";
import { useSettings } from "@/hooks/useSettings";
import {
  LLM_PROVIDER_OPTIONS,
  SUPPORTED_MODELS_BY_PROVIDER,
  type LlmProvider,
} from "@/lib/llm-config";
import { useToast } from "@/hooks/useToast";
import type { ChatMessage, DashboardWidget } from "@/types";

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
  const { pushToast } = useToast();
  const {
    connection,
    connectionInitialized,
    saveConnection,
    clearConnection,
    maskedConnection,
    schema,
    loadingSchema,
    fetchSchema,
    clearSchema,
    addDashboardWidget,
    dashboard,
  } = useAppState();
  const { provider, setProvider, model, setModel, apiKey, setApiKey } = useSettings();

  const [connectionOpen, setConnectionOpen] = useState(false);
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [schemaWidth, setSchemaWidth] = useState(320);
  const [resizingSchema, setResizingSchema] = useState(false);

  const [connectTab, setConnectTab] = useState<"demo" | "custom">("demo");
  const [connectionString, setConnectionString] = useState("");
  const [testingConnection, setTestingConnection] = useState(false);
  const [canConnectCustom, setCanConnectCustom] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [testingApiKey, setTestingApiKey] = useState(false);
  const [apiKeyTestResult, setApiKeyTestResult] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!connectionInitialized) return;
    setConnectionOpen(!connection);
  }, [connection, connectionInitialized]);

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
  return (
    <main className="flex h-screen min-h-screen flex-col overflow-hidden bg-[radial-gradient(circle_at_6%_0%,rgba(116,204,99,0.16),transparent_24%),radial-gradient(circle_at_100%_0%,rgba(43,116,57,0.08),transparent_20%),#f4faf2] text-text-1">
      <header className="z-20 flex h-16 shrink-0 items-center justify-between border-b border-[#174128]/14 bg-white/85 px-3 shadow-[0_10px_24px_rgba(14,41,24,0.08)] backdrop-blur-md sm:px-5">
        <div className="flex items-center gap-3">
          <Tooltip content="Schema" side="bottom">
            <Button
              variant="icon"
              onClick={() => setSchemaOpen(true)}
              className="h-12 w-12 rounded-xl border-[#174128]/20 bg-white text-[#173f2a] hover:bg-[#ecf9e5] hover:text-[#173f2a] lg:hidden"
            >
              <PanelLeft className="h-5 w-5" strokeWidth={2.3} />
            </Button>
          </Tooltip>
          <span className="font-syne text-2xl font-bold tracking-tight">
            Query<span className="text-[#2ed52e]">Wise</span>
          </span>
          <nav className="ml-1 hidden items-center gap-1 rounded-full border border-[#174128]/16 bg-white p-1 md:flex">
            <Link href="/dashboard" className="rounded-full px-3 py-1.5 text-xs font-semibold text-[#2d4f39] hover:bg-[#ecf9e5]">
              Dashboard
            </Link>
            <span className="rounded-full bg-[#e7f6de] px-3 py-1.5 text-xs font-semibold text-[#174128]">Workspace</span>
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <Tooltip content="Database" side="bottom">
            <Button
              variant="icon"
              onClick={() => setConnectionOpen(true)}
              className="h-12 w-12 rounded-xl border-[#174128]/20 bg-white text-[#173f2a] hover:bg-[#ecf9e5] hover:text-[#173f2a]"
            >
              <Database className="h-5 w-5" strokeWidth={2.3} />
            </Button>
          </Tooltip>
          <Tooltip content="Settings" side="bottom">
            <Button
              variant="icon"
              onClick={() => setSettingsOpen(true)}
              className="h-12 w-12 rounded-xl border-[#174128]/20 bg-white text-[#173f2a] hover:bg-[#ecf9e5] hover:text-[#173f2a]"
            >
              <Settings className="h-5 w-5" strokeWidth={2.3} />
            </Button>
          </Tooltip>
        </div>
      </header>

      <section className="min-h-0 flex-1 overflow-hidden lg:flex">
        <div
          className="relative z-10 hidden shrink-0 bg-[#f1f9ed] lg:block"
          style={{ width: `${schemaWidth}px` }}
        >
          <SchemaPanel schema={schema} isLoading={loadingSchema} />
        </div>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize schema sidebar"
          className="group relative hidden w-3 shrink-0 cursor-col-resize lg:block"
          onMouseDown={(event) => {
            event.preventDefault();
            setResizingSchema(true);
          }}
        >
          <div
            className={`absolute inset-y-0 left-1/2 -translate-x-1/2 transition-all ${
              resizingSchema ? "w-[2px] bg-[#2d7b42]/45" : "w-px bg-[#174128]/16 group-hover:bg-[#2d7b42]/35"
            }`}
          />
        </div>
        
        <div className="relative flex h-full min-w-0 flex-1 overflow-hidden bg-transparent">
          <ChatPanel
            isDatabaseConnected={Boolean(connection)}
            onOpenConnectionModal={() => setConnectionOpen(true)}
            onOpenSettingsModal={() => setSettingsOpen(true)}
            connectionString={connection?.connectionString}
            schema={schema}
            provider={provider}
            model={model}
            providerOptions={providerOptions}
            modelOptions={modelOptions}
            onProviderChange={handleProviderChange}
            onModelChange={setModel}
            apiKey={apiKey}
            onSaveWidget={onSaveWidget}
          />
        </div>
      </section>

      <Sheet open={schemaOpen} onOpenChange={setSchemaOpen}>
        <div className="h-full overflow-hidden">
          <SchemaPanel schema={schema} isLoading={loadingSchema} />
        </div>
      </Sheet>


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

          <div className="space-y-2 rounded-lg border border-border p-3 text-xs text-text-2">
            <h3 className="text-xs uppercase tracking-[0.12em] text-text-3">About</h3>
            <p>Version: 0.1.0</p>
            <a href="https://github.com" target="_blank" className="text-accent hover:underline" rel="noreferrer">
              GitHub
            </a>
          </div>
        </div>
      </Sheet>
    </main>
  );
}
