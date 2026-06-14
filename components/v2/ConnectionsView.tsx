"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  Database,
  ExternalLink,
  Layers,
  Link2,
  MoreVertical,
  Pencil,
  Plus,
  RefreshCw,
  Table2,
  TestTube2,
  Trash2,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState, LoadingState } from "@/components/v2/ResourceState";
import { PageHeader } from "@/components/v2/PageHeader";
import { SchemaBrowser } from "@/components/v2/SchemaBrowser";
import { useApiResource } from "@/hooks/v2";
import { connectionsApi } from "@/lib/v2/api-client";
import type { ConnectionListItem } from "@/lib/v2/api-client";

function statusVariant(value: string) {
  return value === "connected" || value === "ready" ? "success" : value === "error" ? "danger" : "warning";
}

function Status({ value }: { value: string }) {
  return <Badge variant={statusVariant(value)}>{value.replaceAll("_", " ")}</Badge>;
}

function formatRelativeTime(value: string | null) {
  if (!value) return "Not synced yet";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return value.slice(0, 10);
  const diffMs = Date.now() - then;
  if (diffMs < 0) return "just now";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(value).toLocaleDateString();
}

function PostgresMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-lg border border-border bg-accent-dim text-accent-2 ${compact ? "size-8" : "size-11"}`}>
      <Database className={compact ? "size-4" : "size-5"} />
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
  const [connectionString, setConnectionString] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const connection = await connectionsApi.create({ name, providerId: "postgresql", connectionString });
      setName("");
      setConnectionString("");
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
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-xs font-medium text-text-2">Database</legend>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-accent bg-accent-dim p-3">
            <input className="sr-only" type="radio" name="provider" value="postgresql" checked readOnly />
            <PostgresMark />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">PostgreSQL</span>
              <span className="block text-xs text-text-3">Connect using a PostgreSQL connection URL</span>
            </span>
            <span className="inline-flex size-5 items-center justify-center rounded-full bg-accent text-text-1"><Check className="size-3.5" /></span>
          </label>
          <p className="text-xs text-text-3">More database providers will be available later.</p>
        </fieldset>

        <Input required label="Connection name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Production analytics" />
        <Input required type="password" label="Database credentials / URL" monospace value={connectionString} onChange={(event) => setConnectionString(event.target.value)} placeholder="postgresql://user:password@host:5432/database" autoComplete="off" />
        <p className="text-xs text-text-3">Credentials are encrypted when saved and are never shown again.</p>
        {error ? <p className="rounded-md border border-danger/25 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p> : null}

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" loading={saving}>Connect database <ArrowRight /></Button>
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
  refreshing,
}: {
  connection: ConnectionListItem;
  expanded: boolean;
  onToggle: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const needsAttention = connection.status === "error" || connection.schemaSyncStatus === "error";
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
              <span className="inline-flex items-center gap-1.5"><Table2 className="size-3.5" />Schema {connection.schemaSyncStatus}</span>
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
          <Link href={`/connections/${connection.id}`} aria-label={`Open ${connection.name}`} className="inline-flex size-8 items-center justify-center rounded-md border border-border text-text-3 hover:bg-surface-2 hover:text-text-1">
            <MoreVertical className="size-4" />
          </Link>
        </div>
        <button type="button" onClick={onToggle} aria-label={expanded ? "Collapse" : "Expand"} className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-text-3 hover:bg-surface-2 hover:text-text-1">
          <ChevronDown className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>

      {expanded ? (
        <div className="animate-fade-in border-t border-border bg-surface-2/60 p-4 sm:p-5">
          <dl className="grid grid-cols-1 gap-x-10 gap-y-3 text-xs sm:grid-cols-2">
            <DetailRow label="Host" value={`${connection.hostDisplay}${connection.port ? `:${connection.port}` : ""}`} />
            <DetailRow label="Schema status" value={<span className="capitalize">{connection.schemaSyncStatus}</span>} />
            <DetailRow label="Database" value={connection.databaseName} />
            <DetailRow label="Last tested" value={formatRelativeTime(connection.lastTestedAt)} />
            <DetailRow label="Provider" value="PostgreSQL" />
            <DetailRow label="Capabilities" value={connection.capabilities.length ? connection.capabilities.length : "None reported"} />
          </dl>
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <Link href={`/connections/${connection.id}/schema`} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium hover:bg-surface">
              <Table2 className="size-3.5" />Open schema
            </Link>
            <Button type="button" size="sm" variant="ghost" loading={refreshing} onClick={onRefresh}><RefreshCw />Refresh schema</Button>
            <Link href={`/connections/${connection.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium hover:bg-surface">
              <Pencil className="size-3.5" />Edit connection
            </Link>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

export function ConnectionsListView() {
  const resource = useApiResource(() => connectionsApi.list(50), []);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const items = resource.data?.items ?? [];

  const stats = useMemo(() => {
    const active = items.filter((item) => item.status === "connected").length;
    const attention = items.filter((item) => item.status === "error" || item.schemaSyncStatus === "error").length;
    return { active, attention, total: items.length };
  }, [items]);

  async function refreshSchema(connectionId: string) {
    setRefreshingId(connectionId);
    try {
      await connectionsApi.refreshSchema(connectionId);
      await resource.refresh();
    } finally {
      setRefreshingId(null);
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
          actions={<>
            <Button type="button" onClick={() => setDialogOpen(true)}><Plus />Add connection</Button>
            <Button type="button" variant="ghost" onClick={() => setDialogOpen(true)}><Link2 />Import URL</Button>
          </>}
        />

        {!items.length ? (
          <div className="mt-8">
            <EmptyState title="No connections yet" description="Add a PostgreSQL connection to start asking questions about your data." action={<Button onClick={() => setDialogOpen(true)}><Plus />Add connection</Button>} />
          </div>
        ) : (
          <>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <StatCard icon={Database} label="Active connections" value={stats.active} hint="Connected" />
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
                  refreshing={refreshingId === connection.id}
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
