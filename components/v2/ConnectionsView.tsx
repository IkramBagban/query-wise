"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Database, Plus, RefreshCw, TestTube2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState, LoadingState } from "@/components/v2/ResourceState";
import { PageHeader } from "@/components/v2/PageHeader";
import { SchemaBrowser } from "@/components/v2/SchemaBrowser";
import { useApiResource } from "@/hooks/v2";
import { connectionsApi } from "@/lib/v2/api-client";

function Status({ value }: { value: string }) {
  const color = value === "connected" || value === "ready" ? "bg-success" : value === "error" ? "bg-danger" : "bg-warning";
  return <span className="inline-flex items-center gap-1.5 text-xs capitalize"><span className={`h-2 w-2 rounded-full ${color}`} />{value}</span>;
}

export function ConnectionsListView() {
  const resource = useApiResource(() => connectionsApi.list(50), []);
  if (resource.loading) return <LoadingState label="Loading connections" />;
  if (resource.error) return <ErrorState error={resource.error} onRetry={() => void resource.refresh()} />;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Data sources" title="Connections" description="Manage saved PostgreSQL data sources without exposing stored credentials." actions={<Link href="/connections/new" className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium"><Plus className="h-4 w-4" />Add connection</Link>} />
      {!resource.data?.items.length ? <EmptyState title="No connections yet" description="Add a PostgreSQL connection to start a durable conversation." action={<Link href="/connections/new" className="rounded-md bg-accent px-4 py-2 text-sm font-medium">Add connection</Link>} /> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{resource.data.items.map((connection) => (
          <Link key={connection.id} href={`/connections/${connection.id}`} className="block">
            <Card hoverable className="h-full p-4"><div className="flex items-start justify-between gap-3"><Database className="h-5 w-5 text-accent-2" /><Status value={connection.status} /></div><h2 className="mt-4 font-syne text-lg font-semibold">{connection.name}</h2><p className="mt-1 truncate text-xs text-text-3">{connection.hostDisplay}{connection.port ? `:${connection.port}` : ""} / {connection.databaseName}</p><div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-text-3"><span>Schema</span><Status value={connection.schemaSyncStatus} /></div></Card>
          </Link>
        ))}</div>
      )}
    </div>
  );
}

export function NewConnectionView() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [connectionString, setConnectionString] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(null);
    try {
      const connection = await connectionsApi.create({ name, providerId: "postgresql", credential: { connectionString } });
      router.push(`/connections/${connection.id}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to create connection"); } finally { setSaving(false); }
  }
  return <div className="mx-auto max-w-2xl space-y-6"><PageHeader eyebrow="Connections" title="Add PostgreSQL connection" description="The credential is sent only on creation and will never be rendered again." /><Card className="p-5"><form onSubmit={submit} className="space-y-4"><Input required label="Connection name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Production analytics" /><Input required type="password" label="PostgreSQL connection string" monospace value={connectionString} onChange={(event) => setConnectionString(event.target.value)} placeholder="postgresql://..." autoComplete="off" />{error ? <p className="text-sm text-danger">{error}</p> : null}<div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button><Button type="submit" loading={saving}>Save connection</Button></div></form></Card></div>;
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
