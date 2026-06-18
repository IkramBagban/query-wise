"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Loader2,
  MessageSquarePlus,
  Paperclip,
  Send,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CodeBlock } from "@/components/ui/code-block";
import { Select } from "@/components/ui/select";
import { ConversationResultCard } from "@/components/v2/ConversationResultCard";
import { PageHeader } from "@/components/v2/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/v2/ResourceState";
import { SchemaBrowser } from "@/components/v2/SchemaBrowser";
import { isBoundedResultPreview } from "@/components/v2/V2Chart";
import { useApiResource } from "@/hooks/v2";
import { formatRelativeTime } from "@/lib/utils";
import {
  connectionsApi,
  conversationsApi,
  dashboardsApi,
  getIngestionStatusView,
  type ConversationMessageDto,
  type ConnectionListItem,
  type QueryStreamEvent,
} from "@/lib/v2/api-client";
import type { ChartConfig } from "@/types/v2";
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

const STORAGE_KEYS = {
  provider: "querywise.v2.llmProvider",
  model: "querywise.v2.llmModel",
  apiKey: "querywise.v2.llmApiKey",
  connection: "querywise.v2.connectionId",
} as const;

function formatClockTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/* --------------------------- ConnectionPicker ----------------------------- */

interface ConnectionPickerProps {
  value: string | null;
  onChange: (id: string) => void;
}

function ConnectionPicker({ value, onChange }: ConnectionPickerProps) {
  const connections = useApiResource(() => connectionsApi.list(100), []);

  if (connections.loading) {
    return (
      <div className="flex h-9 min-w-40 items-center gap-1.5 rounded-md border border-border px-3 text-xs text-text-3">
        <Loader2 className="size-3.5 animate-spin" />
        <span>Loading…</span>
      </div>
    );
  }

  if (connections.error) {
    return (
      <button
        type="button"
        onClick={() => void connections.refresh()}
        className="flex h-9 min-w-40 items-center gap-1.5 rounded-md border border-danger/40 px-3 text-xs text-danger hover:bg-danger/5"
      >
        <Database className="size-3.5" />
        Could not load — retry
      </button>
    );
  }

  const items = connections.data?.items ?? [];

  const demoOption = { value: "__demo__", label: "Demo database" };
  const connectionOptions = items.map((item: ConnectionListItem) => ({
    value: item.id,
    label: item.name,
  }));
  const addOption = { value: "__add__", label: "+ Add connection" };

  const options = [demoOption, ...connectionOptions, addOption];

  function handleChange(selected: string) {
    if (selected === "__add__") {
      window.location.href = "/connections/new";
      return;
    }
    onChange(selected);
    if (selected !== "__demo__") {
      window.sessionStorage.setItem(STORAGE_KEYS.connection, selected);
    } else {
      window.sessionStorage.removeItem(STORAGE_KEYS.connection);
    }
  }

  return (
    <Select
      className="min-w-40"
      value={value ?? ""}
      onChange={handleChange}
      options={options}
      menuSide="top"
    />
  );
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
  const refreshConnections = connections.refresh;
  const selectedConnection = connections.data?.items.find((item) => item.id === connectionId) ?? null;
  const selectedIngestion = getIngestionStatusView(selectedConnection?.schemaSyncStatus);

  useEffect(() => {
    if (!connectionId && connections.data?.items[0]) setConnectionId(connections.data.items[0].id);
  }, [connectionId, connections.data]);

  useEffect(() => {
    if (!connections.data?.items.some((item) => !getIngestionStatusView(item.schemaSyncStatus).terminal)) return;
    const timer = window.setInterval(() => void refreshConnections(), 5000);
    return () => window.clearInterval(timer);
  }, [connections.data, refreshConnections]);

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
            <Select className="w-full" value={connectionId} onChange={setConnectionId} options={connections.data.items.map((item) => {
              const ingestion = getIngestionStatusView(item.schemaSyncStatus);
              return { value: item.id, label: `${item.name} · ${item.databaseName} · ${ingestion.label}` };
            })} />
            {selectedConnection ? (
              <div className="flex items-start gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-text-3">
                <Badge variant={selectedIngestion.tone}>{selectedIngestion.label}</Badge>
                <span>{selectedIngestion.description}</span>
              </div>
            ) : null}
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <Button className="w-full" loading={creating} disabled={!connectionId || !selectedIngestion.ready} onClick={() => void create()}><MessageSquarePlus className="h-4 w-4" />Create conversation</Button>
          </div>
        )}
        {error && !connections.data?.items.length ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      </Card>
    </div>
  );
}

