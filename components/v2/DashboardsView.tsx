"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { BarChart3, Plus, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardGrid, EditLayoutButton, WidgetCardSkeleton } from "@/components/v2/DashboardGrid";
import { PageHeader } from "@/components/v2/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/v2/ResourceState";
import { ShareDashboardModal } from "@/components/v2/ShareDashboardModal";
import { useApiResource } from "@/hooks/v2";
import { dashboardsApi } from "@/lib/v2/api-client";
import type { WidgetLayout } from "@/types/v2";

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
  const resource = useApiResource(() => dashboardsApi.list(50), []);
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
      {resource.loading ? (
        <LoadingState label="Loading dashboards" />
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
            <Link key={dashboard.id} href={`/dashboards/${dashboard.id}`}>
              <Card hoverable className="p-4">
                <div className="flex items-center justify-between">
                  <BarChart3 className="h-5 w-5 text-accent-2" />
                  <span className="text-xs capitalize text-text-3">{dashboard.access}</span>
                </div>
                <h2 className="mt-4 font-syne text-lg font-semibold">{dashboard.name}</h2>
                <p className="mt-1 text-xs text-text-3">
                  {dashboard.widgetCount ?? 0} widgets · updated{" "}
                  {new Date(dashboard.updatedAt).toLocaleDateString()}
                </p>
              </Card>
            </Link>
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
  const resource = useApiResource(() => dashboardsApi.get(dashboardId), [dashboardId]);
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
