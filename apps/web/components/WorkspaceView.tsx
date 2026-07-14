"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Database,
  MessageSquarePlus,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RefreshCw,
  Search,
  Share2,
  Star,
  Table2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand/BrandMark";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CodeBlock } from "@/components/ui/code-block";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip } from "@/components/ui/tooltip";
import { ConversationResultCard } from "@/components/ConversationResultCard";
import { ResultBlockCard } from "@/components/ResultBlockCard";
import {
  AgentTimeline,
  BouncingDots,
  activitiesToSteps,
  parseAgentTranscript,
  type TimelineStep,
} from "@/components/AgentActivity";
import { ComposerBox } from "@/components/ChatComposer";
import { Markdown } from "@/components/ui/markdown";
import {
  ConnectionRowsSkeleton,
  MessageListSkeleton,
  SchemaBrowserSkeleton,
} from "@/components/LoadingSkeletons";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, ErrorState } from "@/components/ResourceState";
import { SchemaBrowser } from "@/components/SchemaBrowser";
import { isBoundedResultPreview } from "@/components/V2Chart";
import { useApiResource } from "@/hooks";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useAppState } from "@/store/app-state/provider";
import { formatRelativeTime } from "@/lib/utils";
import {
  connectionsApi,
  conversationsApi,
  dashboardsApi,
  getIngestionStatusView,
  type ConversationMessageDto,
  type ConnectionListItem,
  type QueryStreamEvent,
} from "@/lib/api-client";
import type { BoundedResultPreview, ChartConfig, ProviderQuery, QueryResultBlock, ViewTransform } from "@query-wise/shared/types";

const suggestions = [
  "What changed in the last 30 days?",
  "Show the top five categories by revenue",
  "Which customers are growing fastest?",
];

const STORAGE_KEYS = {
  connection: "querywise.v2.connectionId",
  pendingQuestion: "querywise.v2.pendingQuestion",
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
  disabled?: boolean;
}

