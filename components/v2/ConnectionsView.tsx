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
  Layers,
  Loader2,
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
import { EmptyState, ErrorState, LoadingState } from "@/components/v2/ResourceState";
import { PageHeader } from "@/components/v2/PageHeader";
import { SchemaBrowser } from "@/components/v2/SchemaBrowser";
import { useApiResource } from "@/hooks/v2";
import { formatRelativeTime } from "@/lib/utils";
import { connectionsApi, getIngestionStatusView } from "@/lib/v2/api-client";
import type { ConnectionListItem } from "@/lib/v2/api-client";
import { assemblePostgresUrl } from "@/lib/v2/connections/assemble-url";

function statusVariant(value: string) {
  return value === "connected" || value === "ready" ? "success" : value === "error" ? "danger" : "warning";
}

function Status({ value }: { value: string }) {
  return <Badge variant={statusVariant(value)}>{value.replaceAll("_", " ")}</Badge>;
}

function SchemaStatus({ value }: { value: string }) {
  const status = getIngestionStatusView(value);
  return <Badge variant={status.tone}>{status.label}</Badge>;
}

function PostgresMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-lg border border-border bg-accent-dim ${compact ? "size-8" : "size-11"}`}>
      <img src="/icons/postgresql.svg" alt="PostgreSQL" className={compact ? "size-5" : "size-6"} />
    </span>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: typeof Database;
  label: string;
  value: string | number;
  hint: string;
  tone?: "default" | "warning";
}) {
  const dotClass = tone === "warning" ? "bg-warning" : "bg-success";
  const iconWrap = tone === "warning" ? "bg-warning/15 text-warning" : "bg-accent-dim text-accent-2";
  return (
    <Card className="flex items-center gap-3 p-4" hoverable>
      <span className={`inline-flex size-11 shrink-0 items-center justify-center rounded-xl ${iconWrap}`}>
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs text-text-3">{label}</p>
        <p className="font-syne text-2xl font-semibold leading-tight">{value}</p>
        <p className="mt-0.5 inline-flex items-center gap-1.5 text-[11px] text-text-3">
          <span className={`size-1.5 rounded-full ${dotClass}`} />
          {hint}
        </p>
      </div>
    </Card>
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
      const data = (await res.json()) as { success: boolean; error?: string };
      const latencyMs = Date.now() - start;
      if (data.success) {
        setTestState({ status: "success", latencyMs });
        onTestResult(true);
      } else {
        setTestState({ status: "error", message: data.error ?? "Connection failed" });
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
          <Loader2 className="size-4 animate-spin" />
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
              ? "bg-accent-dim text-accent-2 shadow-sm"
              : "text-text-3 hover:text-text-1"
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
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <Input
          required
          label="Host"
          value={fields.host}
          onChange={(e) => set("host", e.target.value)}
          placeholder="db.example.com"
        />
        <Input
          required
          label="Port"
          type="number"
          value={String(fields.port)}
          onChange={(e) => set("port", Number(e.target.value))}
          className="w-24"
        />
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
      <p className="text-xs text-text-3">Credentials are encrypted and never shown again.</p>
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
    <Dialog open={open} onOpenChange={onOpenChange} panelClassName="max-w-xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-2">New data source</p>
          <h2 className="mt-1 font-syne text-2xl font-semibold">Add connection</h2>
          <p className="mt-1 text-sm text-text-3">Choose a database and enter its secure connection details.</p>
        </div>
        <Button type="button" variant="icon" aria-label="Close dialog" onClick={() => onOpenChange(false)}>
          <X />
        </Button>
      </div>

      <form onSubmit={submit} className="mt-6 flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-text-2">Database type</label>
          <Select
            value="postgresql"
            onChange={() => {}}
            disabled
            options={[{ value: "postgresql", label: "PostgreSQL — Connect using a PostgreSQL connection string" }]}
          />
          <p className="text-xs text-text-3">More database providers will be available later.</p>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="text-xs font-medium text-text-2">Connection details</span>
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
            <label className="text-xs font-medium text-text-2">Connection URL</label>
            <textarea
              required
              value={rawUrl}
              onChange={(e) => { setRawUrl(e.target.value); setTestPassed(false); }}
              placeholder="postgresql://user:password@host:5432/database"
              rows={3}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs text-text-1 placeholder:text-text-3 focus:border-border-2 focus:outline-none resize-none"
              autoComplete="off"
            />
            <p className="text-xs text-text-3">Credentials are encrypted and never shown again.</p>
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
      <dt className="text-text-3">{label}</dt>
      <dd className="max-w-[60%] break-words text-right font-medium">{value}</dd>
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
    <Card className={`overflow-hidden transition-all ${expanded ? "border-accent" : ""}`} hoverable={!expanded}>
      <div className="flex items-center gap-3 p-4">
        <PostgresMark />
        <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={onToggle} aria-expanded={expanded}>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="truncate font-syne text-base font-semibold">{connection.name}</span>
              <span className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-3">PostgreSQL</span>
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-3">
              <Status value={connection.status} />
              <span className="inline-flex items-center gap-1.5"><Table2 className="size-3.5" /><SchemaStatus value={connection.schemaSyncStatus} /></span>
              <span className="inline-flex items-center gap-1.5"><RefreshCw className="size-3.5" />Last synced {formatRelativeTime(connection.lastSchemaSyncAt)}</span>
            </span>
          </span>
        </button>
        <div className="hidden items-center gap-2 sm:flex">
          {needsAttention ? (
            <Link href={`/connections/${connection.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-danger hover:bg-danger/10">
              Fix
            </Link>
          ) : (
            <Link href={`/connections/${connection.id}/schema`} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium hover:bg-surface-2">
              <Table2 className="size-3.5" />Open schema
            </Link>
          )}
          <Button type="button" size="sm" variant="ghost" loading={refreshing} onClick={onRefresh}><RefreshCw />Refresh</Button>
          <Button type="button" size="sm" variant="danger" loading={deleting} onClick={onDelete} aria-label={`Delete ${connection.name}`}>
            <Trash2 />Delete
          </Button>
        </div>
        <button type="button" onClick={onToggle} aria-label={expanded ? "Collapse" : "Expand"} className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-text-3 hover:bg-surface-2 hover:text-text-1">
          <ChevronDown className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>

      {expanded ? (
        <div className="animate-fade-in border-t border-border bg-surface-2/60 p-4 sm:p-5">
          <dl className="grid grid-cols-1 gap-x-10 gap-y-3 text-xs sm:grid-cols-2">
            <DetailRow label="Host" value={`${connection.hostDisplay}${connection.port ? `:${connection.port}` : ""}`} />
            <DetailRow label="Schema status" value={<SchemaStatus value={connection.schemaSyncStatus} />} />
            <DetailRow label="Readiness" value={schemaStatus.description} />
            <DetailRow label="Database" value={connection.databaseName} />
            <DetailRow label="Last tested" value={formatRelativeTime(connection.lastTestedAt)} />
            <DetailRow label="Provider" value="PostgreSQL" />
            <DetailRow label="Capabilities" value={connection.capabilities.length ? connection.capabilities.length : "None reported"} />
          </dl>
        </div>
      ) : null}
    </Card>
  );
}

