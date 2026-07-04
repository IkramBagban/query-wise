"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useId, useState } from "react";
import { BarChart3, Pencil, Plus, Share2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardGrid, EditLayoutButton, WidgetCardSkeleton } from "@/components/DashboardGrid";
import { CardGridSkeleton } from "@/components/LoadingSkeletons";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, ErrorState } from "@/components/ResourceState";
import { ShareDashboardModal } from "@/components/ShareDashboardModal";
import { useApiResource } from "@/hooks";
import { dashboardsApi } from "@/lib/api-client";

function DashboardOwnerActions({
  dashboardId,
  dashboardName,
  onChanged,
  onDeleted,
}: {
  dashboardId: string;
  dashboardName: string;
  onChanged: () => Promise<unknown>;
  onDeleted: () => Promise<unknown> | void;
}) {
  const titleId = useId();
  const [mode, setMode] = useState<"rename" | "delete" | null>(null);
  const [name, setName] = useState(dashboardName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open(nextMode: "rename" | "delete") {
    setName(dashboardName);
    setError(null);
    setMode(nextMode);
  }

  async function rename(event: FormEvent) {
    event.preventDefault();
    const nextName = name.trim();
    if (!nextName || nextName === dashboardName) return;
    setBusy(true);
    setError(null);
    try {
      await dashboardsApi.update(dashboardId, nextName);
      await onChanged();
      setMode(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to rename dashboard");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await dashboardsApi.remove(dashboardId);
      await onDeleted();
      setMode(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to delete dashboard");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" variant="ghost" size="sm" aria-label={`Rename ${dashboardName}`} onClick={() => open("rename")}>
        <Pencil className="h-3.5 w-3.5" />
        Rename
      </Button>
      <Button type="button" variant="danger" size="sm" aria-label={`Delete ${dashboardName}`} onClick={() => open("delete")}>
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </Button>
      <Dialog open={mode !== null} onOpenChange={(openState) => { if (!openState && !busy) setMode(null); }} panelClassName="sm:max-w-md">
        <div role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <h2 id={titleId} className="font-syne text-xl font-semibold">
            {mode === "rename" ? "Rename dashboard" : "Delete dashboard"}
          </h2>
          {mode === "rename" ? (
            <form className="mt-4 space-y-4" onSubmit={rename}>
              <div>
                <label htmlFor={`${titleId}-name`} className="mb-1.5 block text-sm font-medium">Dashboard name</label>
                <Input id={`${titleId}-name`} autoFocus required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} />
              </div>
              {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" disabled={busy} onClick={() => setMode(null)}>Cancel</Button>
                <Button type="submit" loading={busy} disabled={!name.trim() || name.trim() === dashboardName}>Save</Button>
              </div>
            </form>
          ) : (
            <div className="mt-4 space-y-4">
              <p className="text-sm text-muted">Delete “{dashboardName}” and all of its widgets? This cannot be undone.</p>
              {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" disabled={busy} onClick={() => setMode(null)}>Cancel</Button>
                <Button type="button" variant="danger" loading={busy} onClick={() => void remove()}>Delete dashboard</Button>
              </div>
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
}

function DashboardPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-3 w-36" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28 rounded-md" />
          <Skeleton className="h-9 w-20 rounded-md" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="md:col-span-1">
          <WidgetCardSkeleton />
        </div>
        <div className="md:col-span-1">
          <WidgetCardSkeleton />
        </div>
        <div className="md:col-span-2">
          <WidgetCardSkeleton />
        </div>
      </div>
    </div>
  );
}

export function DashboardsListView() {
  const resource = useApiResource((signal) => dashboardsApi.list(50, undefined, signal));
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await dashboardsApi.create(name);
      setName("");
      await resource.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create dashboard");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Collections"
        title="Dashboards"
        description="Durable snapshot dashboards you own or can view."
      />
      <Card className="p-4">
        <form onSubmit={create} className="flex flex-col gap-2 sm:flex-row">
          <Input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="New dashboard name"
          />
          <Button type="submit" loading={creating}>
            <Plus className="h-4 w-4" />
            Create
          </Button>
        </form>
        {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
      </Card>
      {resource.loading && !resource.data ? (
        <CardGridSkeleton />
      ) : resource.error ? (
        <ErrorState error={resource.error} onRetry={() => void resource.refresh()} />
      ) : !resource.data?.items.length ? (
        <EmptyState
          title="No dashboards yet"
          description="Create a dashboard, then save query result snapshots from conversations."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {resource.data.items.map((dashboard) => (
              <Card key={dashboard.id} hoverable className="p-4">
                <Link href={`/dashboards/${dashboard.id}`} className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                <div className="flex items-center justify-between">
                  <BarChart3 className="h-5 w-5 text-accent-strong" />
                  <span className="text-xs capitalize text-faint">{dashboard.access}</span>
                </div>
                <h2 className="mt-4 font-syne text-lg font-semibold">{dashboard.name}</h2>
                <p className="mt-1 text-xs text-faint">
                  {dashboard.widgetCount ?? 0} widgets · updated{" "}
                  {new Date(dashboard.updatedAt).toLocaleDateString()}
                </p>
                </Link>
                {dashboard.access === "owner" ? (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
                    <DashboardOwnerActions
                      dashboardId={dashboard.id}
                      dashboardName={dashboard.name}
                      onChanged={resource.refresh}
                      onDeleted={resource.refresh}
                    />
                  </div>
                ) : null}
              </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export function DashboardDetailView({
  dashboardId,
  editor = false,
}: {
  dashboardId: string;
  editor?: boolean;
}) {
  const router = useRouter();
  const resource = useApiResource((signal) => dashboardsApi.get(dashboardId, signal), dashboardId);
  const [shareOpen, setShareOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(editor);
  const [busyWidget, setBusyWidget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasActiveLinks, setHasActiveLinks] = useState(false);

  if (resource.loading) return <DashboardPageSkeleton />;
  if (resource.error || !resource.data) {
    return (
      <ErrorState
        error={resource.error ?? new Error("Dashboard not found")}
        onRetry={() => void resource.refresh()}
      />
    );
  }

  const dashboard = resource.data;
  const owner = dashboard.access === "owner";

  async function mutateWidget(widgetId: string, action: () => Promise<unknown>) {
    setBusyWidget(widgetId);
    setError(null);
    try {
      await action();
      await resource.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update widget");
    } finally {
      setBusyWidget(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={isEditing ? "Dashboard editor" : "Dashboard"}
        title={dashboard.name}
        description={`${dashboard.widgets.length} snapshot widgets · ${dashboard.access} access`}
        actions={
          <>
            {owner ? (
              <EditLayoutButton
                isEditing={isEditing}
                onToggle={() => setIsEditing((v) => !v)}
              />
            ) : null}
            {owner ? (
              <DashboardOwnerActions
                dashboardId={dashboardId}
                dashboardName={dashboard.name}
                onChanged={resource.refresh}
                onDeleted={() => {
                  router.replace("/dashboards");
                  router.refresh();
                }}
              />
            ) : null}
            {owner ? (
              <div className="relative inline-flex">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShareOpen(true)}
                >
                  <Share2 className="h-3.5 w-3.5" />
                  Share
                </Button>
                {hasActiveLinks && (
                  <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-success ring-1 ring-bg" />
                )}
              </div>
            ) : null}
          </>
        }
      />
      {error ? (
        <p className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {!dashboard.widgets.length ? (
        <EmptyState
          title="No widgets yet"
          description="Save a query result from a conversation to populate this dashboard."
        />
      ) : (
        <DashboardGrid
          key={`${dashboardId}:${dashboard.widgets.map((widget) => widget.id).join(",")}`}
          widgets={dashboard.widgets}
          dashboardId={dashboardId}
          isEditing={isEditing && owner}
          busyWidget={busyWidget}
          onRemoveWidget={(widgetId) =>
            void mutateWidget(widgetId, () =>
              dashboardsApi.removeWidget(dashboardId, widgetId),
            )
          }
          onLayoutSaved={() => void resource.refresh()}
        />
      )}
      <ShareDashboardModal
        dashboardId={dashboardId}
        open={shareOpen}
        onOpenChange={setShareOpen}
        onActiveLinksChange={setHasActiveLinks}
      />
    </div>
  );
}