function ConnectionPicker({ value, onChange, disabled }: ConnectionPickerProps) {
  const router = useRouter();
  const connections = useApiResource((signal) => connectionsApi.list(100, undefined, signal));

  if (connections.loading) {
    return (
      <div className="flex h-9 min-w-40 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-xs text-faint">
        <Database className="size-3.5 shrink-0 text-faint" />
        <Spinner size="sm" />
        <span>Loading…</span>
      </div>
    );
  }

  if (connections.error) {
    return (
      <button
        type="button"
        onClick={() => void connections.refresh()}
        className="flex h-9 min-w-40 items-center gap-1.5 rounded-md border border-danger/40 bg-surface px-3 text-xs text-danger hover:bg-danger/5"
      >
        <Database className="size-3.5 shrink-0" />
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
  const separatorOption = { value: "__sep__", label: "", separator: true };
  const addOption = { value: "__add__", label: "+ Add connection" };

  const options = [
    { value: "", label: "Select database" },
    demoOption,
    ...connectionOptions,
    separatorOption,
    addOption,
  ];

  function handleChange(selected: string) {
    if (selected === "__add__") {
      router.push("/connections/new");
      return;
    }
    if (selected === "") return;
    onChange(selected);
    if (selected !== "__demo__") {
      window.sessionStorage.setItem(STORAGE_KEYS.connection, selected);
    } else {
      window.sessionStorage.removeItem(STORAGE_KEYS.connection);
    }
  }

  return (
    <Select
      className="min-w-44"
      value={value ?? ""}
      onChange={handleChange}
      options={options}
      menuSide="top"
      disabled={disabled}
      icon={<Database size={12} />}
    />
  );
}

/* ------------------------- Empty chat data source ------------------------- */

function setStoredConnectionId(connectionId: string) {
  window.sessionStorage.setItem(STORAGE_KEYS.connection, connectionId);
}

const SOURCE_TONE_DOT: Record<string, string> = { success: "bg-accent", warning: "bg-warning", danger: "bg-danger" };
const SOURCE_TONE_TEXT: Record<string, string> = { success: "text-accent-strong", warning: "text-warning", danger: "text-danger" };

function SourceRow({
  name,
  detail,
  statusTone,
  statusLabel,
  selected,
  pulse,
  onClick,
}: {
  name: string;
  detail: string;
  statusTone: "success" | "warning" | "danger";
  statusLabel: string;
  selected: boolean;
  pulse?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors duration-150 ${
        selected ? "bg-accent-soft" : "hover:bg-surface-2"
      }`}
    >
      <span
        className={`flex size-7 shrink-0 items-center justify-center rounded-lg border transition-colors ${
          selected ? "border-accent bg-accent text-accent-ink" : "border-border bg-surface-2 text-faint"
        }`}
      >
        <Database className="size-3.5" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-text">{name}</span>
        <span className="block truncate font-mono text-[10px] text-faint">{detail}</span>
      </span>
      <span className={`inline-flex shrink-0 items-center gap-1.5 font-mono text-[10px] ${SOURCE_TONE_TEXT[statusTone]}`}>
        <span
          className={`size-1.5 rounded-full ${SOURCE_TONE_DOT[statusTone]}`}
          style={pulse ? { animation: "qw-pulse 1.4s ease-in-out infinite" } : undefined}
        />
        {statusLabel}
      </span>
      <span className="w-3.5 shrink-0">
        {selected ? <Check className="size-3.5 text-accent-strong" strokeWidth={2.5} /> : null}
      </span>
    </button>
  );
}

function DataSourceStatusPicker({
  value,
  onChange,
  connections,
  selectedConnection,
  schemaLoading,
  tableCount,
  disabled,
  onRetry,
}: {
  value: string | null;
  onChange: (id: string) => void;
  connections: ConnectionListItem[];
  selectedConnection: ConnectionListItem | null;
  schemaLoading: boolean;
  tableCount: number | null;
  disabled?: boolean;
  onRetry: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedIngestion = getIngestionStatusView(selectedConnection?.schemaSyncStatus);
  const readyLabel = selectedConnection ? selectedIngestion.label : "Choose source";
  const sourceName = selectedConnection?.name ?? "Select database";

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  function choose(nextValue: string) {
    setOpen(false);
    setQuery("");
    onChange(nextValue);
    setStoredConnectionId(nextValue);
  }

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? connections.filter((connection) =>
        `${connection.name} ${connection.databaseName}`.toLowerCase().includes(normalizedQuery),
      )
    : connections;

  return (
    <div ref={rootRef} className="relative mx-auto flex w-full justify-center">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((current) => !current)}
        className="flex max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-lg border border-border bg-surface/80 px-4 py-2 text-xs text-muted shadow-[0_10px_40px_rgba(0,0,0,0.18)] backdrop-blur transition hover:border-border-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="inline-flex max-w-[170px] items-center gap-1.5 truncate">
          <Database className="size-3.5 shrink-0 text-faint" />
          <span className="truncate font-medium text-text">{sourceName}</span>
          <ChevronDown className={`size-3.5 shrink-0 text-faint transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
        <span className="hidden h-3 w-px bg-border sm:block" />
        <span className="inline-flex items-center gap-1.5">
          <Database className="size-3.5 text-accent-strong" />
          PostgreSQL
        </span>
        <span className="hidden h-3 w-px bg-border sm:block" />
        <span className="inline-flex items-center gap-1.5">
          <span className={`size-2 rounded-full ${selectedIngestion.ready ? "bg-success" : selectedIngestion.tone === "danger" ? "bg-danger" : "bg-warning"}`} />
          {readyLabel}
        </span>
        {typeof tableCount === "number" ? (
          <>
            <span className="hidden h-3 w-px bg-border sm:block" />
            <span className="inline-flex items-center gap-1.5">
              {schemaLoading ? <Spinner size="sm" className="text-faint" /> : <Table2 className="size-3.5 text-faint" />}
              {tableCount} tables
            </span>
          </>
        ) : null}
      </button>

      {open ? (
        <div
          className="absolute left-1/2 top-full z-50 mt-2 w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-surface text-left shadow-2xl"
          style={{ animation: "qw-pop 0.18s cubic-bezier(0.2,0.7,0.3,1) both" }}
        >
          {/* header */}
          <div className="flex items-center justify-between border-b border-border bg-surface-2/60 px-3.5 py-2.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
              Data sources · {connections.length}
            </span>
            <button
              type="button"
              title="Refresh statuses"
              aria-label="Refresh data sources"
              onClick={onRetry}
              className="flex size-6 items-center justify-center rounded-md text-faint transition-colors hover:bg-surface-2 hover:text-text"
            >
              <RefreshCw className="size-3" />
            </button>
          </div>

          {/* search */}
          {connections.length > 5 ? (
            <div className="border-b border-border p-2">
              <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 transition-colors focus-within:border-accent-line">
                <Search className="size-3.5 shrink-0 text-faint" />
                <input
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search sources…"
                  className="w-full bg-transparent text-xs text-text outline-none placeholder:text-faint"
                />
              </div>
            </div>
          ) : null}

          {/* list */}
          <div className="max-h-[19rem] overflow-y-auto p-1.5">
            {filtered.map((connection) => {
              const ingestion = getIngestionStatusView(connection.schemaSyncStatus);
              const tone = ingestion.ready ? "success" : ingestion.tone === "danger" ? "danger" : "warning";
              return (
                <SourceRow
                  key={connection.id}
                  name={connection.name}
                  detail={connection.databaseName}
                  statusTone={tone}
                  statusLabel={ingestion.label.toLowerCase()}
                  pulse={!ingestion.terminal}
                  selected={connection.id === value}
                  onClick={() => choose(connection.id)}
                />
              );
            })}
            {!filtered.length ? (
              <p className="px-3 py-4 text-center font-mono text-[11px] text-faint">No sources match “{query.trim()}”</p>
            ) : null}
            {!connections.length && !normalizedQuery ? (
              <p className="px-3 py-2 text-center font-mono text-[11px] text-faint">No saved connections yet.</p>
            ) : null}
          </div>

          {/* footer */}
          <div className="border-t border-border p-1.5">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                router.push("/connections/new");
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-accent-strong transition-colors hover:bg-accent-soft"
            >
              <span className="flex size-7 items-center justify-center rounded-lg border border-dashed border-accent-line">
                <Plus className="size-3.5" />
              </span>
              Add source
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ---------------------------------- Home ---------------------------------- */

export function WorkspaceHomeView() {
  const conversations = useApiResource((signal) => conversationsApi.list(50, undefined, signal));
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        eyebrow="Workspace"
        title="Recent conversations"
        description="Reopen a durable conversation or start a new analysis."
        actions={<Link href="/workspace/new" className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium"><MessageSquarePlus className="h-4 w-4" />New chat</Link>}
      />
      {conversations.loading && !conversations.data ? (
        <ConnectionRowsSkeleton rows={5} />
      ) : conversations.error ? (
        <p className="py-6 text-center text-sm text-faint">
          Couldn't load conversations.{" "}
          <button type="button" onClick={() => void conversations.refresh()} className="underline underline-offset-2 hover:text-text">
            Retry
          </button>
        </p>
      ) : !conversations.data?.items.length ? (
        <EmptyState title="No conversations yet" description="Start a chat by choosing one of your saved connections." action={<Link href="/workspace/new" className="rounded-md bg-accent px-4 py-2 text-sm font-medium">Start new chat</Link>} />
      ) : (
        <div className="space-y-2">
          {conversations.data.items.map((conversation) => (
            <Link key={conversation.id} href={`/chats/${conversation.id}`} className="block">
              <Card hoverable className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <h2 className="flex items-center gap-2 truncate font-medium">
                    <span className="truncate">{conversation.title}</span>
                    {conversation.connectionDeleted ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-warning">
                        <AlertTriangle className="size-2.5" strokeWidth={2} />
                        Read-only
                      </span>
                    ) : null}
                  </h2>
                  <p className="text-xs text-faint">Updated {formatRelativeTime(conversation.lastActivityAt, "just now")}</p>
                </div>
                <span className="text-xs capitalize text-faint">{conversation.status}</span>
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
  const connections = useApiResource((signal) => connectionsApi.list(100, undefined, signal));
  const [connectionId, setConnectionId] = useState("");
  const [creating, setCreating] = useState(false);
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

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <PageHeader eyebrow="New chat" title="Choose a connection" description="A conversation stays bound to one database for its full lifetime. To query a different database, start a new chat." />
      <Card className="p-5">
        {connections.loading && !connections.data ? (
          <ConnectionRowsSkeleton rows={3} />
        ) : connections.error ? (
          <ErrorState error={connections.error} onRetry={() => void connections.refresh()} />
        ) : !connections.data?.items.length ? (
          <EmptyState title="No saved connections" description="Add your PostgreSQL database to get started." action={<Link href="/connections/new" className="rounded-md bg-accent px-4 py-2 text-sm font-medium">Add connection</Link>} />
        ) : (
          <div className="space-y-4">
            <Select className="w-full" value={connectionId} onChange={setConnectionId} options={connections.data.items.map((item) => {
              const ingestion = getIngestionStatusView(item.schemaSyncStatus);
              return { value: item.id, label: `${item.name} · ${item.databaseName} · ${ingestion.label}` };
            })} />
            {selectedConnection ? (
              <div className="flex items-start gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-faint">
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

/* ---------------------- Shared query event handler ------------------------ */

export interface StreamBlock {
  index: number;
  purpose?: string;
  sql?: string;
  validation?: "valid" | "blocked";
  rowCount?: number;
  executionTimeMs?: number;
  truncated?: boolean;
  /** Full renderable rows, streamed by the agent the moment the query succeeds. */
  preview?: BoundedResultPreview;
  /** Default config streamed with the data; refined when the agent calls set_chart. */
  chartConfig?: ChartConfig;
}

export interface StreamState {
  status: string | null;
  textDelta: string;
  activities: Array<{ kind: string; label: string; tool?: string; blockIndex?: number | null; content?: string; input?: unknown; callId?: string }>;
  blocks: StreamBlock[];
}

function upsertBlock(blocks: StreamBlock[], index: number, patch: Partial<StreamBlock>): StreamBlock[] {
  const next = [...blocks];
  const existing = next.findIndex((block) => block.index === index);
  if (existing >= 0) next[existing] = { ...next[existing], ...patch };
  else next.push({ index, ...patch });
  return next;
}

function makeQueryEventHandler(
  setStreamState: React.Dispatch<React.SetStateAction<StreamState | null>>,
  setError: (error: string | null) => void,
) {
  return function handleQueryEvent(event: QueryStreamEvent) {
    setStreamState((current) => {
      const state = current || { status: null, textDelta: "", activities: [], blocks: [] };
      if (event.type === "status") {
        const data = event.data as { status?: string; label?: string };
        return { ...state, status: data.label ?? (data.status ? data.status.replaceAll("_", " ") : "Working") };
      }
      if (event.type === "activity") {
        const data = event.data as any;
        if (data.kind === "thinking-delta") {
           const activities = [...state.activities];
           const last = activities[activities.length - 1];
           if (last && last.kind === "thinking") {
             activities[activities.length - 1] = {
               ...last,
               content: (last.content || "") + data.chunk,
             };
           }
           return { ...state, status: "Thinking", activities };
        }
        if (data.kind === "narration-delta") {
           // A positioned answer-text segment streams like thinking-delta: grow the
           // trailing narration activity in place (SPEC-11 §C.3). The paired
           // `text-delta` event drives `textDelta` (the "text has started" signal
           // for showWritingHint), so this branch only touches the activity content.
           const activities = [...state.activities];
           const last = activities[activities.length - 1];
           if (last && last.kind === "narration") {
             activities[activities.length - 1] = {
               ...last,
               content: (last.content || "") + data.chunk,
             };
           }
           return { ...state, status: "Writing answer", activities };
        }
        if (data.kind === "tool-result" || data.kind === "retry") {
           const activities = [...state.activities];
           // Match by callId when present so parallel calls of the same tool
           // resolve the right row; otherwise take the oldest unresolved call.
           const callIndex = data.callId
             ? activities.findIndex(a => a.kind === "tool-call" && a.callId === data.callId)
             : activities.findIndex(a => a.kind === "tool-call" && a.tool === data.tool);
           if (callIndex >= 0) {
              activities[callIndex] = {
                 ...activities[callIndex],
                 kind: data.kind,
                 label: data.label,
                 blockIndex: data.blockIndex
              };
              return { ...state, status: "Working", activities };
           }
        }
        return { ...state, status: "Working", activities: [...state.activities, data] };
      }
      if (event.type === "sql-preview") {
        const data = event.data as any;
        // Blocked attempts carry no blockIndex — they surface in the timeline
        // as a failed step and must never overwrite a real result block.
        if (data.blockIndex == null || data.validation === "blocked") return state;
        return {
          ...state,
          status: "Preparing results",
          blocks: upsertBlock(state.blocks, data.blockIndex, { sql: data.text, purpose: data.purpose, validation: data.validation }),
        };
      }
      if (event.type === "query-stats") {
        const data = event.data as any;
        if (data.blockIndex == null) return state;
        return {
          ...state,
          status: "Preparing results",
          blocks: upsertBlock(state.blocks, data.blockIndex, {
            rowCount: data.rowCount,
            executionTimeMs: data.executionTimeMs,
            truncated: data.truncated,
          }),
        };
      }
      if (event.type === "block-data") {
        const data = event.data as {
          blockIndex?: number | null;
          purpose?: string;
          sql?: string;
          preview?: BoundedResultPreview;
          rowCount?: number;
          executionTimeMs?: number;
          truncated?: boolean;
          chartConfig?: ChartConfig;
        };
        if (data.blockIndex == null) return state;
        return {
          ...state,
          status: "Rendering results",
          blocks: upsertBlock(state.blocks, data.blockIndex, {
            purpose: data.purpose,
            sql: data.sql,
            preview: data.preview,
            rowCount: data.rowCount,
            executionTimeMs: data.executionTimeMs,
            truncated: data.truncated,
            chartConfig: data.chartConfig,
            validation: "valid",
          }),
        };
      }
      if (event.type === "chart-config") {
        const data = event.data as { blockIndex?: number | null; chartConfig?: ChartConfig };
        if (data.blockIndex == null) return state;
        return {
          ...state,
          blocks: upsertBlock(state.blocks, data.blockIndex, { chartConfig: data.chartConfig }),
        };
      }
      if (event.type === "text-delta") {
        const data = event.data as { chunk: string };
        return { ...state, status: "Writing answer", textDelta: state.textDelta + data.chunk };
      }
      if (event.type === "completed") {
        return { ...state, status: "Complete" };
      }
      if (event.type === "failed") {
        const data = event.data as { error?: { message?: string } };
        setError(data.error?.message ?? "Unable to submit query");
        return { ...state, status: "Failed" };
      }
      return state;
    });
  };
}

/* --------------------------- Empty chat composer -------------------------- */

const HERO_SUGGESTIONS = [
  "Top 10 products by revenue this month",
  "How is weekly revenue trending?",
  "Which customers ordered the most?",
  "Compare sales by category",
];

function HeroComposer({
  question,
  setQuestion,
  onSubmit,
  submitting,
  error,
  disabled,
}: {
  question: string;
  setQuestion: (value: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
  disabled?: boolean;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <ComposerBox
        question={question}
        setQuestion={setQuestion}
        onSubmit={onSubmit}
        submitting={submitting}
        disabled={disabled}
        size="hero"
        autoFocus
        placeholder="Ask anything about your data — e.g. top products by revenue this month"
      />
      <div
        className="mt-5 flex flex-wrap items-center justify-center gap-x-1 gap-y-1.5"
        style={{ animation: "qw-rise 0.5s cubic-bezier(0.16,1,0.3,1) 0.2s both" }}
      >
        {HERO_SUGGESTIONS.map((suggestion, i) => (
          <span key={suggestion} className="flex items-center gap-x-1">
            {i > 0 ? <span aria-hidden className="px-1 text-faint/40">·</span> : null}
            <button
              type="button"
              disabled={disabled || submitting}
              onClick={() => setQuestion(suggestion)}
              className="rounded-md px-1.5 py-1 font-mono text-[11.5px] text-faint transition-colors duration-150 hover:bg-accent-soft hover:text-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
            >
              {suggestion}
            </button>
          </span>
        ))}
      </div>
      {error ? <p className="mt-3 text-center text-xs text-danger">{error}</p> : null}
      <p className="mt-5 text-center font-mono text-[10px] text-faint/70">AI-generated results · verify before making decisions</p>
    </div>
  );
}

/* -------------------------- Empty workspace ------------------------------- */

export function EmptyWorkspaceView() {
  const router = useRouter();
  const { bumpChatVersion } = useAppState();
  const connections = useApiResource((signal) => connectionsApi.list(100, undefined, signal));
  const [connectionId, setConnectionId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem(STORAGE_KEYS.connection) ?? null;
  });
  const [question, setQuestion] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamState, setStreamState] = useState<StreamState | null>(null);

  const connectionItems = useMemo(() => connections.data?.items ?? [], [connections.data]);
  const selectedConnection = useMemo(
    () => connectionItems.find((item) => item.id === connectionId) ?? null,
    [connectionId, connectionItems],
  );
  const selectedSchema = useApiResource(
    (signal) => connectionId ? connectionsApi.schema(connectionId, signal) : Promise.resolve(null),
    connectionId,
  );
  const selectedIngestion = getIngestionStatusView(selectedConnection?.schemaSyncStatus);
  const schemaSyncWarning = connectionId && !selectedIngestion.terminal && selectedConnection
    ? "Schema syncing — your first query may be slower."
    : null;
  const tableCount = selectedSchema.data?.metadata?.entities.length ?? null;

  useEffect(() => {
    if (!connections.data) return;
    const stored = typeof window === "undefined" ? null : window.sessionStorage.getItem(STORAGE_KEYS.connection);
    const storedIsValid = stored ? connectionItems.some((item) => item.id === stored) : false;
    if (connectionId && connectionItems.some((item) => item.id === connectionId)) return;
    const nextConnectionId = storedIsValid && stored ? stored : connectionItems[0]?.id ?? null;
    if (nextConnectionId) {
      setConnectionId(nextConnectionId);
      setStoredConnectionId(nextConnectionId);
    }
  }, [connectionId, connectionItems, connections.data]);

  const refreshConnections = connections.refresh;
  useEffect(() => {
    if (!connectionItems.some((item) => !getIngestionStatusView(item.schemaSyncStatus).terminal)) return;
    const timer = window.setInterval(() => void refreshConnections(), 5000);
    return () => window.clearInterval(timer);
  }, [connectionItems, refreshConnections]);

  const handleQueryEvent = makeQueryEventHandler(setStreamState, setError);

  function selectConnection(nextConnectionId: string) {
    setConnectionId(nextConnectionId);
    setError(null);
  }

  async function submit() {
    if (!question.trim() || !connectionId) return;
    const trimmed = question.trim();
    setQuestion("");
    setSubmitting(true);
    setError(null);
    if (!connectionId) {
      setError("Please connect a data source first to start chatting.");
      setSubmitting(false);
      return;
    }
    
    setStreamState({ status: "Starting conversation...", textDelta: "", activities: [], blocks: [] });
    try {
      const conversation = await conversationsApi.create(connectionId);
      window.sessionStorage.setItem(STORAGE_KEYS.pendingQuestion, trimmed);
      bumpChatVersion();
      router.push(`/chats/${conversation.id}`);
    } catch (reason) {
      setQuestion(trimmed);
      setError(reason instanceof Error ? reason.message : "Unable to start conversation");
      setSubmitting(false);
      setStreamState(null);
    }
  }

  const disableComposer = connections.loading;

  return (
    <div className="relative flex h-[calc(100vh-3.5rem)] min-h-[640px] flex-col items-center justify-center overflow-hidden bg-bg px-4 py-10 lg:h-screen">
      {/* blueprint grid, masked toward the composer */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(ellipse 75% 60% at 50% 42%, black 12%, transparent 72%)",
          WebkitMaskImage: "radial-gradient(ellipse 75% 60% at 50% 42%, black 12%, transparent 72%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[6%] h-[320px] w-[640px] -translate-x-1/2 blur-[48px]"
        style={{ background: "radial-gradient(closest-side, var(--accent-soft), transparent)", animation: "qw-float 9s ease-in-out infinite" }}
      />
      <div className="relative z-10 w-full">
        <div className="mx-auto mb-6 flex max-w-3xl flex-col items-center text-center">
          <div className="relative" style={{ animation: "qw-rise 0.5s cubic-bezier(0.16,1,0.3,1) both" }}>
            <BrandMark className="size-14 rounded-2xl" />
            <span aria-hidden className="absolute -inset-2 -z-10 rounded-3xl bg-accent-soft blur-xl" />
          </div>
          <h1 className="mt-5 font-syne text-4xl font-semibold tracking-tight text-text sm:text-5xl" style={{ animation: "qw-rise 0.5s cubic-bezier(0.16,1,0.3,1) 0.06s both" }}>
            Ask your <span className="text-gradient">data</span>
          </h1>
          <p className="mt-2.5 text-base text-muted" style={{ animation: "qw-rise 0.5s cubic-bezier(0.16,1,0.3,1) 0.12s both" }}>
            Get SQL, charts, and instant answers just by typing what you need.
          </p>
        </div>

        <div className="mb-4 min-h-10">
          {connections.loading && !connections.data ? (
            <div role="status" aria-label="Loading data sources" className="mx-auto w-fit rounded-lg border border-border bg-surface/80 px-4 py-2">
              <Skeleton className="h-5 w-72 max-w-[70vw]" />
            </div>
          ) : connections.error ? (
            <button
              type="button"
              onClick={() => void connections.refresh()}
              className="mx-auto flex w-fit items-center gap-2 rounded-lg border border-danger/35 bg-danger/10 px-4 py-2 text-xs text-danger transition hover:bg-danger/15"
            >
              <AlertTriangle className="size-3.5" />
              Could not load data sources — retry
            </button>
          ) : (
            <DataSourceStatusPicker
              value={connectionId}
              onChange={selectConnection}
              connections={connectionItems}
              selectedConnection={selectedConnection}
              schemaLoading={selectedSchema.loading}
              tableCount={tableCount}
              disabled={submitting}
              onRetry={() => void connections.refresh()}
            />
          )}
        </div>

        <HeroComposer
          question={question}
          setQuestion={setQuestion}
          onSubmit={() => void submit()}
          submitting={submitting}
          error={error}
          disabled={disableComposer}
        />
        {streamState && submitting ? (
          <p className="mt-2 text-center text-xs text-faint">
            <Spinner size="sm" className="mr-1" />
            {streamState.status ?? "Analyzing your data..."}
          </p>
        ) : null}
        {schemaSyncWarning ? (
          <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-warning">
            <AlertTriangle className="size-3.5 shrink-0" />
            {schemaSyncWarning}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------- Messages -------------------------------- */

/** First letter of the signed-in user's name for the message avatar. */
function useUserInitial(): string {
  const { user } = useUser();
  const source =
    user?.firstName ?? user?.fullName ?? user?.username ?? user?.primaryEmailAddress?.emailAddress ?? "";
  return source.trim().charAt(0).toUpperCase() || "?";
}

function UserAvatar({ initial }: { initial: string }) {
  return (
    <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-success text-[12px] font-semibold text-accent-foreground shadow-sm">
      {initial}
    </span>
  );
}

function UserMessage({ message, initial }: { message: ConversationMessageDto; initial: string }) {
  return (
    <div className="flex items-start justify-end gap-3">
      <div className="max-w-[78%] rounded-2xl rounded-tr-md border border-success/20 bg-success/10 px-4 py-3 shadow-sm">
        <p className="whitespace-pre-wrap text-sm text-text">{message.content}</p>
        <p className="mt-1.5 text-right text-[10px] text-faint">{formatClockTime(message.createdAt)}</p>
      </div>
      <UserAvatar initial={initial} />
    </div>
  );
}

/**
 * The in-flight assistant message. Result cards are rendered inline within the
 * timeline via `renderBlock`, creating a true chronological feed:
 * thinking → query → chart → thinking → query → chart → answer.
 */
function PendingAssistantMessage({ state }: { state: StreamState }) {
  const hasNoTextYet = !state.textDelta;
  const steps = activitiesToSteps(state.activities, { streaming: hasNoTextYet });

  // Which block indices the timeline will render inline. Derived from the
  // steps themselves — NOT from a side effect inside renderBlock, because
  // renderBlock only runs when React renders the timeline, which is after
  // this component body has already computed the orphan list (that ordering
  // bug made every block an "orphan" and drew every card twice).
  const inlineBlockIndices = new Set(
    steps
      .filter(
        (step): step is Extract<TimelineStep, { kind: "tool" }> =>
          step.kind === "tool" && step.tool === "run_sql" && step.status === "ok" && step.blockIndex != null,
      )
      .map((step) => step.blockIndex as number),
  );

  const renderBlock = (blockIndex: number): React.ReactNode => {
    const block = state.blocks.find((b) => b.index === blockIndex && b.validation !== "blocked");
    if (!block) return null;
    return (
      <ResultBlockCard
        title={block.chartConfig?.title ?? block.purpose}
        preview={block.preview ?? null}
        sql={block.sql}
        rowCount={block.rowCount}
        executionTimeMs={block.executionTimeMs}
        chartConfig={block.chartConfig ?? null}
        running={!block.preview}
      />
    );
  };

  const timeline = <AgentTimeline steps={steps} renderBlock={renderBlock} />;

  // Safety net only: blocks with no matching resolved tool step in the timeline.
  const orphanBlocks = state.blocks.filter(
    (block) => block.validation !== "blocked" && !inlineBlockIndices.has(block.index),
  );

  // Queries still executing (tool-call not yet resolved) render as skeleton
  // cards. Since they haven't resolved, they won't have a block yet.
  const runningQueries = state.activities.filter(
    (activity) => activity.kind === "tool-call" && activity.tool === "run_sql",
  );

  // After the data is in but before the written answer streams, show an explicit
  // "writing" cue so the message never looks finished-but-empty. Suppressed while
  // the model is visibly still thinking (that row already has its own indicator).
  const lastStep = steps[steps.length - 1];
  const isThinkingLive = lastStep?.kind === "thinking" && lastStep.live;
  const showWritingHint =
    !state.textDelta &&
    state.blocks.length > 0 &&
    runningQueries.length === 0 &&
    orphanBlocks.length === 0 &&
    !isThinkingLive;

  return (
    <div className="flex items-start gap-3">
      <BrandMark className="mt-0.5 size-9 rounded-full" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2.5">
          <span className="text-sm font-semibold text-text">QueryWise</span>
          {state.status && state.status !== "Complete" ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-faint">
              {state.status}
              <BouncingDots />
            </span>
          ) : null}
        </div>
        {timeline}
        {/* Orphan blocks + running skeletons — safety fallback so data is never hidden */}
        {(orphanBlocks.length > 0 || runningQueries.length > 0) && (
          <div className="mt-3 space-y-4">
            {orphanBlocks.map((block) => (
              <ResultBlockCard
                key={block.index}
                title={block.chartConfig?.title ?? block.purpose}
                preview={block.preview ?? null}
                sql={block.sql}
                rowCount={block.rowCount}
                executionTimeMs={block.executionTimeMs}
                chartConfig={block.chartConfig ?? null}
                running={!block.preview}
              />
            ))}
            {runningQueries.map((query, index) => {
              const input = (query.input ?? {}) as { purpose?: string; sql?: string };
              return (
                <ResultBlockCard
                  key={query.callId ?? `running-${index}`}
                  title={input.purpose}
                  preview={null}
                  sql={input.sql}
                  running
                />
              );
            })}
          </div>
        )}
        {/* Answer text renders as positioned narration steps inside the timeline
            (SPEC-11 §C.3), so there is no trailing answer blob here. */}
        {showWritingHint && (
          <div className="mt-3 flex items-center gap-2 text-xs text-faint">
            <span className="font-medium">Writing analysis</span>
            <BouncingDots />
          </div>
        )}
        {!state.textDelta && state.activities.length === 0 && state.blocks.length === 0 && (
          <div className="mt-2">
            <BouncingDots />
          </div>
        )}
      </div>
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
  onSave: (message: ConversationMessageDto, config: ChartConfig, dashboardId: string, viewTransform: ViewTransform | null, block: QueryResultBlock | undefined) => Promise<void>;
}) {
  const blocks = message.queryRun?.resultBlocks;
  const hasBlocks = blocks && blocks.length > 0;
  const legacyHasResult = isBoundedResultPreview(message.queryRun?.resultPreview);

  const steps = parseAgentTranscript(message.metadata);
  // Which block indices the timeline renders inline — derived from the steps,
  // never from a side effect inside renderBlock (see PendingAssistantMessage).
  const inlineBlockIndices = new Set(
    steps
      .filter(
        (step): step is Extract<TimelineStep, { kind: "tool" }> =>
          step.kind === "tool" && step.tool === "run_sql" && step.status === "ok" && step.blockIndex != null,
      )
      .map((step) => step.blockIndex as number),
  );

  const renderBlock = hasBlocks
    ? (blockIndex: number): React.ReactNode => {
        const block = blocks.find((b) => b.index === blockIndex);
        if (!block) return null;
        return (
          <ConversationResultCard
            message={message}
            block={block}
            dashboardOptions={dashboardOptions}
            onCreateDashboard={onCreateDashboard}
            onSave={onSave}
          />
        );
      }
    : undefined;

  const timeline = <AgentTimeline steps={steps} renderBlock={renderBlock} />;

  // SPEC-11 §C.2: when the transcript carries positioned narration steps, the
  // answer text already renders in the timeline at its true position, so the
  // trailing `content` blob is suppressed (content stays the faithful
  // concatenation for legacy consumers). Historical messages have no narration
  // steps and keep rendering `content` exactly as before.
  const hasNarration = steps.some((step) => step.kind === "narration");

  // Safety net only: blocks the timeline cannot place (e.g. very old messages
  // whose transcript carries no run_sql steps at all).
  const orphanBlocks = hasBlocks
    ? blocks.filter((block) => !inlineBlockIndices.has(block.index))
    : [];

  return (
    <div className="flex items-start gap-3">
      <BrandMark className="mt-0.5 size-9 rounded-full" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-text">QueryWise</span>
          <span className="text-[10px] text-faint">{formatClockTime(message.createdAt)}</span>
        </div>
        {timeline}
        {!hasBlocks && message.content && !message.metadata.errorCode && !hasNarration ? <div className="mt-2"><Markdown>{message.content}</Markdown></div> : null}
        {message.metadata.errorCode ? <p className="mt-2 rounded-md border border-danger/25 bg-danger/5 px-3 py-2 text-xs text-danger">{message.content || "Something went wrong while processing your query. Please try again."}</p> : null}
        {/* Orphan blocks that weren't rendered inline by the timeline */}
        {orphanBlocks.length > 0 ? (
           <div className="mt-3 space-y-4">
             {orphanBlocks.map((block) => (
                <ConversationResultCard
                   key={block.index}
                   message={message}
                   block={block}
                   dashboardOptions={dashboardOptions}
                   onCreateDashboard={onCreateDashboard}
                   onSave={onSave}
                />
              ))}
           </div>
        ) : null}
        {/* Legacy single-result V2 messages (no resultBlocks) */}
        {!hasBlocks && legacyHasResult ? (
           <ConversationResultCard
             message={message}
             dashboardOptions={dashboardOptions}
             onCreateDashboard={onCreateDashboard}
             onSave={onSave}
           />
        ) : null}
        {(hasBlocks || orphanBlocks.length > 0) && message.content && !hasNarration ? <div className="mt-3"><Markdown>{message.content}</Markdown></div> : null}
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
  schemaSyncWarning?: string | null;
}

function Composer({
  question,
  setQuestion,
  onSubmit,
  submitting,
  error,
  disabledReason,
  schemaSyncWarning,
}: ComposerProps) {
  return (
    <div className="shrink-0 bg-bg px-4 pb-4 pt-2 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <ComposerBox
          question={question}
          setQuestion={setQuestion}
          onSubmit={onSubmit}
          submitting={submitting}
          disabled={Boolean(disabledReason)}
          placeholder={disabledReason ?? "Ask anything about your database..."}
        />
        {schemaSyncWarning ? (
          <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-warning">
            <AlertTriangle className="size-3.5 shrink-0" />
            {schemaSyncWarning}
          </p>
        ) : null}
        {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
        {disabledReason ? <p className="mt-2 text-center text-xs text-warning">{disabledReason}</p> : null}
        <p className="mt-2 text-center text-[11px] text-faint">AI-generated results. Please verify accuracy before making decisions.</p>
      </div>
    </div>
  );
}

/* ------------------------------ Context panel ----------------------------- */

function ContextPanel({ connectionId, latestRun }: { connectionId: string; latestRun: ConversationMessageDto["queryRun"] | null }) {
  const connection = useApiResource((signal) => connectionsApi.get(connectionId, signal), connectionId);
  const schema = useApiResource((signal) => connectionsApi.schema(connectionId, signal), connectionId);
  const [tab, setTab] = useState<"schema" | "sql" | "summary">("schema");
  const ingestion = getIngestionStatusView(connection.data?.schemaSyncStatus);
  return (
    <aside className="flex min-h-0 w-[320px] flex-col border-l border-border bg-surface">
      <div className="border-b border-border p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">Active data source</p>
        <h2 className="mt-1 truncate font-medium">{connection.data?.name ?? "Loading connection"}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant={ingestion.tone}>{ingestion.label}</Badge>
          <span className="text-xs capitalize text-faint">{connection.data?.status ?? ""}</span>
        </div>
      </div>
      <div className="grid grid-cols-3 border-b border-border text-xs">
        {(["schema", "sql", "summary"] as const).map((value) => (
          <button key={value} onClick={() => setTab(value)} className={`px-2 py-3 capitalize transition ${tab === value ? "border-b-2 border-accent font-medium text-accent-strong" : "text-faint hover:text-text"}`}>
            {value === "sql" ? "SQL" : value}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === "schema" ? (
          schema.loading && !schema.data ? <SchemaBrowserSkeleton /> : schema.error ? <ErrorState error={schema.error} onRetry={() => void schema.refresh()} /> : <SchemaBrowser metadata={schema.data?.metadata ?? null} />
        ) : null}
        {tab === "sql" ? (
          latestRun?.generatedQuery ? <CodeBlock sql={latestRun.generatedQuery.text} /> : <p className="rounded-lg border border-dashed border-border p-4 text-xs text-faint">Run a query to see its generated SQL.</p>
        ) : null}
        {tab === "summary" ? (
          <div className="space-y-3 text-sm">
            <p>{schema.data?.summary ?? "No saved database summary is available."}</p>
            <p className="text-xs text-faint">Schema status: {ingestion.description}</p>
            <Link href={`/connections/${connectionId}`} className="text-xs font-semibold text-accent-strong underline">Open connection settings</Link>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

/* ------------------------------ Conversation ------------------------------ */

export function ConversationView({ conversationId }: { conversationId: string }) {
  const { bumpDashboardVersion, bumpChatVersion } = useAppState();
  const [contextPanelOpen, setContextPanelOpen] = useLocalStorage<boolean>("querywise.contextPanel.open", false);
  const conversation = useApiResource((signal) => conversationsApi.get(conversationId, signal), conversationId);
  const connection = useApiResource(
    (signal) => conversation.data?.connectionId ? connectionsApi.get(conversation.data.connectionId, signal) : Promise.resolve(null),
    conversation.data?.connectionId,
  );
  const [messageState, setMessageState] = useState<{
    items: ConversationMessageDto[];
    nextCursor: string | null;
    hasMore: boolean;
  }>({ items: [], nextCursor: null, hasMore: false });
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [messagesError, setMessagesError] = useState<Error | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const dashboards = useApiResource((signal) => dashboardsApi.list(100, undefined, signal));
  const [question, setQuestion] = useState("");
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamState, setStreamState] = useState<StreamState | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const olderScrollPosition = useRef<{ height: number; top: number } | null>(null);
  /** Pinned-to-bottom: keep following the stream unless the user scrolled up. */
  const pinnedToBottom = useRef(true);
  const userInitial = useUserInitial();

  const ordered = useMemo(
    () => messageState.items.slice().sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id)),
    [messageState.items],
  );
  const latestRun = useMemo(() => ordered.slice().reverse().find((message) => message.queryRun)?.queryRun ?? null, [ordered]);
  const dashboardOptions = useMemo(
    () => dashboards.data?.items.filter((item) => item.access === "owner").map((item) => ({ value: item.id, label: item.name })) ?? [],
    [dashboards.data],
  );
  const ingestion = getIngestionStatusView(connection.data?.schemaSyncStatus);
  const refreshConnection = connection.refresh;
  // SPEC-13 §4: a deleted data source makes the chat read-only history. This takes
  // priority over the ingestion-readiness gate and drives the banner + composer.
  const connectionDeleted = Boolean(conversation.data?.connectionDeleted);
  const deletedConnectionName = conversation.data?.connection.name ?? "this database";
  const readOnlyReason = connectionDeleted
    ? `The database "${deletedConnectionName}" was deleted. You can view this conversation but can't ask new questions.`
    : null;
  const composerDisabledReason =
    readOnlyReason ?? (conversation.data && connection.data && !ingestion.ready ? ingestion.description : null);

  // Silent refresh: never flips the list back to a skeleton once messages
  // are on screen (that caused a full-screen flicker after each response).
  const refreshMessages = useCallback(async () => {
    setMessagesError(null);
    try {
      const page = await conversationsApi.messages(conversationId, 100);
      setMessageState((current) => {
        const byId = new Map(current.items.map((message) => [message.id, message]));
        for (const message of page.items) byId.set(message.id, message);
        return {
          items: [...byId.values()],
          nextCursor: page.pageInfo.nextCursor,
          hasMore: page.pageInfo.hasMore,
        };
      });
    } catch (reason) {
      setMessagesError(reason instanceof Error ? reason : new Error("Unable to load messages"));
    } finally {
      setMessagesLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    let active = true;
    setMessageState({ items: [], nextCursor: null, hasMore: false });
    setMessagesLoading(true);
    setMessagesError(null);
    void conversationsApi.messages(conversationId, 100).then(
      (page) => {
        if (!active) return;
        setMessageState({
          items: page.items,
          nextCursor: page.pageInfo.nextCursor,
          hasMore: page.pageInfo.hasMore,
        });
        setMessagesLoading(false);
      },
      (reason) => {
        if (!active) return;
        setMessagesError(reason instanceof Error ? reason : new Error("Unable to load messages"));
        setMessagesLoading(false);
      },
    );
    return () => { active = false; };
  }, [conversationId]);

  async function loadOlderMessages() {
    if (!messageState.nextCursor || loadingOlder) return;
    if (scrollRef.current) {
      olderScrollPosition.current = {
        height: scrollRef.current.scrollHeight,
        top: scrollRef.current.scrollTop,
      };
    }
    setLoadingOlder(true);
    setMessagesError(null);
    try {
      const page = await conversationsApi.messages(conversationId, 100, messageState.nextCursor);
      setMessageState((current) => {
        const byId = new Map(current.items.map((message) => [message.id, message]));
        for (const message of page.items) byId.set(message.id, message);
        return {
          items: [...byId.values()],
          nextCursor: page.pageInfo.nextCursor,
          hasMore: page.pageInfo.hasMore,
        };
      });
    } catch (reason) {
      olderScrollPosition.current = null;
      setMessagesError(reason instanceof Error ? reason : new Error("Unable to load older messages"));
    } finally {
      setLoadingOlder(false);
    }
  }

  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;
    if (olderScrollPosition.current) {
      const previous = olderScrollPosition.current;
      olderScrollPosition.current = null;
      scrollContainer.scrollTo({ top: previous.top + scrollContainer.scrollHeight - previous.height });
      return;
    }
    scrollContainer.scrollTo({ top: scrollContainer.scrollHeight });
  }, [ordered.length, submitting]);

  // Follow the live stream as it grows, but never fight the user: once they
  // scroll up, stay put until they return to the bottom.
  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer || !streamState) return;
    if (pinnedToBottom.current) {
      scrollContainer.scrollTo({ top: scrollContainer.scrollHeight });
    }
  }, [streamState]);

  function handleScroll() {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;
    const distanceFromBottom =
      scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight;
    pinnedToBottom.current = distanceFromBottom < 96;
  }

  useEffect(() => {
    if (!connection.data || ingestion.terminal) return;
    const timer = window.setInterval(() => void refreshConnection(), 5000);
    return () => window.clearInterval(timer);
  }, [connection.data, refreshConnection, ingestion.terminal]);

  const handleQueryEvent = makeQueryEventHandler(setStreamState, setError);

  async function submit(event?: FormEvent, overrideQuestion?: string) {
    event?.preventDefault();
    const targetQuestion = overrideQuestion ?? question;
    if (!targetQuestion.trim()) return;
    if (composerDisabledReason) {
      setError(composerDisabledReason);
      return;
    }
    const trimmed = targetQuestion.trim();
    if (!overrideQuestion) setQuestion("");
    setPendingQuestion(trimmed);
    setSubmitting(true);
    setError(null);
    setStreamState({ status: null, textDelta: "", activities: [], blocks: [] });
    try {
      await conversationsApi.submitStream({ conversationId, question: trimmed }, handleQueryEvent);
      await refreshMessages();
      await conversation.refresh();
      bumpChatVersion();
    } catch (reason) {
      if (!overrideQuestion) setQuestion(trimmed);
      setError(reason instanceof Error ? reason.message : "Unable to submit query");
    } finally {
      setPendingQuestion(null);
      setSubmitting(false);
      setStreamState(null);
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const pending = window.sessionStorage.getItem(STORAGE_KEYS.pendingQuestion);
    if (pending) {
      window.sessionStorage.removeItem(STORAGE_KEYS.pendingQuestion);
      // We wait briefly to ensure the connection context is loaded, though
      // submit() handles its own stream execution gracefully.
      setTimeout(() => {
        void submit(undefined, pending);
      }, 0);
    }
  }, []);

  async function createDashboard(name: string) {
    const dashboard = await dashboardsApi.create(name);
    void dashboards.refresh();
    bumpDashboardVersion();
    return dashboard.id;
  }

  async function saveResult(
    message: ConversationMessageDto,
    chartConfig: ChartConfig,
    targetDashboardId: string,
    viewTransform: ViewTransform | null = null,
    block?: QueryResultBlock,
  ) {
    const run = message.queryRun;
    // Pin the specific block's data (SQL + snapshot), not the legacy block-0
    // mirror — so any block a user opens can be saved as its own widget.
    const preview = block ? block.resultPreview : run?.resultPreview;
    const queryDefinition: ProviderQuery | undefined = block
      ? { kind: "sql", dialectId: "postgresql", text: block.sql }
      : run?.generatedQuery;
    if (!targetDashboardId || !message.queryRunId || !isBoundedResultPreview(preview)) {
      throw new Error("This chart is not ready to save.");
    }
    setError(null);
    try {
      await dashboardsApi.createWidget(targetDashboardId, {
        title: chartConfig.title ?? block?.purpose ?? conversation.data?.title ?? "Query result",
        queryRunId: message.queryRunId,
        queryDefinition,
        chartConfig,
        layout: { schemaVersion: 1, x: 0, y: 0, w: 6, h: 4 },
        snapshot: preview,
        viewTransform,
      });
    } catch (reason) {
      const errorMessage = reason instanceof Error ? reason.message : "Unable to save result";
      setError(errorMessage);
      throw reason;
    }
  }

  if (conversation.error || (!conversation.data && !conversation.loading)) return <div className="p-6"><ErrorState error={conversation.error ?? new Error("Conversation not found")} onRetry={() => void conversation.refresh()} /></div>;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] min-h-[640px] lg:h-screen">
      <section className="relative flex h-full min-w-0 flex-1 flex-col bg-bg">
        {/* Conversation header */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20">
          <div className="pointer-events-auto absolute left-0 flex h-14 min-w-0 max-w-[calc(100%-11rem)] items-center gap-2.5 rounded-br-xl border border-l-0 border-t-0 border-border/70 bg-surface/65 px-4 shadow-[0_14px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl">
            <Database className={`size-4 shrink-0 ${connectionDeleted ? "text-warning" : "text-accent-strong"}`} />
            <span className="truncate text-sm font-medium text-text">{connection.data?.name ?? conversation.data?.connection.name ?? conversation.data?.title ?? ""}</span>
            {connectionDeleted ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-warning">
                Read-only
              </span>
            ) : null}
          </div>
          <div className="pointer-events-auto absolute right-0 flex h-14 shrink-0 items-center gap-1.5 rounded-bl-xl border border-r-0 border-t-0 border-border/70 bg-surface/65 px-3 shadow-[0_14px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl">
            <button type="button" aria-label="Favorite chat" title="Favorite chat" className="inline-flex size-8 items-center justify-center rounded-md text-faint transition hover:bg-surface-2 hover:text-text"><Star className="size-4" /></button>
            <button type="button" aria-label="Share chat" title="Share chat" className="inline-flex size-8 items-center justify-center rounded-md text-faint transition hover:bg-surface-2 hover:text-text"><Share2 className="size-4" /></button>
            <Tooltip content={contextPanelOpen ? "Hide schema panel" : "Show schema panel"} side="top">
              <button
                type="button"
                aria-label={contextPanelOpen ? "Hide schema panel" : "Show schema panel"}
                onClick={() => setContextPanelOpen(!contextPanelOpen)}
                className="inline-flex size-8 items-center justify-center rounded-md text-faint transition hover:bg-surface-2 hover:text-text"
              >
                {contextPanelOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
              </button>
            </Tooltip>
          </div>
        </div>
        <div ref={scrollRef} onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-24 sm:px-6">
          {readOnlyReason ? (
            <div className="mx-auto mb-5 flex max-w-6xl items-start gap-2.5 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
              <p className="min-w-0">{readOnlyReason}</p>
            </div>
          ) : null}
          {(conversation.loading || messagesLoading) && !ordered.length && !pendingQuestion && !submitting ? (
            <MessageListSkeleton messages={4} />
          ) : messagesError && !ordered.length ? (
            <ErrorState error={messagesError} onRetry={() => void refreshMessages()} />
          ) : !ordered.length && !pendingQuestion && !submitting ? (
            <div className="mx-auto max-w-2xl pt-10 text-center">
              <BrandMark className="mx-auto size-12 rounded-2xl" />
              <h2 className="mt-4 font-syne text-2xl font-semibold">Ask a question about your data</h2>
              <p className="mt-1 text-sm text-faint">Try one of these to get started.</p>
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
            <div className="mx-auto max-w-6xl space-y-6">
              {messageState.hasMore ? (
                <div className="flex justify-center">
                  <Button type="button" variant="ghost" size="sm" loading={loadingOlder} onClick={() => void loadOlderMessages()}>
                    Load older messages
                  </Button>
                </div>
              ) : null}
              {messagesError ? <p role="alert" className="text-center text-xs text-danger">{messagesError.message}</p> : null}
              {ordered.map((message) =>
                message.role === "user" ? (
                  <UserMessage key={message.id} message={message} initial={userInitial} />
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
              {pendingQuestion ? (
                <div className="flex items-start justify-end gap-3">
                  <div className="max-w-[78%] rounded-2xl rounded-tr-md border border-success/20 bg-success/10 px-4 py-3 shadow-sm opacity-70">
                    <p className="whitespace-pre-wrap text-sm text-text">{pendingQuestion}</p>
                  </div>
                  <UserAvatar initial={userInitial} />
                </div>
              ) : null}
              {submitting && streamState ? (
                <PendingAssistantMessage state={streamState} />
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
        />
      </section>
      {conversation.data ? (
        <div
          className={`hidden flex-shrink-0 overflow-hidden transition-all duration-200 lg:block ${contextPanelOpen ? "w-[320px]" : "w-0"}`}
        >
          <ContextPanel connectionId={conversation.data.connectionId} latestRun={latestRun} />
        </div>
      ) : null}
    </div>
  );
}