/* -------------------------- Empty workspace ------------------------------- */

export function EmptyWorkspaceView() {
  const router = useRouter();
  const [connectionId, setConnectionId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem(STORAGE_KEYS.connection) ?? null;
  });
  const [question, setQuestion] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamStatus, setStreamStatus] = useState<string | null>(null);

  const selectedConnection = useApiResource(
    () => connectionId && connectionId !== "__demo__" ? connectionsApi.get(connectionId) : Promise.resolve(null),
    [connectionId],
  );
  const selectedIngestion = getIngestionStatusView(selectedConnection.data?.schemaSyncStatus);
  const schemaSyncWarning = connectionId && !selectedIngestion.terminal && selectedConnection.data
    ? "Schema syncing — your first query may be slower."
    : null;

  const refreshSelected = selectedConnection.refresh;
  useEffect(() => {
    if (!selectedConnection.data || selectedIngestion.terminal) return;
    const timer = window.setInterval(() => void refreshSelected(), 5000);
    return () => window.clearInterval(timer);
  }, [selectedConnection.data, selectedIngestion.terminal, refreshSelected]);

  function handleQueryEvent(event: QueryStreamEvent) {
    if (event.type === "status") {
      const data = event.data as { status?: string; label?: string };
      setStreamStatus(data.label ?? (data.status ? data.status.replaceAll("_", " ") : "Working"));
    }
    if (event.type === "sql-preview") setStreamStatus("Validating SQL");
    if (event.type === "query-stats") setStreamStatus("Preparing results");
    if (event.type === "text-delta") setStreamStatus("Writing answer");
    if (event.type === "completed") setStreamStatus("Complete");
    if (event.type === "failed") {
      const data = event.data as { error?: { message?: string } };
      setStreamStatus("Failed");
      setError(data.error?.message ?? "Unable to submit query");
    }
  }

  async function submit() {
    if (!question.trim() || !connectionId) return;
    const apiKey = window.localStorage.getItem(STORAGE_KEYS.apiKey) ?? "";
    const provider = window.localStorage.getItem(STORAGE_KEYS.provider) ?? "";
    const model = window.localStorage.getItem(STORAGE_KEYS.model) ?? "";
    if (!apiKey || !isLlmProvider(provider) || !isSupportedModel(provider, model)) {
      setError("Select a supported LLM provider and model, then add your API key in Settings.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setStreamStatus("Queued");
    try {
      let resolvedConnectionId = connectionId;
      if (connectionId === "__demo__") {
        const demo = await connectionsApi.createDemo();
        resolvedConnectionId = demo.id;
      }
      const conversation = await conversationsApi.create(resolvedConnectionId);
      await conversationsApi.submitStream(
        { conversationId: conversation.id, question: question.trim(), provider, model, apiKey },
        handleQueryEvent,
      );
      router.push(`/workspace/${conversation.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to start conversation");
      setSubmitting(false);
      setStreamStatus(null);
    }
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] min-h-[640px] flex-col items-center justify-center lg:h-screen">
      <div className="w-full max-w-3xl px-4 sm:px-6">
        <div className="mb-8 text-center">
          <span className="mx-auto inline-flex size-12 items-center justify-center rounded-2xl bg-accent-dim text-accent-2">
            <Sparkles className="size-6" />
          </span>
          <h1 className="mt-4 font-syne text-3xl font-semibold">Ask your data anything</h1>
          <p className="mt-2 text-sm text-text-3">Choose a database and type a question to get started.</p>
        </div>
        <Composer
          question={question}
          setQuestion={setQuestion}
          onSubmit={() => void submit()}
          submitting={submitting}
          error={error}
          connectionId={connectionId}
          onConnectionChange={setConnectionId}
          schemaSyncWarning={schemaSyncWarning}
        />
        {streamStatus && submitting ? (
          <p className="mt-2 text-center text-xs text-text-3">
            <Loader2 className="mr-1 inline size-3 animate-spin" />
            {streamStatus}
          </p>
        ) : null}
        <div className="mt-6 grid gap-2 sm:grid-cols-3">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => setQuestion(suggestion)}
              className="rounded-lg border border-border bg-surface p-3 text-left text-xs transition hover:border-border-2 hover:bg-surface-2"
            >
              {suggestion}
            </button>
          ))}
        </div>
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
  onCreateDashboard,
  onSave,
}: {
  message: ConversationMessageDto;
  dashboardOptions: { value: string; label: string }[];
  onCreateDashboard: (name: string) => Promise<string>;
  onSave: (message: ConversationMessageDto, config: ChartConfig, dashboardId: string) => Promise<void>;
}) {
  const hasResult = isBoundedResultPreview(message.queryRun?.resultPreview);
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground"><Sparkles className="size-4" /></span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-text-1">QueryWise</span>
          <span className="text-[10px] text-text-3">{formatClockTime(message.createdAt)}</span>
        </div>
        {message.content ? <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-text-1">{message.content}</p> : null}
        {message.metadata.errorCode ? <p className="mt-2 rounded-md border border-danger/25 bg-danger/5 px-3 py-2 text-xs text-danger">{message.metadata.errorCode}</p> : null}
        {hasResult ? (
          <ConversationResultCard
            message={message}
            dashboardOptions={dashboardOptions}
            onCreateDashboard={onCreateDashboard}
            onSave={onSave}
          />
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------- Composer -------------------------------- */

interface ComposerProps {
  question: string;
  setQuestion: (value: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
  disabledReason?: string | null;
  readinessLabel?: string;
  connectionId?: string | null;
  onConnectionChange?: (id: string) => void;
  lockedConnectionName?: string | null;
  schemaSyncWarning?: string | null;
}

function Composer({
  question,
  setQuestion,
  onSubmit,
  submitting,
  error,
  disabledReason,
  readinessLabel,
  connectionId,
  onConnectionChange,
  lockedConnectionName,
  schemaSyncWarning,
}: ComposerProps) {
  const [provider, setProvider] = useState<LlmProvider>(() => {
    if (typeof window === "undefined") return DEFAULT_LLM_PROVIDER;
    const stored = window.localStorage.getItem(STORAGE_KEYS.provider);
    return stored && isLlmProvider(stored) ? stored : DEFAULT_LLM_PROVIDER;
  });
  const [model, setModel] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_LLM_MODEL;
    return window.localStorage.getItem(STORAGE_KEYS.model) ?? DEFAULT_LLM_MODEL;
  });
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
    if (disabledReason) return;
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      onSubmit();
    }
  }

  const modelOptions = LLM_MODEL_CATALOG.filter((entry) => entry.provider === provider).map((entry) => ({ value: entry.model, label: entry.label }));
  const runDisabled = !question.trim() || Boolean(disabledReason) || (onConnectionChange !== undefined && !connectionId);

  return (
    <div className="border-t border-border bg-bg px-3 py-3 sm:px-6 sm:py-4">
      <div className="mx-auto max-w-3xl">
        <Card className="p-2 shadow-sm">
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={onKeyDown}
            disabled={Boolean(disabledReason)}
            maxLength={500}
            rows={2}
            placeholder={disabledReason ?? "Ask anything about your database..."}
            className="min-h-12 w-full resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-text-3 disabled:cursor-not-allowed"
          />
          <div className="flex flex-wrap items-center gap-2 px-1 pt-1">
            <button type="button" aria-label="Attach" title="Attach file" className="rounded-md border border-border p-2 text-text-3 hover:bg-surface-2 hover:text-text-1"><Paperclip className="size-4" /></button>
            <Select className="min-w-28" value={provider} onChange={changeProvider} options={LLM_PROVIDER_OPTIONS} menuSide="top" />
            <Select className="min-w-44" value={model} onChange={changeModel} options={modelOptions} menuSide="top" />
            {onConnectionChange !== undefined ? (
              <ConnectionPicker value={connectionId ?? null} onChange={onConnectionChange} />
            ) : lockedConnectionName ? (
              <span
                title="To use a different database, start a new chat."
                className="inline-flex cursor-default items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1 text-xs text-text-2"
              >
                <Database className="size-3.5 shrink-0 text-text-3" />
                {lockedConnectionName}
              </span>
            ) : null}

            <div className="ml-auto flex items-center gap-2">
              {readinessLabel ? <span className="hidden text-xs text-text-3 sm:inline">{readinessLabel}</span> : null}
              <Button size="sm" loading={submitting} disabled={runDisabled} onClick={onSubmit} className="h-9 px-4">
                <Send className="size-3.5" />Run
              </Button>
            </div>
          </div>
        </Card>
        {schemaSyncWarning ? (
          <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-warning">
            <AlertTriangle className="size-3.5 shrink-0" />
            {schemaSyncWarning}
          </p>
        ) : null}
        {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
        {disabledReason ? <p className="mt-2 text-center text-xs text-warning">{disabledReason}</p> : null}
        <p className="mt-2 text-center text-[11px] text-text-3">AI-generated results. Please verify accuracy before making decisions.</p>
      </div>
    </div>
  );
}

/* ------------------------------ Context panel ----------------------------- */

function ContextPanel({ connectionId, latestRun }: { connectionId: string; latestRun: ConversationMessageDto["queryRun"] | null }) {
  const connection = useApiResource(() => connectionsApi.get(connectionId), [connectionId]);
  const schema = useApiResource(() => connectionsApi.schema(connectionId), [connectionId]);
  const [tab, setTab] = useState<"schema" | "sql" | "summary">("schema");
  const ingestion = getIngestionStatusView(connection.data?.schemaSyncStatus);
  return (
    <aside className="hidden min-h-0 border-l border-border bg-surface lg:flex lg:flex-col">
      <div className="border-b border-border p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-3">Active data source</p>
        <h2 className="mt-1 truncate font-medium">{connection.data?.name ?? "Loading connection"}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant={ingestion.tone}>{ingestion.label}</Badge>
          <span className="text-xs capitalize text-text-3">{connection.data?.status ?? ""}</span>
        </div>
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
            <p className="text-xs text-text-3">Schema status: {ingestion.description}</p>
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
  const connection = useApiResource(
    () => conversation.data?.connectionId ? connectionsApi.get(conversation.data.connectionId) : Promise.resolve(null),
    [conversation.data?.connectionId],
  );
  const messages = useApiResource(() => conversationsApi.messages(conversationId, 100), [conversationId]);
  const dashboards = useApiResource(() => dashboardsApi.list(100), []);
  const [question, setQuestion] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamStatus, setStreamStatus] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const ordered = useMemo(() => messages.data?.items.slice().sort((a, b) => a.sequence - b.sequence) ?? [], [messages.data]);
  const latestRun = useMemo(() => ordered.slice().reverse().find((message) => message.queryRun)?.queryRun ?? null, [ordered]);
  const dashboardOptions = useMemo(
    () => dashboards.data?.items.filter((item) => item.access === "owner").map((item) => ({ value: item.id, label: item.name })) ?? [],
    [dashboards.data],
  );
  const ingestion = getIngestionStatusView(connection.data?.schemaSyncStatus);
  const refreshConnection = connection.refresh;
  const composerDisabledReason = conversation.data && connection.data && !ingestion.ready ? ingestion.description : null;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [ordered.length, submitting]);

  useEffect(() => {
    if (!connection.data || ingestion.terminal) return;
    const timer = window.setInterval(() => void refreshConnection(), 5000);
    return () => window.clearInterval(timer);
  }, [connection.data, refreshConnection, ingestion.terminal]);

  function handleQueryEvent(event: QueryStreamEvent) {
    if (event.type === "status") {
      const data = event.data as { status?: string; label?: string };
      setStreamStatus(data.label ?? (data.status ? data.status.replaceAll("_", " ") : "Working"));
    }
    if (event.type === "sql-preview") setStreamStatus("Validating SQL");
    if (event.type === "query-stats") setStreamStatus("Preparing results");
    if (event.type === "text-delta") setStreamStatus("Writing answer");
    if (event.type === "completed") setStreamStatus("Complete");
    if (event.type === "failed") {
      const data = event.data as { error?: { message?: string } };
      setStreamStatus("Failed");
      setError(data.error?.message ?? "Unable to submit query");
    }
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!question.trim()) return;
    if (composerDisabledReason) {
      setError(composerDisabledReason);
      return;
    }
    const apiKey = window.localStorage.getItem(STORAGE_KEYS.apiKey) ?? "";
    const provider = window.localStorage.getItem(STORAGE_KEYS.provider) ?? "";
    const model = window.localStorage.getItem(STORAGE_KEYS.model) ?? "";
    if (!apiKey || !isLlmProvider(provider) || !isSupportedModel(provider, model)) {
      setError("Select a supported LLM provider and model, then add your API key in Settings.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setStreamStatus("Queued");
    try {
      await conversationsApi.submitStream({ conversationId, question: question.trim(), provider, model, apiKey }, handleQueryEvent);
      setQuestion("");
      await messages.refresh();
      await conversation.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to submit query");
    } finally {
      setSubmitting(false);
      setStreamStatus(null);
    }
  }

  async function createDashboard(name: string) {
    const dashboard = await dashboardsApi.create(name);
    void dashboards.refresh();
    return dashboard.id;
  }

  async function saveResult(message: ConversationMessageDto, chartConfig: ChartConfig, targetDashboardId: string) {
    const run = message.queryRun;
    if (!targetDashboardId || !message.queryRunId || !isBoundedResultPreview(run?.resultPreview)) {
      throw new Error("This chart is not ready to save.");
    }
    setError(null);
    try {
      await dashboardsApi.createWidget(targetDashboardId, {
        title: chartConfig.title ?? conversation.data?.title ?? "Query result",
        queryRunId: message.queryRunId,
        queryDefinition: run.generatedQuery,
        chartConfig,
        layout: { schemaVersion: 1, x: 0, y: 0, w: 6, h: 4 },
        snapshot: run.resultPreview,
      });
    } catch (reason) {
      const errorMessage = reason instanceof Error ? reason.message : "Unable to save result";
      setError(errorMessage);
      throw reason;
    }
  }

  if (conversation.loading) return <div className="p-6"><LoadingState label="Loading conversation" /></div>;
  if (conversation.error || !conversation.data) return <div className="p-6"><ErrorState error={conversation.error ?? new Error("Conversation not found")} onRetry={() => void conversation.refresh()} /></div>;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] min-h-[640px] lg:h-screen">
      <section className="flex h-full min-w-0 flex-1 flex-col bg-bg">
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
                  <button key={suggestion} disabled={Boolean(composerDisabledReason)} onClick={() => setQuestion(suggestion)} className="rounded-lg border border-border bg-surface p-3 text-left text-xs transition hover:border-border-2 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60">{suggestion}</button>
                ))}
              </div>
              {composerDisabledReason ? (
                <div className="mt-5 inline-flex items-center gap-2 rounded-lg border border-warning/25 bg-warning/10 px-3 py-2 text-xs text-warning">
                  <AlertTriangle className="size-3.5" />
                  {composerDisabledReason}
                </div>
              ) : null}
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
                    onCreateDashboard={createDashboard}
                    onSave={saveResult}
                  />
                ),
              )}
              {submitting ? (
                <div className="flex items-center gap-3">
                  <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground"><Sparkles className="size-4" /></span>
                  <span className="inline-flex items-center gap-2 rounded-2xl rounded-tl-sm border border-border bg-surface px-4 py-2.5 text-sm text-text-3">
                    <Loader2 className="size-3.5 animate-spin" />{streamStatus ?? "Analyzing your data..."}
                  </span>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <Composer
          question={question}
          setQuestion={setQuestion}
          onSubmit={() => void submit()}
          submitting={submitting}
          error={error}
          disabledReason={composerDisabledReason}
          readinessLabel={connection.loading ? "Checking schema" : ingestion.label}
          lockedConnectionName={connection.data?.name ?? null}
        />
      </section>
      {conversation.data ? <ContextPanel connectionId={conversation.data.connectionId} latestRun={latestRun} /> : null}
    </div>
  );
}
