"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Bookmark,
  CheckCircle2,
  Code2,
  Database,
  Download,
  Loader2,
  Maximize2,
  MessageSquarePlus,
  Paperclip,
  RefreshCw,
  Send,
  Settings2,
  Sparkles,
  Table2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CodeBlock } from "@/components/ui/code-block";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/v2/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/v2/ResourceState";
import { SchemaBrowser } from "@/components/v2/SchemaBrowser";
import { isBoundedResultPreview, V2Chart } from "@/components/v2/V2Chart";
import { useApiResource } from "@/hooks/v2";
import { formatNumber, formatRelativeTime } from "@/lib/utils";
import { connectionsApi, conversationsApi, dashboardsApi, type ConversationMessageDto, type QueryRunDto } from "@/lib/v2/api-client";
import type { ChartConfig, ChartType } from "@/types/v2";
import {
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_PROVIDER,
  LLM_MODEL_CATALOG,
  LLM_PROVIDER_OPTIONS,
  defaultModelForProvider,
  isLlmProvider,
  isSupportedModel,
  type LlmProvider,
} from "@/lib/llm-config";

const suggestions = [
  "What changed in the last 30 days?",
  "Show the top five categories by revenue",
  "Which customers are growing fastest?",
];

const CHART_TYPE_OPTIONS: { label: string; value: ChartType }[] = [
  { label: "Bar", value: "bar" },
  { label: "Line", value: "line" },
  { label: "Area", value: "area" },
  { label: "Pie", value: "pie" },
  { label: "Scatter", value: "scatter" },
  { label: "Table", value: "table" },
];

const STORAGE_KEYS = {
  provider: "querywise.v2.llmProvider",
  model: "querywise.v2.llmModel",
  apiKey: "querywise.v2.llmApiKey",
} as const;

function formatClockTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/* ---------------------------------- Home ---------------------------------- */

