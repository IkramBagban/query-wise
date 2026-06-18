"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { BarChart3, Link2, Plus, Share2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DashboardGrid } from "@/components/v2/DashboardGrid";
import { PageHeader } from "@/components/v2/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/v2/ResourceState";
import { useApiResource } from "@/hooks/v2";
import { dashboardsApi } from "@/lib/v2/api-client";
import type { WidgetLayout } from "@/types/v2";

export function DashboardsListView() {
  const resource = useApiResource(() => dashboardsApi.list(50), []);
  const [name, setName] = useState(""); const [creating, setCreating] = useState(false); const [error, setError] = useState<string | null>(null);
  async function create(event: FormEvent) { event.preventDefault(); setCreating(true); setError(null); try { await dashboardsApi.create(name); setName(""); await resource.refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to create dashboard"); } finally { setCreating(false); } }
  return <div className="space-y-6"><PageHeader eyebrow="Collections" title="Dashboards" description="Durable snapshot dashboards you own or can view." /><Card className="p-4"><form onSubmit={create} className="flex flex-col gap-2 sm:flex-row"><Input required value={name} onChange={(event) => setName(event.target.value)} placeholder="New dashboard name" /><Button type="submit" loading={creating}><Plus className="h-4 w-4" />Create</Button></form>{error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}</Card>{resource.loading ? <LoadingState label="Loading dashboards" /> : resource.error ? <ErrorState error={resource.error} onRetry={() => void resource.refresh()} /> : !resource.data?.items.length ? <EmptyState title="No dashboards yet" description="Create a dashboard, then save query result snapshots from conversations." /> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{resource.data.items.map((dashboard) => <Link key={dashboard.id} href={`/dashboards/${dashboard.id}`}><Card hoverable className="p-4"><div className="flex items-center justify-between"><BarChart3 className="h-5 w-5 text-accent-2" /><span className="text-xs capitalize text-text-3">{dashboard.access}</span></div><h2 className="mt-4 font-syne text-lg font-semibold">{dashboard.name}</h2><p className="mt-1 text-xs text-text-3">{dashboard.widgetCount ?? 0} widgets · updated {new Date(dashboard.updatedAt).toLocaleDateString()}</p></Card></Link>)}</div>}</div>;
}

function ShareControls({ dashboardId, open, onOpenChange }: { dashboardId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const shares = useApiResource(() => dashboardsApi.shares(dashboardId), [dashboardId]);
  const [password, setPassword] = useState(""); const [recipientEmail, setRecipientEmail] = useState(""); const [createdLink, setCreatedLink] = useState<string | null>(null); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  async function createLink() { setBusy(true); setError(null); try { const result = await dashboardsApi.createShare(dashboardId, { type: "link", ...(password ? { password } : {}) }); if (result.type === "link") setCreatedLink(`${window.location.origin}/shared/${result.link.token}`); setPassword(""); await shares.refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to create share"); } finally { setBusy(false); } }
  async function createGrant() { setBusy(true); setError(null); try { await dashboardsApi.createShare(dashboardId, { type: "grant", recipientEmail }); setRecipientEmail(""); await shares.refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to create share"); } finally { setBusy(false); } }
  const shareCount = (shares.data?.links.length ?? 0) + (shares.data?.grants.length ?? 0);
  return <Dialog open={open} onOpenChange={onOpenChange} panelClassName="max-w-2xl"><h2 className="font-syne text-xl font-semibold">Sharing controls</h2><p className="mt-1 text-sm text-text-3">Create an unlisted link, protect it with a password, or grant direct view access.</p><div className="mt-5 grid gap-3 sm:grid-cols-2"><Card className="p-3"><Input type="password" label="Optional link password" value={password} onChange={(event) => setPassword(event.target.value)} /><Button className="mt-3 w-full" loading={busy} onClick={() => void createLink()}><Link2 className="h-4 w-4" />Create link</Button></Card><Card className="p-3"><Input type="email" label="Recipient email" value={recipientEmail} onChange={(event) => setRecipientEmail(event.target.value)} /><Button className="mt-3 w-full" loading={busy} disabled={!recipientEmail} onClick={() => void createGrant()}><Share2 className="h-4 w-4" />Grant view access</Button></Card></div>{createdLink ? <Card className="mt-3 p-3"><p className="text-xs font-medium">New share link</p><a className="mt-1 block break-all text-xs text-accent-2 underline" href={createdLink}>{createdLink}</a><p className="mt-1 text-xs text-text-3">Store this link now. For security, its token cannot be shown again.</p></Card> : null}{error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}<div className="mt-5 space-y-2">{shares.loading ? <LoadingState label="Loading shares" /> : shares.error ? <ErrorState error={shares.error} onRetry={() => void shares.refresh()} /> : !shareCount ? <p className="rounded-lg border border-dashed border-border p-4 text-sm text-text-3">No active shares.</p> : <>{shares.data?.links.map((share) => <div key={share.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm"><div><p>Unlisted share link</p><p className="text-xs text-text-3">{share.passwordProtected ? "Password protected" : "No password"}{share.revokedAt ? " · revoked" : ""}</p></div><Button variant="danger" size="sm" onClick={() => void dashboardsApi.revokeShare(dashboardId, share.id).then(shares.refresh)}><Trash2 className="h-3.5 w-3.5" />Revoke</Button></div>)}{shares.data?.grants.map((share) => <div key={share.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm"><div><p>{share.recipient.kind === "user" ? "Direct user access" : "Pending email access"}</p><p className="text-xs text-text-3">View permission</p></div><Button variant="danger" size="sm" onClick={() => void dashboardsApi.revokeShare(dashboardId, share.id).then(shares.refresh)}><Trash2 className="h-3.5 w-3.5" />Revoke</Button></div>)}</>}</div></Dialog>;
}

export function DashboardDetailView({ dashboardId, editor = false }: { dashboardId: string; editor?: boolean }) {
  const resource = useApiResource(() => dashboardsApi.get(dashboardId), [dashboardId]);
  const [shareOpen, setShareOpen] = useState(false);
  const [busyWidget, setBusyWidget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (resource.loading) return <LoadingState label="Loading dashboard" />; if (resource.error || !resource.data) return <ErrorState error={resource.error ?? new Error("Dashboard not found")} onRetry={() => void resource.refresh()} />;
  const dashboard = resource.data; const owner = dashboard.access === "owner";
  async function mutateWidget(widgetId: string, action: () => Promise<unknown>) {
    setBusyWidget(widgetId); setError(null);
    try { await action(); await resource.refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update widget"); }
    finally { setBusyWidget(null); }
  }
  async function persistLayouts(widgets: Array<{ id: string; layout: WidgetLayout }>) {
    setError(null);
    try { await dashboardsApi.updateWidgetLayouts(dashboardId, widgets); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save layout"); throw reason; }
  }
  return <div className="space-y-6"><PageHeader eyebrow={editor ? "Dashboard editor" : "Dashboard"} title={dashboard.name} description={`${dashboard.widgets.length} snapshot widgets · ${dashboard.access} access`} actions={<>{owner && !editor ? <Link href={`/dashboards/${dashboardId}/edit`} className="rounded-md border border-border bg-surface px-4 py-2 text-sm">Edit layout</Link> : null}{editor ? <Link href={`/dashboards/${dashboardId}`} className="rounded-md border border-border bg-surface px-4 py-2 text-sm">Done editing</Link> : null}{owner ? <Button onClick={() => setShareOpen(true)}><Share2 className="h-4 w-4" />Share</Button> : null}</>} />{error ? <p className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">{error}</p> : null}{!dashboard.widgets.length ? <EmptyState title="No widgets yet" description="Save a query result from a conversation to populate this dashboard." /> : <DashboardGrid widgets={dashboard.widgets} editable={editor && owner} busyWidget={busyWidget} onRemoveWidget={(widgetId) => void mutateWidget(widgetId, () => dashboardsApi.removeWidget(dashboardId, widgetId))} onPersistLayouts={persistLayouts} />}<ShareControls dashboardId={dashboardId} open={shareOpen} onOpenChange={setShareOpen} /></div>;
}
