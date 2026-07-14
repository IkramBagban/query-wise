"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  CheckCircle2,
  Database,
  ExternalLink,
  Eye,
  EyeOff,
  Plus,
  RefreshCw,
  Table2,
  TestTube2,
  Trash2,
  X,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { PageHeaderSkeleton, SchemaBrowserSkeleton } from "@/components/LoadingSkeletons";
import { EmptyState, ErrorState } from "@/components/ResourceState";
import { PageHeader } from "@/components/PageHeader";
import { SchemaBrowser } from "@/components/SchemaBrowser";
import { ConnectionDeleteDialog } from "@/components/ConnectionDeleteDialog";
import { useApiResource } from "@/hooks";
import { formatRelativeTime } from "@/lib/utils";
import { connectionsApi, getIngestionStatusView } from "@/lib/api-client";
import type { ConnectionListItem } from "@/lib/api-client";
import { assemblePostgresUrl } from "@/lib/connections/assemble-url";

function statusVariant(value: string) {
  return value === "connected" || value === "ready" ? "success" : value === "error" ? "danger" : "warning";
}

function SchemaStatus({ value }: { value: string }) {
  const status = getIngestionStatusView(value);
  return <Badge variant={status.tone}>{status.label}</Badge>;
}

function PostgresMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-lg border border-border bg-accent-soft ${compact ? "size-8" : "size-11"}`}>
      <img src="/icons/postgresql.svg" alt="PostgreSQL" className={compact ? "size-5" : "size-6"} />
    </span>
  );
}

const TONE_DOT: Record<string, string> = { success: "bg-accent", warning: "bg-warning", danger: "bg-danger" };
const TONE_TEXT: Record<string, string> = { success: "text-accent-strong", warning: "text-warning", danger: "text-danger" };

function StatusInline({ tone, label, pulse }: { tone: string; label: string; pulse?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap font-mono text-[10.5px] ${TONE_TEXT[tone] ?? "text-faint"}`}>
      <span
        className={`size-1.5 shrink-0 rounded-full ${TONE_DOT[tone] ?? "bg-border-2"}`}
        style={pulse ? { animation: "qw-pulse 1.4s ease-in-out infinite" } : undefined}
      />
      {label}
    </span>
  );
}

type TestState =
  | { status: "idle" }
  | { status: "testing" }
  | { status: "success"; latencyMs: number }
  | { status: "error"; message: string };