export function WorkspaceHomeView() {
  const conversations = useApiResource(() => conversationsApi.list(50), []);
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        eyebrow="Workspace"
        title="Recent conversations"
        description="Reopen a durable conversation or start a new analysis."
        actions={<Link href="/chats/new" className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium"><MessageSquarePlus className="h-4 w-4" />New chat</Link>}
      />
      {conversations.loading ? (
        <LoadingState label="Loading conversations" />
      ) : conversations.error ? (
        <ErrorState error={conversations.error} onRetry={() => void conversations.refresh()} />
      ) : !conversations.data?.items.length ? (
        <EmptyState title="No conversations yet" description="Start a chat by choosing one of your saved connections." action={<Link href="/chats/new" className="rounded-md bg-accent px-4 py-2 text-sm font-medium">Start new chat</Link>} />
      ) : (
        <div className="space-y-2">
          {conversations.data.items.map((conversation) => (
            <Link key={conversation.id} href={`/chats/${conversation.id}`} className="block">
              <Card hoverable className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <h2 className="truncate font-medium">{conversation.title}</h2>
                  <p className="text-xs text-text-3">Updated {formatRelativeTime(conversation.lastActivityAt, "just now")}</p>
                </div>
                <span className="text-xs capitalize text-text-3">{conversation.status}</span>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------- New chat -------------------------------- */

export function NewConversationView() {
  const router = useRouter();
  const connections = useApiResource(() => connectionsApi.list(100), []);
  const [connectionId, setConnectionId] = useState("");
  const [creating, setCreating] = useState(false);
  const [creatingDemo, setCreatingDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!connectionId && connections.data?.items[0]) setConnectionId(connections.data.items[0].id);
  }, [connectionId, connections.data]);

  async function create() {
    setCreating(true);
    setError(null);
    try {
      const conversation = await conversationsApi.create(connectionId);
      router.push(`/chats/${conversation.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create conversation");
    } finally {
      setCreating(false);
    }
  }

  async function connectDemo() {
    setCreatingDemo(true);
    setError(null);
    try {
      const connection = await connectionsApi.createDemo();
      const conversation = await conversationsApi.create(connection.id);
      router.push(`/chats/${conversation.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to connect to demo database");
    } finally {
      setCreatingDemo(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <PageHeader eyebrow="New chat" title="Choose a connection" description="A conversation stays bound to one database for its full lifetime. To query a different database, start a new chat." />
      <Card className="p-5">
        <div className="mb-5 rounded-lg border border-border bg-surface-2 p-4">
          <h2 className="font-medium">Try the ecommerce demo</h2>
          <p className="mt-1 text-xs text-text-3">Connect to the server-managed pre-seeded database and start querying immediately.</p>
          <Button className="mt-3" variant="ghost" loading={creatingDemo} onClick={() => void connectDemo()}><Database className="h-4 w-4" />Use demo database</Button>
        </div>
        {connections.loading ? (
          <LoadingState label="Loading connections" />
        ) : connections.error ? (
          <ErrorState error={connections.error} onRetry={() => void connections.refresh()} />
        ) : !connections.data?.items.length ? (
          <EmptyState title="No saved connections" description="Use the demo above or add your PostgreSQL database." action={<Link href="/connections/new" className="rounded-md bg-accent px-4 py-2 text-sm font-medium">Add connection</Link>} />
        ) : (
          <div className="space-y-4">
            <Select className="w-full" value={connectionId} onChange={setConnectionId} options={connections.data.items.map((item) => ({ value: item.id, label: `${item.name} · ${item.databaseName}` }))} />
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <Button className="w-full" loading={creating} disabled={!connectionId} onClick={() => void create()}><MessageSquarePlus className="h-4 w-4" />Create conversation</Button>
          </div>
        )}
        {error && !connections.data?.items.length ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      </Card>
    </div>
  );
}

/* ----------------------------- Connection bar ----------------------------- */

function ConnectionStat({ icon: Icon, label, value, tone = "default" }: { icon: typeof Database; label: string; value: string; tone?: "default" | "success" }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className={`h-4 w-4 shrink-0 ${tone === "success" ? "text-success" : "text-text-3"}`} />
      <div className="leading-tight">
        <p className="text-[13px] font-medium text-text-1">{value}</p>
        <p className="text-[11px] text-text-3">{label}</p>
      </div>
    </div>
  );
}

function ConnectionBar({ connectionId }: { connectionId: string }) {
  const connection = useApiResource(() => connectionsApi.get(connectionId), [connectionId]);
  const schema = useApiResource(() => connectionsApi.schema(connectionId), [connectionId]);
  const tableCount = schema.data?.metadata?.entities.length ?? null;
  const ready = (connection.data?.schemaSyncStatus ?? "") === "ready";

  return (
    <Card className="flex flex-wrap items-center gap-x-6 gap-y-3 p-3 sm:px-4">
      <div className="flex items-center gap-2.5">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-accent-dim text-accent-2"><Database className="size-4" /></span>
        <div className="leading-tight">
          <p className="text-[13px] font-semibold text-text-1">{connection.data?.name ?? "Loading…"}</p>
          <p className="text-[11px] text-text-3">PostgreSQL</p>
        </div>
      </div>
      <span className="hidden h-8 w-px bg-border sm:block" />
      <ConnectionStat icon={ready ? CheckCircle2 : RefreshCw} tone={ready ? "success" : "default"} label="Schema" value={ready ? "Ready" : (connection.data?.schemaSyncStatus ?? "—")} />
      <ConnectionStat icon={Table2} label="Tables" value={tableCount === null ? "—" : formatNumber(tableCount)} />
      <ConnectionStat icon={RefreshCw} label="Last synced" value={formatRelativeTime(connection.data?.lastSchemaSyncAt ?? null, "Never")} />
      <Link href={`/connections/${connectionId}`} className="ml-auto inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-xs font-medium hover:bg-surface-2">
        <Settings2 className="size-3.5" />Manage connection
      </Link>
    </Card>
  );
}

/* ------------------------------- Result card ------------------------------ */

function ResultCard({
  message,
  dashboardOptions,
  dashboardId,
  onDashboardChange,
  onSave,
  saving,
}: {
  message: ConversationMessageDto;
  dashboardOptions: { value: string; label: string }[];
  dashboardId: string;
  onDashboardChange: (value: string) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const run = message.queryRun;
  const baseConfig = (message.metadata.chartConfig ?? { schemaVersion: 1, type: "table" }) as ChartConfig;
  const [tab, setTab] = useState<"chart" | "sql">("chart");
  const [chartType, setChartType] = useState<ChartType>(baseConfig.type);

  if (!run || !isBoundedResultPreview(run.resultPreview)) return null;
  const preview = run.resultPreview;
  const rowCount = run.returnedRowCount ?? preview.returnedRowCount;
  const ms = run.executionTimeMs;

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex items-center gap-1 border-b border-border px-3 pt-2">
        <button type="button" onClick={() => setTab("chart")} className={`flex items-center gap-1.5 border-b-2 px-2 pb-2 text-xs font-medium transition ${tab === "chart" ? "border-accent text-accent-2" : "border-transparent text-text-3 hover:text-text-1"}`}>
          <BarChart3 className="size-3.5" />Chart
        </button>
        <button type="button" onClick={() => setTab("sql")} className={`flex items-center gap-1.5 border-b-2 px-2 pb-2 text-xs font-medium transition ${tab === "sql" ? "border-accent text-accent-2" : "border-transparent text-text-3 hover:text-text-1"}`}>
          <Code2 className="size-3.5" />SQL
        </button>
        <div className="ml-auto flex items-center gap-3 pb-1.5 text-[11px] text-text-3">
          <span>{formatNumber(rowCount)} row{rowCount === 1 ? "" : "s"}{ms != null ? ` · ${ms}ms` : ""}</span>
        </div>
      </div>

      <div className="p-3 sm:p-4">
        {tab === "chart" ? (
          <>
            <div className="mb-3 flex items-center justify-between gap-2">
              <Select
                className="min-w-28"
                value={chartType}
                onChange={(value) => setChartType(value as ChartType)}
                options={CHART_TYPE_OPTIONS}
              />
              <div className="flex items-center gap-1 text-text-3">
                <button type="button" aria-label="Expand" title="Expand" className="rounded-md border border-border p-1.5 hover:bg-surface-2 hover:text-text-1"><Maximize2 className="size-3.5" /></button>
                <button type="button" aria-label="Download" title="Download" className="rounded-md border border-border p-1.5 hover:bg-surface-2 hover:text-text-1"><Download className="size-3.5" /></button>
                <button type="button" aria-label="Bookmark" title="Bookmark" className="rounded-md border border-border p-1.5 hover:bg-surface-2 hover:text-text-1"><Bookmark className="size-3.5" /></button>
              </div>
            </div>
            <div className="min-w-0">
              <V2Chart preview={preview} config={{ ...baseConfig, type: chartType }} />
            </div>
          </>
        ) : run.generatedQuery ? (
          <CodeBlock sql={run.generatedQuery.text} />
        ) : (
          <p className="rounded-lg border border-dashed border-border p-4 text-xs text-text-3">No SQL was generated for this response.</p>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-end sm:px-4">
        <Select
          className="min-w-48"
          value={dashboardId}
          onChange={onDashboardChange}
          options={dashboardOptions}
          menuSide="top"
        />
        <Button size="sm" disabled={!dashboardId} loading={saving} onClick={onSave}><Bookmark className="size-3.5" />Save to dashboard</Button>
      </div>
    </div>
  );
}

/* -------------------------------- Messages -------------------------------- */

function UserMessage({ message }: { message: ConversationMessageDto }) {
  return (
    <div className="flex items-start justify-end gap-3">
      <div className="max-w-[80%] rounded-2xl rounded-tr-sm border border-border bg-surface-2 px-4 py-2.5">
        <p className="whitespace-pre-wrap text-sm text-text-1">{message.content}</p>
        <p className="mt-1 flex items-center justify-end gap-1 text-[10px] text-text-3">
          {formatClockTime(message.createdAt)}
          <CheckCircle2 className="size-3 text-success" />
        </p>
      </div>
      <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[11px] font-semibold text-text-2">You</span>
    </div>
  );
}

function AssistantMessage({
  message,
  dashboardOptions,
  dashboardId,
  onDashboardChange,
  onSave,
  saving,
}: {
  message: ConversationMessageDto;
  dashboardOptions: { value: string; label: string }[];
  dashboardId: string;
  onDashboardChange: (value: string) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const hasResult = isBoundedResultPreview(message.queryRun?.resultPreview);
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-text-1"><Sparkles className="size-4" /></span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-text-1">QueryWise</span>
          <span className="text-[10px] text-text-3">{formatClockTime(message.createdAt)}</span>
        </div>
        {message.content ? <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-text-1">{message.content}</p> : null}
        {message.metadata.errorCode ? <p className="mt-2 rounded-md border border-danger/25 bg-danger/5 px-3 py-2 text-xs text-danger">{message.metadata.errorCode}</p> : null}
        {hasResult ? (
          <ResultCard
            message={message}
            dashboardOptions={dashboardOptions}
            dashboardId={dashboardId}
            onDashboardChange={onDashboardChange}
            onSave={onSave}
            saving={saving}
          />
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------- Composer -------------------------------- */

function Composer({
  question,
  setQuestion,
  onSubmit,
  submitting,
  error,
}: {
  question: string;
  setQuestion: (value: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const [provider, setProvider] = useState<LlmProvider>(() => {
    if (typeof window === "undefined") return DEFAULT_LLM_PROVIDER;
    const stored = window.localStorage.getItem(STORAGE_KEYS.provider);
    return stored && isLlmProvider(stored) ? stored : DEFAULT_LLM_PROVIDER;
  });
  const [model, setModel] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_LLM_MODEL;
    return window.localStorage.getItem(STORAGE_KEYS.model) ?? DEFAULT_LLM_MODEL;
  });
  const [mode, setMode] = useState<"chart" | "sql">("chart");

  function changeProvider(value: string) {
    if (!isLlmProvider(value)) return;
    const nextModel = isSupportedModel(value, model) ? model : defaultModelForProvider(value);
    setProvider(value);
    setModel(nextModel);
    window.localStorage.setItem(STORAGE_KEYS.provider, value);
    window.localStorage.setItem(STORAGE_KEYS.model, nextModel);
  }

  function changeModel(value: string) {
    setModel(value);
    window.localStorage.setItem(STORAGE_KEYS.model, value);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      onSubmit();
    }
  }

  const modelOptions = LLM_MODEL_CATALOG.filter((entry) => entry.provider === provider).map((entry) => ({ value: entry.model, label: entry.label }));

  return (
    <div className="border-t border-border bg-bg px-3 py-3 sm:px-6 sm:py-4">
      <div className="mx-auto max-w-3xl">
        <Card className="p-2 shadow-sm">
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={onKeyDown}
            maxLength={500}
            rows={2}
            placeholder="Ask anything about your database..."
            className="min-h-12 w-full resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-text-3"
          />
          <div className="flex flex-wrap items-center gap-2 px-1 pt-1">
            <button type="button" aria-label="Attach" title="Attach file" className="rounded-md border border-border p-2 text-text-3 hover:bg-surface-2 hover:text-text-1"><Paperclip className="size-4" /></button>
            <Select className="min-w-28" value={provider} onChange={changeProvider} options={LLM_PROVIDER_OPTIONS} menuSide="top" />
            <Select className="min-w-44" value={model} onChange={changeModel} options={modelOptions} menuSide="top" />

            <div className="ml-auto flex items-center gap-2">
              <div className="flex items-center rounded-md border border-border p-0.5">
                <button type="button" onClick={() => setMode("chart")} className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition ${mode === "chart" ? "bg-surface-3 text-text-1" : "text-text-3 hover:text-text-1"}`}><BarChart3 className="size-3.5" />Chart</button>
                <button type="button" onClick={() => setMode("sql")} className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition ${mode === "sql" ? "bg-surface-3 text-text-1" : "text-text-3 hover:text-text-1"}`}><Code2 className="size-3.5" />SQL</button>
              </div>
              <Button size="sm" loading={submitting} disabled={!question.trim()} onClick={onSubmit} className="h-9 px-4">
                <Send className="size-3.5" />Run
              </Button>
            </div>
          </div>
        </Card>
        {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
        <p className="mt-2 text-center text-[11px] text-text-3">AI-generated results. Please verify accuracy before making decisions.</p>
      </div>
    </div>
  );
}

/* ------------------------------ Context panel ----------------------------- */

function ContextPanel({ connectionId, latestRun }: { connectionId: string; latestRun: QueryRunDto | null }) {
  const connection = useApiResource(() => connectionsApi.get(connectionId), [connectionId]);
  const schema = useApiResource(() => connectionsApi.schema(connectionId), [connectionId]);
  const [tab, setTab] = useState<"schema" | "sql" | "summary">("schema");
  return (
    <aside className="hidden min-h-0 border-l border-border bg-surface lg:flex lg:flex-col">
      <div className="border-b border-border p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-3">Active data source</p>
        <h2 className="mt-1 truncate font-medium">{connection.data?.name ?? "Loading connection"}</h2>
        <p className="text-xs capitalize text-text-3">{connection.data?.status ?? ""}</p>
      </div>
      <div className="grid grid-cols-3 border-b border-border text-xs">
        {(["schema", "sql", "summary"] as const).map((value) => (
          <button key={value} onClick={() => setTab(value)} className={`px-2 py-3 capitalize transition ${tab === value ? "border-b-2 border-accent font-medium text-accent-2" : "text-text-3 hover:text-text-1"}`}>
            {value === "sql" ? "SQL" : value}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === "schema" ? (
          schema.loading ? <LoadingState label="Loading schema" /> : schema.error ? <ErrorState error={schema.error} onRetry={() => void schema.refresh()} /> : <SchemaBrowser metadata={schema.data?.metadata ?? null} />
        ) : null}
        {tab === "sql" ? (
          latestRun?.generatedQuery ? <CodeBlock sql={latestRun.generatedQuery.text} /> : <p className="rounded-lg border border-dashed border-border p-4 text-xs text-text-3">Run a query to see its generated SQL.</p>
        ) : null}
        {tab === "summary" ? (
          <div className="space-y-3 text-sm">
            <p>{schema.data?.summary ?? "No saved database summary is available."}</p>
            <p className="text-xs text-text-3">Schema status: {connection.data?.schemaSyncStatus ?? "unknown"}</p>
            <Link href={`/connections/${connectionId}`} className="text-xs font-semibold text-accent-2 underline">Open connection settings</Link>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

/* ------------------------------ Conversation ------------------------------ */

export function ConversationView({ conversationId }: { conversationId: string }) {
  const conversation = useApiResource(() => conversationsApi.get(conversationId), [conversationId]);
  const messages = useApiResource(() => conversationsApi.messages(conversationId, 100), [conversationId]);
  const dashboards = useApiResource(() => dashboardsApi.list(100), []);
  const [question, setQuestion] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [savingRunId, setSavingRunId] = useState<string | null>(null);
  const [dashboardId, setDashboardId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [latestRun, setLatestRun] = useState<QueryRunDto | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const ordered = useMemo(() => messages.data?.items.slice().sort((a, b) => a.sequence - b.sequence) ?? [], [messages.data]);
  const dashboardOptions = useMemo(
    () => dashboards.data?.items.filter((item) => item.access === "owner").map((item) => ({ value: item.id, label: item.name })) ?? [],
    [dashboards.data],
  );

  useEffect(() => {
    if (!dashboardId && dashboardOptions[0]) setDashboardId(dashboardOptions[0].value);
  }, [dashboardId, dashboardOptions]);

  useEffect(() => {
    const runId = [...ordered].reverse().find((message) => message.queryRunId)?.queryRunId;
    if (runId) void conversationsApi.queryRun(runId).then(setLatestRun).catch(() => undefined);
  }, [ordered]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [ordered.length, submitting]);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!question.trim()) return;
    const apiKey = window.localStorage.getItem(STORAGE_KEYS.apiKey) ?? "";
    const provider = window.localStorage.getItem(STORAGE_KEYS.provider) ?? "";
    const model = window.localStorage.getItem(STORAGE_KEYS.model) ?? "";
    if (!apiKey || !isLlmProvider(provider) || !isSupportedModel(provider, model)) {
      setError("Select a supported LLM provider and model, then add your API key in Settings.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const run = await conversationsApi.submit({ conversationId, question: question.trim(), provider, model, apiKey });
      setQuestion("");
      setLatestRun(run);
      await messages.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to submit query");
    } finally {
      setSubmitting(false);
    }
  }

  async function saveResult(message: ConversationMessageDto) {
    const run = message.queryRun;
    if (!dashboardId || !message.queryRunId || !isBoundedResultPreview(run?.resultPreview)) return;
    setSavingRunId(message.queryRunId);
    setError(null);
    try {
      await dashboardsApi.createWidget(dashboardId, {
        title: message.metadata.chartConfig?.title ?? conversation.data?.title ?? "Query result",
        queryRunId: message.queryRunId,
        queryDefinition: run.generatedQuery,
        chartConfig: message.metadata.chartConfig ?? { schemaVersion: 1, type: "table" },
        layout: { schemaVersion: 1, x: 0, y: 0, w: 6, h: 4 },
        snapshot: run.resultPreview,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save result");
    } finally {
      setSavingRunId(null);
    }
  }

  if (conversation.loading) return <div className="p-6"><LoadingState label="Loading conversation" /></div>;
  if (conversation.error || !conversation.data) return <div className="p-6"><ErrorState error={conversation.error ?? new Error("Conversation not found")} onRetry={() => void conversation.refresh()} /></div>;

  return (
    <div className="grid h-[calc(100vh-3.5rem)] min-h-[640px] lg:h-screen lg:grid-cols-[minmax(0,1fr)_350px]">
      <section className="flex min-h-0 flex-col bg-bg">
        <div className="border-b border-border px-4 py-3 sm:px-6">
          <h1 className="font-syne text-2xl font-semibold tracking-tight">Ask your data</h1>
          <p className="text-xs text-text-3">Turn questions into charts, SQL, and insights.</p>
          <div className="mt-3"><ConnectionBar connectionId={conversation.data.connectionId} /></div>
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          {messages.loading ? (
            <LoadingState label="Loading messages" />
          ) : messages.error ? (
            <ErrorState error={messages.error} onRetry={() => void messages.refresh()} />
          ) : !ordered.length ? (
            <div className="mx-auto max-w-2xl pt-10 text-center">
              <span className="mx-auto inline-flex size-12 items-center justify-center rounded-2xl bg-accent-dim text-accent-2"><Sparkles className="size-6" /></span>
              <h2 className="mt-4 font-syne text-2xl font-semibold">Ask a question about your data</h2>
              <p className="mt-1 text-sm text-text-3">Try one of these to get started.</p>
              <div className="mt-5 grid gap-2 sm:grid-cols-3">
                {suggestions.map((suggestion) => (
                  <button key={suggestion} onClick={() => setQuestion(suggestion)} className="rounded-lg border border-border bg-surface p-3 text-left text-xs transition hover:border-border-2 hover:bg-surface-2">{suggestion}</button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-6">
              {ordered.map((message) =>
                message.role === "user" ? (
                  <UserMessage key={message.id} message={message} />
                ) : (
                  <AssistantMessage
                    key={message.id}
                    message={message}
                    dashboardOptions={dashboardOptions}
                    dashboardId={dashboardId}
                    onDashboardChange={setDashboardId}
                    onSave={() => void saveResult(message)}
                    saving={savingRunId === message.queryRunId}
                  />
                ),
              )}
              {submitting ? (
                <div className="flex items-center gap-3">
                  <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-text-1"><Sparkles className="size-4" /></span>
                  <span className="inline-flex items-center gap-2 rounded-2xl rounded-tl-sm border border-border bg-surface px-4 py-2.5 text-sm text-text-3">
                    <Loader2 className="size-3.5 animate-spin" />Analyzing your data…
                  </span>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <Composer question={question} setQuestion={setQuestion} onSubmit={() => void submit()} submitting={submitting} error={error} />
      </section>
      <ContextPanel connectionId={conversation.data.connectionId} latestRun={latestRun} />
    </div>
  );
}