export function ConnectionsListView() {
  const resource = useApiResource(() => connectionsApi.list(50), []);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
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

  async function deleteConnection(connection: ConnectionListItem) {
    const confirmed = window.confirm(`Delete "${connection.name}"? This removes saved credentials and hides the connection from new chats.`);
    if (!confirmed) return;
    setDeletingId(connection.id);
    setNotice(null);
    try {
      await connectionsApi.remove(connection.id);
      setExpandedId((current) => (current === connection.id ? null : current));
      setNotice("Connection deleted.");
      await resource.refresh();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Unable to delete connection");
    } finally {
      setDeletingId(null);
    }
  }

  if (resource.loading && !resource.data) return <div className="p-4 sm:p-6"><LoadingState label="Loading connections" /></div>;
  if (resource.error && !resource.data) return <div className="p-4 sm:p-6"><ErrorState error={resource.error} onRetry={() => void resource.refresh()} /></div>;

  return (
    <div className="min-h-screen">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <PageHeader
          title="Connections"
          description="Connect databases and manage schema syncs."
          actions={<Button type="button" onClick={() => setDialogOpen(true)}><Plus />Add connection</Button>}
        />

        {!items.length ? (
          <div className="mt-8">
            <EmptyState title="No connections yet" description="Add a PostgreSQL connection to start asking questions about your data." action={<Button onClick={() => setDialogOpen(true)}><Plus />Add connection</Button>} />
          </div>
        ) : (
          <>
            {notice ? <p className="mt-4 rounded-lg border border-border bg-surface px-3 py-2 text-sm">{notice}</p> : null}
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <StatCard icon={Database} label="Query-ready connections" value={stats.active} hint="Schema ready" />
              <StatCard icon={AlertTriangle} label="Need attention" value={stats.attention} hint={stats.attention ? "Action required" : "All healthy"} tone={stats.attention ? "warning" : "default"} />
              <StatCard icon={Layers} label="Total sources" value={stats.total} hint="Across all connections" />
            </div>

            <div className="mt-8 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Your data sources</h2>
              <span className="text-xs text-text-3">{items.length} data source{items.length === 1 ? "" : "s"}</span>
            </div>

            <div className="mt-3 flex flex-col gap-3">
              {items.map((connection) => (
                <ConnectionCard
                  key={connection.id}
                  connection={connection}
                  expanded={expandedId === connection.id}
                  onToggle={() => setExpandedId((current) => (current === connection.id ? null : connection.id))}
                  onRefresh={() => void refreshSchema(connection.id)}
                  onDelete={() => void deleteConnection(connection)}
                  refreshing={refreshingId === connection.id}
                  deleting={deletingId === connection.id}
                />
              ))}

              <button
                type="button"
                onClick={() => setDialogOpen(true)}
                className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border-2 bg-surface/40 px-4 py-3.5 text-sm font-medium text-accent-2 transition hover:border-accent hover:bg-accent-dim"
              >
                <Plus className="size-4" />Add another source
              </button>
            </div>

            <div className="mt-8 flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-text-2">Supported sources</span>
                <span className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-xs"><Database className="size-4 text-accent-2" />PostgreSQL</span>
              </div>
              <div className="inline-flex items-start gap-2 text-xs text-text-3">
                <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-accent-2" />
                <span className="max-w-md">QueryWise auto-analyzes tables, columns, relationships, and sample values on every sync.</span>
              </div>
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
    </div>
  );
}

export function NewConnectionView() {
  const router = useRouter();
  return <div className="mx-auto max-w-2xl"><AddConnectionDialog open onOpenChange={(open) => { if (!open) router.push("/connections"); }} onCreated={(connectionId) => router.push(`/connections/${connectionId}`)} /></div>;
}

export function ConnectionDetailView({ connectionId }: { connectionId: string }) {
  const router = useRouter();
  const connection = useApiResource(() => connectionsApi.get(connectionId), [connectionId]);
  const schema = useApiResource(() => connectionsApi.schema(connectionId), [connectionId]);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  if (connection.loading) return <LoadingState label="Loading connection" />;
  if (connection.error || !connection.data) return <ErrorState error={connection.error ?? new Error("Connection not found")} onRetry={() => void connection.refresh()} />;
  const item = connection.data;
  const act = async (key: string, action: () => Promise<unknown>, message: string) => { setBusy(key); setNotice(null); try { await action(); setNotice(message); await connection.refresh(); await schema.refresh(); } catch (reason) { setNotice(reason instanceof Error ? reason.message : "Action failed"); } finally { setBusy(null); } };
  return <div className="space-y-6"><PageHeader eyebrow="Connection" title={item.name} description={`${item.hostDisplay}${item.port ? `:${item.port}` : ""} / ${item.databaseName}`} actions={<><Button variant="ghost" loading={busy === "test"} onClick={() => void act("test", () => connectionsApi.test(connectionId), "Connection test completed.")}><TestTube2 className="h-4 w-4" />Test</Button><Button variant="ghost" loading={busy === "refresh"} onClick={() => void act("refresh", () => connectionsApi.refreshSchema(connectionId), "Schema refresh queued.")}><RefreshCw className="h-4 w-4" />Refresh schema</Button><Button variant="danger" loading={busy === "delete"} onClick={() => void act("delete", async () => { await connectionsApi.remove(connectionId); router.push("/connections"); }, "Connection deleted.")}><Trash2 className="h-4 w-4" />Delete</Button></>} />{notice ? <p className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">{notice}</p> : null}<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]"><Card className="p-5"><h2 className="font-syne text-lg font-semibold">Safe connection metadata</h2><dl className="mt-4 grid gap-4 sm:grid-cols-2">{[["Provider", item.providerId], ["Status", item.status], ["Schema sync", item.schemaSyncStatus], ["Last tested", item.lastTestedAt ? new Date(item.lastTestedAt).toLocaleString() : "Never"], ["Last schema sync", item.lastSchemaSyncAt ? new Date(item.lastSchemaSyncAt).toLocaleString() : "Never"], ["Capabilities", item.capabilities.join(", ") || "None reported"]].map(([label, value]) => <div key={label}><dt className="text-xs uppercase tracking-wide text-text-3">{label}</dt><dd className="mt-1 text-sm">{value}</dd></div>)}</dl></Card><Card className="p-4"><h2 className="mb-3 font-syne text-lg font-semibold">Schema</h2>{schema.loading ? <LoadingState label="Loading schema" /> : schema.error ? <ErrorState error={schema.error} onRetry={() => void schema.refresh()} /> : <SchemaBrowser metadata={schema.data?.metadata ?? null} />}</Card></div></div>;
}