function TestConnectionButton({
  connectionString,
  onTestResult,
}: {
  connectionString: string;
  onTestResult: (success: boolean) => void;
}) {
  const [testState, setTestState] = useState<TestState>({ status: "idle" });

  async function runTest() {
    if (!connectionString) return;
    setTestState({ status: "testing" });
    const start = Date.now();
    try {
      const res = await fetch("/api/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "custom", connectionString }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        latencyMs?: number;
        error?: string | { message?: string };
      };
      const latencyMs = data.latencyMs ?? Date.now() - start;
      if (res.ok && data.success) {
        setTestState({ status: "success", latencyMs });
        onTestResult(true);
      } else {
        const message =
          (typeof data.error === "string" ? data.error : data.error?.message) ??
          "Connection failed";
        setTestState({ status: "error", message });
        onTestResult(false);
      }
    } catch {
      setTestState({ status: "error", message: "Network error — could not reach the server" });
      onTestResult(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="ghost"
        disabled={!connectionString || testState.status === "testing"}
        onClick={() => void runTest()}
        className="self-start"
      >
        {testState.status === "testing" ? (
          <Spinner label="Testing connection" />
        ) : (
          <TestTube2 className="size-4" />
        )}
        {testState.status === "testing" ? "Testing…" : "Test connection"}
      </Button>

      {testState.status === "success" ? (
        <p className="inline-flex items-center gap-1.5 text-sm text-success">
          <CheckCircle2 className="size-4 shrink-0" />
          Connected — {testState.latencyMs}ms
        </p>
      ) : testState.status === "error" ? (
        <p className="inline-flex items-center gap-1.5 text-sm text-danger">
          <XCircle className="size-4 shrink-0" />
          {testState.message}
        </p>
      ) : null}
    </div>
  );
}

type ConnectionMode = "fields" | "url";

interface FieldValues {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
}

function ModeToggle({
  mode,
  onChange,
}: {
  mode: ConnectionMode;
  onChange: (mode: ConnectionMode) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-surface p-0.5">
      {(["fields", "url"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            mode === m
              ? "bg-accent-soft text-accent-strong shadow-sm"
              : "text-faint hover:text-text"
          }`}
        >
          {m === "fields" ? "Fields" : "URL"}
        </button>
      ))}
    </div>
  );
}

function ConnectionFormFields({
  fields,
  onChange,
}: {
  fields: FieldValues;
  onChange: (fields: FieldValues) => void;
}) {
  function set<K extends keyof FieldValues>(key: K, value: FieldValues[K]) {
    onChange({ ...fields, [key]: value });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3">
        <div className="flex-1 min-w-0">
          <Input
            required
            label="Host"
            value={fields.host}
            onChange={(e) => set("host", e.target.value)}
            placeholder="db.example.com"
          />
        </div>
        <div className="w-24 shrink-0">
          <Input
            required
            label="Port"
            type="number"
            value={String(fields.port)}
            onChange={(e) => set("port", Number(e.target.value))}
          />
        </div>
      </div>
      <Input
        required
        label="Database"
        value={fields.database}
        onChange={(e) => set("database", e.target.value)}
        placeholder="mydb"
      />
      <Input
        required
        label="Username"
        value={fields.username}
        onChange={(e) => set("username", e.target.value)}
        placeholder="postgres"
        autoComplete="off"
      />
      <Input
        required
        type="password"
        label="Password"
        value={fields.password}
        onChange={(e) => set("password", e.target.value)}
        placeholder="••••••••"
        autoComplete="new-password"
      />
      <label className="inline-flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={fields.ssl}
          onChange={(e) => set("ssl", e.target.checked)}
          className="size-4 rounded accent-accent-2"
        />
        <span className="text-sm">Require SSL</span>
      </label>
      <p className="text-xs text-faint">Credentials are encrypted and never shown again.</p>
    </div>
  );
}

function AddConnectionDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (connectionId: string) => void;
}) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState<ConnectionMode>("fields");
  const [fields, setFields] = useState<FieldValues>({
    host: "",
    port: 5432,
    database: "",
    username: "",
    password: "",
    ssl: true,
  });
  const [rawUrl, setRawUrl] = useState("");
  const [showUrl, setShowUrl] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testPassed, setTestPassed] = useState(false);

  const connectionString = useMemo(() => {
    if (mode === "url") return rawUrl;
    if (!fields.host || !fields.database || !fields.username) return "";
    return assemblePostgresUrl(fields);
  }, [mode, rawUrl, fields]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const connection = await connectionsApi.create({ name, providerId: "postgresql", connectionString });
      setName("");
      setFields({ host: "", port: 5432, database: "", username: "", password: "", ssl: true });
      setRawUrl("");
      setTestPassed(false);
      onOpenChange(false);
      onCreated?.(connection.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create connection");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} panelClassName="max-w-xl max-h-[90vh] overflow-y-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-strong">New data source</p>
          <h2 className="mt-1 font-syne text-2xl font-semibold">Add connection</h2>
          <p className="mt-1 text-sm text-faint">Choose a database and enter its secure connection details.</p>
        </div>
        <Button type="button" variant="icon" aria-label="Close dialog" onClick={() => onOpenChange(false)}>
          <X />
        </Button>
      </div>

      <form onSubmit={submit} className="mt-6 flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted">Database type</label>
          <Select
            value="postgresql"
            onChange={() => {}}
            disabled
            options={[{ value: "postgresql", label: "PostgreSQL" }]}
          />
          <p className="text-xs text-faint">More database providers will be available later.</p>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="text-xs font-medium text-muted">Connection details</span>
          <ModeToggle mode={mode} onChange={(m) => { setMode(m); setTestPassed(false); }} />
        </div>

        <Input
          required
          label="Connection name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Production analytics"
        />

        {mode === "fields" ? (
          <ConnectionFormFields fields={fields} onChange={(f) => { setFields(f); setTestPassed(false); }} />
        ) : (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted">Connection URL</label>
            <div className="relative flex items-center">
              <input
                required
                type={showUrl ? "text" : "password"}
                value={rawUrl}
                onChange={(e) => { setRawUrl(e.target.value); setTestPassed(false); }}
                placeholder="postgresql://user:password@host:5432/database"
                className="w-full rounded-md border border-border bg-surface pl-3 pr-10 py-2.5 font-mono text-xs text-text placeholder:text-faint focus:border-border-2 focus:outline-none"
                autoComplete="off"
              />
              <button
                type="button"
                aria-label={showUrl ? "Hide URL" : "Show URL"}
                onClick={() => setShowUrl(!showUrl)}
                className="absolute right-3 flex h-full items-center text-faint hover:text-text focus:outline-none"
              >
                {showUrl ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <p className="text-xs text-faint">Credentials are encrypted and never shown again.</p>
          </div>
        )}

        <TestConnectionButton
          connectionString={connectionString}
          onTestResult={(success) => setTestPassed(success)}
        />

        {error ? (
          <p className="rounded-md border border-danger/25 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {testPassed ? "Save connection" : "Connect database"} <ArrowRight />
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-faint">{label}</dt>
      <dd className="max-w-[60%] break-words text-right font-mono text-[11px] text-text">{value}</dd>
    </div>
  );
}

function ConnectionCard({
  connection,
  expanded,
  onToggle,
  onRefresh,
  onDelete,
  refreshing,
  deleting,
}: {
  connection: ConnectionListItem;
  expanded: boolean;
  onToggle: () => void;
  onRefresh: () => void;
  onDelete: () => void;
  refreshing: boolean;
  deleting: boolean;
}) {
  const schemaStatus = getIngestionStatusView(connection.schemaSyncStatus);
  const needsAttention = connection.status === "error" || schemaStatus.tone === "danger";
  return (
    <div
      className={`overflow-hidden rounded-2xl border bg-surface transition-all duration-200 ${
        expanded ? "border-accent-line shadow-[0_0_0_3px_var(--accent-soft)]" : "border-border hover:border-border-2"
      }`}
    >
      <div className="flex items-center gap-3.5 p-4">
        <PostgresMark />
        <button type="button" className="min-w-0 flex-1 cursor-pointer text-left" onClick={onToggle} aria-expanded={expanded}>
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate font-syne text-[15px] font-semibold text-text">{connection.name}</span>
            <span className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-faint">postgres</span>
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <StatusInline tone={statusVariant(connection.status)} label={connection.status.replaceAll("_", " ")} />
            <StatusInline
              tone={schemaStatus.tone}
              label={`schema ${schemaStatus.label.toLowerCase()}`}
              pulse={!schemaStatus.terminal}
            />
            <span className="whitespace-nowrap font-mono text-[10.5px] text-faint">synced {formatRelativeTime(connection.lastSchemaSyncAt)}</span>
          </span>
        </button>
        <div className="hidden items-center gap-1.5 sm:flex">
          {needsAttention ? (
            <Link
              href={`/connections/${connection.id}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-danger/30 bg-danger/5 px-3 text-xs font-semibold text-danger no-underline transition-colors hover:bg-danger/10"
            >
              <AlertTriangle className="size-3" />
              Fix
            </Link>
          ) : (
            <Link
              href={`/connections/${connection.id}/schema`}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-muted no-underline transition-colors hover:border-accent-line hover:text-text"
            >
              <Table2 className="size-3.5" />
              Schema
            </Link>
          )}
          <button
            type="button"
            title="Refresh schema"
            aria-label={`Refresh ${connection.name}`}
            disabled={refreshing}
            onClick={onRefresh}
            className="flex size-8 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:border-border-2 hover:text-text disabled:opacity-60"
          >
            {refreshing ? <Spinner size="sm" /> : <RefreshCw className="size-3.5" />}
          </button>
          <button
            type="button"
            title="Delete connection"
            aria-label={`Delete ${connection.name}`}
            disabled={deleting}
            onClick={onDelete}
            className="flex size-8 items-center justify-center rounded-lg border border-border text-faint transition-colors hover:border-danger/40 hover:bg-danger/5 hover:text-danger disabled:opacity-60"
          >
            {deleting ? <Spinner size="sm" /> : <Trash2 className="size-3.5" />}
          </button>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-label={expanded ? "Collapse" : "Expand"}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-faint transition-colors hover:bg-surface-2 hover:text-text"
        >
          <ChevronDown className={`size-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>

      {expanded ? (
        <div className="animate-fade-in border-t border-border bg-surface-2/60 p-4 sm:p-5">
          <dl className="grid grid-cols-1 gap-x-10 gap-y-2.5 text-xs sm:grid-cols-2">
            <DetailRow label="Host" value={`${connection.hostDisplay}${connection.port ? `:${connection.port}` : ""}`} />
            <DetailRow label="Schema status" value={<SchemaStatus value={connection.schemaSyncStatus} />} />
            <DetailRow label="Readiness" value={schemaStatus.description} />
            <DetailRow label="Database" value={connection.databaseName} />
            <DetailRow label="Last tested" value={formatRelativeTime(connection.lastTestedAt)} />
            <DetailRow label="Provider" value="PostgreSQL" />
            <DetailRow label="Capabilities" value={connection.capabilities.length ? connection.capabilities.length : "None reported"} />
          </dl>
          <div className="mt-4 flex gap-2 border-t border-dashed border-border-2 pt-3 sm:hidden">
            <Button type="button" size="sm" variant="ghost" loading={refreshing} onClick={onRefresh}><RefreshCw />Refresh</Button>
            <Button type="button" size="sm" variant="danger" loading={deleting} onClick={onDelete}><Trash2 />Delete</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ConnectionsPageSkeleton() {
  return (
    <div className="min-h-screen" aria-label="Loading connections" aria-busy="true">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-10 w-36" />
        </header>
        <div className="mt-6 flex flex-wrap gap-2">
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-8 w-28 rounded-full" />
          <Skeleton className="h-8 w-24 rounded-full" />
        </div>
        <div className="mt-5 flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="flex min-h-[76px] items-center gap-3.5 rounded-2xl border border-border bg-surface p-4">
              <Skeleton className="size-10 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><Skeleton className="h-4 w-36" /><Skeleton className="h-4 w-14" /></div>
                <div className="mt-2 flex gap-3"><Skeleton className="h-3 w-20" /><Skeleton className="h-3 w-28" /><Skeleton className="hidden h-3 w-24 sm:block" /></div>
              </div>
              <div className="hidden gap-2 sm:flex"><Skeleton className="h-8 w-20" /><Skeleton className="size-8" /><Skeleton className="size-8" /></div>
              <Skeleton className="size-8 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ConnectionDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeaderSkeleton actions={3} announce={false} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="flex flex-col gap-5 p-5">
          <Skeleton className="h-5 w-44" />
          <div className="grid gap-5 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex flex-col gap-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-36" />
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-4"><Skeleton className="mb-3 h-5 w-20" /><SchemaBrowserSkeleton rows={5} /></Card>
      </div>
    </div>
  );
}

export function ConnectionsListView() {
  const resource = useApiResource((signal) => connectionsApi.list(50, undefined, signal));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ConnectionListItem | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const refreshConnections = resource.refresh;
  const items = useMemo(() => resource.data?.items ?? [], [resource.data?.items]);

  const stats = useMemo(() => {
    const active = items.filter((item) => item.status === "connected" && getIngestionStatusView(item.schemaSyncStatus).ready).length;
    const attention = items.filter((item) => item.status === "error" || getIngestionStatusView(item.schemaSyncStatus).tone === "danger").length;
    return { active, attention, total: items.length };
  }, [items]);

  useEffect(() => {
    if (!items.some((item) => !getIngestionStatusView(item.schemaSyncStatus).terminal)) return;
    const timer = window.setInterval(() => void refreshConnections(), 5000);
    return () => window.clearInterval(timer);
  }, [items, refreshConnections]);

  async function refreshSchema(connectionId: string) {
    setRefreshingId(connectionId);
    setNotice(null);
    try {
      await connectionsApi.refreshSchema(connectionId);
      await resource.refresh();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Unable to refresh schema");
    } finally {
      setRefreshingId(null);
    }
  }

  async function confirmDeleteConnection() {
    const connection = deleteTarget;
    if (!connection) return;
    setDeletingId(connection.id);
    setNotice(null);
    try {
      await connectionsApi.remove(connection.id);
      setExpandedId((current) => (current === connection.id ? null : current));
      setDeleteTarget(null);
      setNotice("Connection deleted.");
      await resource.refresh();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Unable to delete connection");
    } finally {
      setDeletingId(null);
    }
  }

  if (resource.loading && !resource.data) return <ConnectionsPageSkeleton />;
  if (resource.error && !resource.data) return <div className="p-4 sm:p-6"><ErrorState error={resource.error} onRetry={() => void resource.refresh()} /></div>;

  return (
    <div className="min-h-screen">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="mt-1.5 font-syne text-3xl font-semibold tracking-tight text-text">Connections</h1>
          </div>
          <Button type="button" onClick={() => setDialogOpen(true)}><Plus className="size-4" />Add connection</Button>
        </header>

        {!items.length ? (
          <div className="mt-8">
            <EmptyState title="No connections yet" description="Add a PostgreSQL connection to start asking questions about your data." action={<Button onClick={() => setDialogOpen(true)}><Plus />Add connection</Button>} />
          </div>
        ) : (
          <>
            {notice ? <p className="mt-4 rounded-lg border border-border bg-surface px-3 py-2 text-sm">{notice}</p> : null}

            {/* health strip */}
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 font-mono text-[11px] text-muted">
                <Database className="size-3 text-accent-strong" />
                {stats.total} {stats.total === 1 ? "source" : "sources"}
              </span>
              <span className="flex items-center gap-1.5 rounded-full border border-accent-line bg-accent-soft px-3 py-1.5 font-mono text-[11px] text-accent-strong">
                <span className="size-1.5 rounded-full bg-accent" />
                {stats.active} query-ready
              </span>
              {stats.attention > 0 ? (
                <span className="flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-3 py-1.5 font-mono text-[11px] text-warning">
                  <AlertTriangle className="size-3" />
                  {stats.attention} {stats.attention === 1 ? "needs" : "need"} attention
                </span>
              ) : (
                <span className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 font-mono text-[11px] text-faint">
                  <Check className="size-3 text-accent-strong" />
                  all healthy
                </span>
              )}
            </div>

            <div className="mt-5 flex flex-col gap-3">
              {items.map((connection) => (
                <ConnectionCard
                  key={connection.id}
                  connection={connection}
                  expanded={expandedId === connection.id}
                  onToggle={() => setExpandedId((current) => (current === connection.id ? null : connection.id))}
                  onRefresh={() => void refreshSchema(connection.id)}
                  onDelete={() => setDeleteTarget(connection)}
                  refreshing={refreshingId === connection.id}
                  deleting={deletingId === connection.id}
                />
              ))}
            </div>

          </>
        )}
      </div>
      <AddConnectionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={(connectionId) => {
          setExpandedId(connectionId);
          void resource.refresh();
        }}
      />
      <ConnectionDeleteDialog
        open={Boolean(deleteTarget)}
        connectionId={deleteTarget?.id ?? null}
        connectionName={deleteTarget?.name ?? ""}
        deleting={Boolean(deletingId)}
        onConfirm={() => void confirmDeleteConnection()}
        onOpenChange={(nextOpen) => { if (!nextOpen && !deletingId) setDeleteTarget(null); }}
      />
    </div>
  );
}

export function NewConnectionView() {
  const router = useRouter();
  return <div className="mx-auto max-w-2xl"><AddConnectionDialog open onOpenChange={(open) => { if (!open) router.push("/connections"); }} onCreated={(connectionId) => router.push(`/connections/${connectionId}`)} /></div>;
}

export function ConnectionDetailView({ connectionId }: { connectionId: string }) {
  const router = useRouter();
  const connection = useApiResource((signal) => connectionsApi.get(connectionId, signal), connectionId);
  const schema = useApiResource((signal) => connectionsApi.schema(connectionId, signal), connectionId);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  if (connection.loading) return <ConnectionDetailSkeleton />;
  if (connection.error || !connection.data) return <ErrorState error={connection.error ?? new Error("Connection not found")} onRetry={() => void connection.refresh()} />;
  const item = connection.data;
  const act = async (key: string, action: () => Promise<unknown>, message: string) => { setBusy(key); setNotice(null); try { await action(); setNotice(message); await connection.refresh(); await schema.refresh(); } catch (reason) { setNotice(reason instanceof Error ? reason.message : "Action failed"); } finally { setBusy(null); } };
  return <div className="space-y-6"><PageHeader eyebrow="Connection" title={item.name} description={`${item.hostDisplay}${item.port ? `:${item.port}` : ""} / ${item.databaseName}`} actions={<><Button variant="ghost" loading={busy === "test"} onClick={() => void act("test", () => connectionsApi.test(connectionId), "Connection test completed.")}><TestTube2 className="h-4 w-4" />Test</Button><Button variant="ghost" loading={busy === "refresh"} onClick={() => void act("refresh", () => connectionsApi.refreshSchema(connectionId), "Schema refresh queued.")}><RefreshCw className="h-4 w-4" />Refresh schema</Button><Button variant="danger" loading={busy === "delete"} onClick={() => setDeleteOpen(true)}><Trash2 className="h-4 w-4" />Delete</Button></>} />{notice ? <p className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">{notice}</p> : null}<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]"><Card className="p-5"><h2 className="font-syne text-lg font-semibold">Safe connection metadata</h2><dl className="mt-4 grid gap-4 sm:grid-cols-2">{[["Provider", item.providerId], ["Status", item.status], ["Schema sync", item.schemaSyncStatus], ["Last tested", item.lastTestedAt ? new Date(item.lastTestedAt).toLocaleString() : "Never"], ["Last schema sync", item.lastSchemaSyncAt ? new Date(item.lastSchemaSyncAt).toLocaleString() : "Never"], ["Capabilities", item.capabilities.join(", ") || "None reported"]].map(([label, value]) => <div key={label}><dt className="text-xs uppercase tracking-wide text-faint">{label}</dt><dd className="mt-1 text-sm">{value}</dd></div>)}</dl></Card><Card className="p-4"><h2 className="mb-3 font-syne text-lg font-semibold">Schema</h2>{schema.loading && !schema.data ? <SchemaBrowserSkeleton rows={5} /> : schema.error ? <ErrorState error={schema.error} onRetry={() => void schema.refresh()} /> : <SchemaBrowser metadata={schema.data?.metadata ?? null} />}</Card></div><ConnectionDeleteDialog open={deleteOpen} connectionId={connectionId} connectionName={item.name} deleting={busy === "delete"} onConfirm={() => void act("delete", async () => { await connectionsApi.remove(connectionId); router.push("/connections"); }, "Connection deleted.")} onOpenChange={(nextOpen) => { if (!nextOpen && busy !== "delete") setDeleteOpen(false); }} /></div>;
}
