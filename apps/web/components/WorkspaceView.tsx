"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  CheckCircle2,
  Database,
  MessageSquarePlus,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Send,
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
import type { ChartConfig } from "@query-wise/shared/types";

const suggestions = [
  "What changed in the last 30 days?",
  "Show the top five categories by revenue",
  "Which customers are growing fastest?",
];

const STORAGE_KEYS = {
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
  disabled?: boolean;
}

function ConnectionPicker({ value, onChange, disabled }: ConnectionPickerProps) {
  const router = useRouter();
  const connections = useApiResource((signal) => connectionsApi.list(100, undefined, signal));

  if (connections.loading) {
    return (
      <div className="flex h-9 min-w-40 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-xs text-text-3">
        <Database className="size-3.5 shrink-0 text-text-3" />
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
  if (connectionId === "__demo__") {
    window.sessionStorage.removeItem(STORAGE_KEYS.connection);
    return;
  }
  window.sessionStorage.setItem(STORAGE_KEYS.connection, connectionId);
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
  const rootRef = useRef<HTMLDivElement | null>(null);
  const isDemo = value === "__demo__";
  const selectedIngestion = getIngestionStatusView(selectedConnection?.schemaSyncStatus);
  const readyLabel = isDemo ? "Demo ready" : selectedConnection ? selectedIngestion.label : "Choose source";
  const sourceName = isDemo ? "demo" : selectedConnection?.name ?? "Select database";

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
    onChange(nextValue);
    setStoredConnectionId(nextValue);
  }

  return (
    <div ref={rootRef} className="relative mx-auto flex w-full justify-center">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((current) => !current)}
        className="flex max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-lg border border-border bg-surface/80 px-4 py-2 text-xs text-text-2 shadow-[0_10px_40px_rgba(0,0,0,0.18)] backdrop-blur transition hover:border-border-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="inline-flex max-w-[170px] items-center gap-1.5 truncate">
          <Database className="size-3.5 shrink-0 text-text-3" />
          <span className="truncate font-medium text-text-1">{sourceName}</span>
          <ChevronDown className={`size-3.5 shrink-0 text-text-3 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
        <span className="hidden h-3 w-px bg-border sm:block" />
        <span className="inline-flex items-center gap-1.5">
          <Database className="size-3.5 text-accent-2" />
          PostgreSQL
        </span>
        <span className="hidden h-3 w-px bg-border sm:block" />
        <span className="inline-flex items-center gap-1.5">
          <span className={`size-2 rounded-full ${isDemo || selectedIngestion.ready ? "bg-success" : selectedIngestion.tone === "danger" ? "bg-danger" : "bg-warning"}`} />
          {readyLabel}
        </span>
        {typeof tableCount === "number" ? (
          <>
            <span className="hidden h-3 w-px bg-border sm:block" />
            <span className="inline-flex items-center gap-1.5">
              {schemaLoading ? <Spinner size="sm" className="text-text-3" /> : <Table2 className="size-3.5 text-text-3" />}
              {tableCount} tables
            </span>
          </>
        ) : null}
      </button>

      {open ? (
        <div className="fixed left-1/2 top-1/2 z-50 max-h-[min(32rem,calc(100vh-6rem))] w-[min(27rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto overflow-x-hidden rounded-xl border border-border-2 bg-surface-2 p-1 text-left shadow-2xl">
          <button
            type="button"
            onClick={() => choose("__demo__")}
            className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-xs transition ${isDemo ? "bg-accent/20 text-text-1" : "text-text-2 hover:bg-surface-3 hover:text-text-1"}`}
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">demo</span>
              <span className="block text-[11px] text-text-3">Server-managed ecommerce demo</span>
            </span>
            <span className="shrink-0 rounded-full bg-success/15 px-2 py-0.5 text-[10px] text-success">Ready</span>
          </button>

          <div className="my-1 border-t border-border" />

          {connections.map((connection) => {
            const ingestion = getIngestionStatusView(connection.schemaSyncStatus);
            const selected = connection.id === value;
            return (
              <button
                key={connection.id}
                type="button"
                onClick={() => choose(connection.id)}
                className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-xs transition ${selected ? "bg-accent/20 text-text-1" : "text-text-2 hover:bg-surface-3 hover:text-text-1"}`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{connection.name}</span>
                  <span className="block truncate text-[11px] text-text-3">{connection.databaseName}</span>
                </span>
                <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] text-text-3">{ingestion.label}</span>
              </button>
            );
          })}

          {!connections.length ? (
            <p className="px-3 py-2 text-xs text-text-3">No saved connections yet.</p>
          ) : null}

          <div className="my-1 border-t border-border" />
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                router.push("/connections/new");
              }}
              className="flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium text-accent-2 transition hover:bg-accent-dim"
            >
              <Plus className="size-3.5" />
              Add source
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onRetry();
              }}
              className="rounded-md px-3 py-2 text-xs font-medium text-text-3 transition hover:bg-surface-3 hover:text-text-1"
            >
              Refresh
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
        <p className="py-6 text-center text-sm text-text-3">
          Couldn't load conversations.{" "}
          <button type="button" onClick={() => void conversations.refresh()} className="underline underline-offset-2 hover:text-text-1">
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
  const connections = useApiResource((signal) => connectionsApi.list(100, undefined, signal));
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
        {connections.loading && !connections.data ? (
          <ConnectionRowsSkeleton rows={3} />
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

/* ---------------------- Shared query event handler ------------------------ */

function makeQueryEventHandler(
  setStreamStatus: (status: string | null) => void,
  setError: (error: string | null) => void,
) {
  return function handleQueryEvent(event: QueryStreamEvent) {
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
  };
}

/* --------------------------- Empty chat composer -------------------------- */

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
  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (disabled) return;
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      onSubmit();
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="overflow-hidden rounded-xl border border-border bg-surface/70 shadow-[0_20px_70px_rgba(0,0,0,0.28)] backdrop-blur-xl">
        <textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          maxLength={500}
          rows={4}
          placeholder="Ask anything about your data..."
          className="min-h-24 w-full resize-none bg-transparent px-5 py-4 text-base outline-none placeholder:text-text-3 disabled:cursor-not-allowed sm:min-h-28"
        />
        <div className="border-t border-border px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              type="button"
              loading={submitting}
              disabled={!question.trim() || disabled}
              onClick={onSubmit}
              className="h-10 w-full px-5 shadow-[0_0_24px_rgba(46,213,46,0.18)] sm:w-auto"
            >
              <Send className="size-4" />
              Run
            </Button>
          </div>
        </div>
      </div>
      {error ? <p className="mt-3 text-center text-xs text-danger">{error}</p> : null}
      <p className="mt-3 text-center text-[11px] text-text-3">AI-generated results. Please verify accuracy before making decisions.</p>
    </div>
  );
}

/* -------------------------- Empty workspace ------------------------------- */

function CursorRevealBackground() {
  const imageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const image = imageRef.current;
    const supportsCursorReveal = window.matchMedia("(hover: hover) and (pointer: fine)");
    if (!image || !supportsCursorReveal.matches) return;
    const revealImage = image;

    let frameId: number | null = null;
    let pointerX = 0;
    let pointerY = 0;

    function hideReveal() {
      revealImage.style.opacity = "0";
    }

    function paintReveal() {
      frameId = null;
      const bounds = revealImage.getBoundingClientRect();
      const isInside =
        pointerX >= bounds.left &&
        pointerX <= bounds.right &&
        pointerY >= bounds.top &&
        pointerY <= bounds.bottom;

      if (!isInside) {
        hideReveal();
        return;
      }

      revealImage.style.setProperty("--reveal-x", `${pointerX - bounds.left}px`);
      revealImage.style.setProperty("--reveal-y", `${pointerY - bounds.top}px`);
      revealImage.style.opacity = "1";
    }

    function handlePointerMove(event: PointerEvent) {
      if (event.pointerType !== "mouse") return;
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (frameId === null) frameId = window.requestAnimationFrame(paintReveal);
    }

    function handlePointerOut(event: PointerEvent) {
      if (event.relatedTarget === null) hideReveal();
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerout", handlePointerOut);
    window.addEventListener("blur", hideReveal);

    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerout", handlePointerOut);
      window.removeEventListener("blur", hideReveal);
    };
  }, []);

  return (
    <div
      ref={imageRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 motion-reduce:transition-none"
      style={{
        backgroundImage: "url('/bg-5.png')",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
        maskImage:
          "radial-gradient(circle 260px at var(--reveal-x, 50%) var(--reveal-y, 50%), black 0%, rgba(0,0,0,0.96) 42%, transparent 100%)",
        WebkitMaskImage:
          "radial-gradient(circle 260px at var(--reveal-x, 50%) var(--reveal-y, 50%), black 0%, rgba(0,0,0,0.96) 42%, transparent 100%)",
      }}
    />
  );
}

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
  const [streamStatus, setStreamStatus] = useState<string | null>(null);

  const connectionItems = useMemo(() => connections.data?.items ?? [], [connections.data]);
  const selectedConnection = useMemo(
    () => connectionItems.find((item) => item.id === connectionId) ?? null,
    [connectionId, connectionItems],
  );
  const selectedSchema = useApiResource(
    (signal) => connectionId && connectionId !== "__demo__" ? connectionsApi.schema(connectionId, signal) : Promise.resolve(null),
    connectionId,
  );
  const selectedIngestion = getIngestionStatusView(selectedConnection?.schemaSyncStatus);
  const schemaSyncWarning = connectionId && connectionId !== "__demo__" && !selectedIngestion.terminal && selectedConnection
    ? "Schema syncing — your first query may be slower."
    : null;
  const tableCount = selectedSchema.data?.metadata?.entities.length ?? null;

  useEffect(() => {
    if (!connections.data) return;
    const stored = typeof window === "undefined" ? null : window.sessionStorage.getItem(STORAGE_KEYS.connection);
    const storedIsValid = stored ? connectionItems.some((item) => item.id === stored) : false;
    if (connectionId && (connectionId === "__demo__" || connectionItems.some((item) => item.id === connectionId))) return;
    const nextConnectionId = storedIsValid && stored ? stored : connectionItems[0]?.id ?? "__demo__";
    setConnectionId(nextConnectionId);
    if (nextConnectionId !== "__demo__") setStoredConnectionId(nextConnectionId);
  }, [connectionId, connectionItems, connections.data]);

  const refreshConnections = connections.refresh;
  useEffect(() => {
    if (!connectionItems.some((item) => !getIngestionStatusView(item.schemaSyncStatus).terminal)) return;
    const timer = window.setInterval(() => void refreshConnections(), 5000);
    return () => window.clearInterval(timer);
  }, [connectionItems, refreshConnections]);

  const handleQueryEvent = makeQueryEventHandler(setStreamStatus, setError);

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
    setStreamStatus("Queued");
    try {
      let resolvedConnectionId = connectionId;
      if (connectionId === "__demo__") {
        const demo = await connectionsApi.createDemo();
        resolvedConnectionId = demo.id;
      }
      const conversation = await conversationsApi.create(resolvedConnectionId);
      await conversationsApi.submitStream(
        { conversationId: conversation.id, question: trimmed },
        handleQueryEvent,
      );
      bumpChatVersion();
      router.push(`/chats/${conversation.id}`);
    } catch (reason) {
      setQuestion(trimmed);
      setError(reason instanceof Error ? reason.message : "Unable to start conversation");
      setSubmitting(false);
      setStreamStatus(null);
    }
  }

  const disableComposer = !connectionId || connections.loading;

  return (
    <div className="relative flex h-[calc(100vh-3.5rem)] min-h-[640px] flex-col items-center justify-center overflow-hidden bg-bg px-4 py-10 lg:h-screen">
      <CursorRevealBackground />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(46,213,46,0.16),transparent_34%),linear-gradient(180deg,rgba(9,12,10,0),rgba(9,12,10,0.24))]" />
      <div className="relative z-10 w-full">
        <div className="mx-auto mb-5 flex max-w-3xl flex-col items-center text-center">
          <BrandMark className="size-14 rounded-2xl shadow-[0_0_60px_rgba(46,213,46,0.22)]" />
          <h1 className="mt-4 font-syne text-4xl font-semibold tracking-normal text-text-1 sm:text-5xl">Ask your data</h1>
          <p className="mt-2 text-base text-text-2">Get instant insights from your connected databases.</p>
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
        {streamStatus && submitting ? (
          <p className="mt-2 text-center text-xs text-text-3">
            <Spinner size="sm" className="mr-1" />
            {streamStatus}
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

function UserMessage({ message }: { message: ConversationMessageDto }) {
  return (
    <div className="flex items-start justify-end gap-3">
      <div className="max-w-[78%] rounded-xl border border-success/20 bg-success/10 px-4 py-3 shadow-sm">
        <p className="whitespace-pre-wrap text-sm text-text-1">{message.content}</p>
        <p className="mt-1.5 flex items-center justify-end gap-1 text-[10px] text-text-3">
          {formatClockTime(message.createdAt)}
          <CheckCircle2 className="size-3 text-success" />
        </p>
      </div>
      <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-success text-[12px] font-semibold text-accent-foreground shadow-sm">N</span>
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
      <BrandMark className="mt-0.5 size-9 rounded-full shadow-sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-text-1">QueryWise</span>
          <span className="text-[10px] text-text-3">{formatClockTime(message.createdAt)}</span>
        </div>
        {message.content ? <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-text-1">{message.content}</p> : null}
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
  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (disabledReason) return;
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      onSubmit();
    }
  }

  const runDisabled = !question.trim() || Boolean(disabledReason);

  return (
    <div className="shrink-0 bg-bg px-4 pb-4 pt-2 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <Card className="overflow-hidden rounded-xl border-border bg-surface shadow-sm">
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={onKeyDown}
            disabled={Boolean(disabledReason)}
            maxLength={500}
            rows={2}
            placeholder={disabledReason ?? "Ask anything about your database..."}
            className="min-h-16 w-full resize-none bg-transparent px-4 py-3 text-sm outline-none placeholder:text-text-3 disabled:cursor-not-allowed"
          />
          <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center">
            <Button size="sm" loading={submitting} disabled={runDisabled} onClick={onSubmit} className="ml-auto h-9 w-full px-5 sm:w-auto">
              <Send className="size-3.5" />Run
            </Button>
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
  const connection = useApiResource((signal) => connectionsApi.get(connectionId, signal), connectionId);
  const schema = useApiResource((signal) => connectionsApi.schema(connectionId, signal), connectionId);
  const [tab, setTab] = useState<"schema" | "sql" | "summary">("schema");
  const ingestion = getIngestionStatusView(connection.data?.schemaSyncStatus);
  return (
    <aside className="flex min-h-0 w-[320px] flex-col border-l border-border bg-surface">
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
          schema.loading && !schema.data ? <SchemaBrowserSkeleton /> : schema.error ? <ErrorState error={schema.error} onRetry={() => void schema.refresh()} /> : <SchemaBrowser metadata={schema.data?.metadata ?? null} />
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
  const [streamStatus, setStreamStatus] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const olderScrollPosition = useRef<{ height: number; top: number } | null>(null);

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
  const composerDisabledReason = conversation.data && connection.data && !ingestion.ready ? ingestion.description : null;

  const refreshMessages = useCallback(async () => {
    setMessagesLoading(true);
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

  useEffect(() => {
    if (!connection.data || ingestion.terminal) return;
    const timer = window.setInterval(() => void refreshConnection(), 5000);
    return () => window.clearInterval(timer);
  }, [connection.data, refreshConnection, ingestion.terminal]);

  const handleQueryEvent = makeQueryEventHandler(setStreamStatus, setError);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!question.trim()) return;
    if (composerDisabledReason) {
      setError(composerDisabledReason);
      return;
    }
    const trimmed = question.trim();
    setQuestion("");
    setPendingQuestion(trimmed);
    setSubmitting(true);
    setError(null);
    setStreamStatus("Queued");
    try {
      await conversationsApi.submitStream({ conversationId, question: trimmed }, handleQueryEvent);
      await refreshMessages();
      await conversation.refresh();
      bumpChatVersion();
    } catch (reason) {
      setQuestion(trimmed);
      setError(reason instanceof Error ? reason.message : "Unable to submit query");
    } finally {
      setPendingQuestion(null);
      setSubmitting(false);
      setStreamStatus(null);
    }
  }

  async function createDashboard(name: string) {
    const dashboard = await dashboardsApi.create(name);
    void dashboards.refresh();
    bumpDashboardVersion();
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

  if (conversation.error || (!conversation.data && !conversation.loading)) return <div className="p-6"><ErrorState error={conversation.error ?? new Error("Conversation not found")} onRetry={() => void conversation.refresh()} /></div>;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] min-h-[640px] lg:h-screen">
      <section className="relative flex h-full min-w-0 flex-1 flex-col bg-bg">
        {/* Conversation header */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20">
          <div className="pointer-events-auto absolute left-0 flex h-14 min-w-0 max-w-[calc(100%-11rem)] items-center gap-2.5 rounded-br-xl border border-l-0 border-t-0 border-border/70 bg-surface/65 px-4 shadow-[0_14px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl">
            <Database className="size-4 shrink-0 text-accent-2" />
            <span className="truncate text-sm font-medium text-text-1">{connection.data?.name ?? conversation.data?.title ?? ""}</span>
          </div>
          <div className="pointer-events-auto absolute right-0 flex h-14 shrink-0 items-center gap-1.5 rounded-bl-xl border border-r-0 border-t-0 border-border/70 bg-surface/65 px-3 shadow-[0_14px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl">
            <button type="button" aria-label="Favorite chat" title="Favorite chat" className="inline-flex size-8 items-center justify-center rounded-md text-text-3 transition hover:bg-surface-3 hover:text-text-1"><Star className="size-4" /></button>
            <button type="button" aria-label="Share chat" title="Share chat" className="inline-flex size-8 items-center justify-center rounded-md text-text-3 transition hover:bg-surface-3 hover:text-text-1"><Share2 className="size-4" /></button>
            <Tooltip content={contextPanelOpen ? "Hide schema panel" : "Show schema panel"} side="top">
              <button
                type="button"
                aria-label={contextPanelOpen ? "Hide schema panel" : "Show schema panel"}
                onClick={() => setContextPanelOpen(!contextPanelOpen)}
                className="inline-flex size-8 items-center justify-center rounded-md text-text-3 transition hover:bg-surface-3 hover:text-text-1"
              >
                {contextPanelOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
              </button>
            </Tooltip>
          </div>
        </div>
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-24 sm:px-6">
          {conversation.loading || messagesLoading ? (
            <MessageListSkeleton messages={4} />
          ) : messagesError && !ordered.length ? (
            <ErrorState error={messagesError} onRetry={() => void refreshMessages()} />
          ) : !ordered.length ? (
            <div className="mx-auto max-w-2xl pt-10 text-center">
              <BrandMark className="mx-auto size-12 rounded-2xl" />
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
              {pendingQuestion ? (
                <div className="flex items-start justify-end gap-3">
                  <div className="max-w-[78%] rounded-xl border border-success/20 bg-success/10 px-4 py-3 shadow-sm opacity-70">
                    <p className="whitespace-pre-wrap text-sm text-text-1">{pendingQuestion}</p>
                  </div>
                  <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-success text-[12px] font-semibold text-accent-foreground shadow-sm">N</span>
                </div>
              ) : null}
              {submitting ? (
                <div className="flex items-center gap-3">
                  <BrandMark className="size-8" />
                  <span className="inline-flex items-center gap-2 rounded-2xl rounded-tl-sm border border-border bg-surface px-4 py-2.5 text-sm text-text-3">
                    <Spinner size="sm" />{streamStatus ?? "Analyzing your data..."}
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
