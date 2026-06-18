"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { BarChart3, Plus, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DashboardGrid } from "@/components/v2/DashboardGrid";
import { PageHeader } from "@/components/v2/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/v2/ResourceState";
import { ShareDashboardModal } from "@/components/v2/ShareDashboardModal";
import { useApiResource } from "@/hooks/v2";
import { dashboardsApi } from "@/lib/v2/api-client";
import type { WidgetLayout } from "@/types/v2";

export function DashboardsListView() {
  const resource = useApiResource(() => dashboardsApi.list(50), []);
  const [name, setName] = useState(""); const [creating, setCreating] = useState(false); const [error, setError] = useState<string | null>(null);
  async function create(event: FormEvent) { event.preventDefault(); setCreating(true); setError(null); try { await dashboardsApi.create(name); setName(""); await resource.refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to create dashboard"); } finally { setCreating(false); } }
  return <div className="space-y-6"><PageHeader eyebrow="Collections" title="Dashboards" description="Durable snapshot dashboards you own or can view." /><Card className="p-4"><form onSubmit={create} className="flex flex-col gap-2 sm:flex-row"><Input required value={name} onChange={(event) => setName(event.target.value)} placeholder="New dashboard name" /><Button type="submit" loading={creating}><Plus className="h-4 w-4" />Create</Button></form>{error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}</Card>{resource.loading ? <LoadingState label="Loading dashboards" /> : resource.error ? <ErrorState error={resource.error} onRetry={() => void resource.refresh()} /> : !resource.data?.items.length ? <EmptyState title="No dashboards yet" description="Create a dashboard, then save query result snapshots from conversations." /> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{resource.data.items.map((dashboard) => <Link key={dashboard.id} href={`/dashboards/${dashboard.id}`}><Card hoverable className="p-4"><div className="flex items-center justify-between"><BarChart3 className="h-5 w-5 text-accent-2" /><span className="text-xs capitalize text-text-3">{dashboard.access}</span></div><h2 className="mt-4 font-syne text-lg font-semibold">{dashboard.name}</h2><p className="mt-1 text-xs text-text-3">{dashboard.widgetCount ?? 0} widgets · updated {new Date(dashboard.updatedAt).toLocaleDateString()}</p></Card></Link>)}</div>}</div>;
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
  return <div className="space-y-6"><PageHeader eyebrow={editor ? "Dashboard editor" : "Dashboard"} title={dashboard.name} description={`${dashboard.widgets.length} snapshot widgets · ${dashboard.access} access`} actions={<>{owner && !editor ? <Link href={`/dashboards/${dashboardId}/edit`} className="rounded-md border border-border bg-surface px-4 py-2 text-sm">Edit layout</Link> : null}{editor ? <Link href={`/dashboards/${dashboardId}`} className="rounded-md border border-border bg-surface px-4 py-2 text-sm">Done editing</Link> : null}{owner ? <Button onClick={() => setShareOpen(true)}><Share2 className="h-4 w-4" />Share</Button> : null}</>} />{error ? <p className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">{error}</p> : null}{!dashboard.widgets.length ? <EmptyState title="No widgets yet" description="Save a query result from a conversation to populate this dashboard." /> : <DashboardGrid widgets={dashboard.widgets} editable={editor && owner} busyWidget={busyWidget} onRemoveWidget={(widgetId) => void mutateWidget(widgetId, () => dashboardsApi.removeWidget(dashboardId, widgetId))} onPersistLayouts={persistLayouts} />}<ShareDashboardModal dashboardId={dashboardId} open={shareOpen} onOpenChange={setShareOpen} /></div>;
}
