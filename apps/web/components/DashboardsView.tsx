"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useId, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Check,
  LayoutDashboard,
  LayoutGrid,
  MoreHorizontal,
  Pencil,
  Plus,
  Share2,
  Snowflake,
  Trash2,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { DashboardGrid, WidgetCardSkeleton } from "@/components/DashboardGrid";
import { ModeBadge } from "@/components/dashboard/primitives";
import { EmptyState, ErrorState } from "@/components/ResourceState";
import { ShareDashboardModal } from "@/components/ShareDashboardModal";
import { useApiResource } from "@/hooks";
import { dashboardsApi } from "@/lib/api-client";
import type { WidgetMode } from "@query-wise/shared/types";

/* --------------------------------- Helpers -------------------------------- */

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Deterministic decorative bar heights derived from the dashboard id. */
function vizHeights(id: string, bars = 14): number[] {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const heights: number[] = [];
  for (let i = 0; i < bars; i += 1) {
    h = (h * 1664525 + 1013904223) >>> 0;
    heights.push(28 + (h % 64));
  }
  return heights;
}

function DashboardMiniViz({ id }: { id: string }) {
  const heights = vizHeights(id);
  const peak = heights.indexOf(Math.max(...heights));
  return (
    <div className="flex h-10 items-end gap-1" aria-hidden>
      {heights.map((value, i) => (
        <span
          key={i}
          className={`flex-1 rounded-t-[2px] transition-colors duration-200 ${
            i === peak ? "bg-accent" : "bg-accent/15 group-hover:bg-accent/30"
          }`}
          style={{ height: `${value}%`, transitionDelay: `${i * 12}ms` }}
        />
      ))}
    </div>
  );
}

/* ---------------------------- Owner actions menu --------------------------- */

function DashboardOwnerActions({
  dashboardId,
  dashboardName,
  onChanged,
  onDeleted,
  bordered = false,
}: {
  dashboardId: string;
  dashboardName: string;
  onChanged: () => Promise<unknown>;
  onDeleted: () => Promise<unknown> | void;
  bordered?: boolean;
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
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Options for ${dashboardName}`}
          className={`flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border text-faint transition-colors duration-150 hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
            bordered ? "border-border hover:border-border-2" : "border-transparent hover:border-border"
          }`}
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => open("rename")}>
            <Pencil className="size-3.5" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => open("delete")}>
            <Trash2 className="size-3.5" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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

/* -------------------------------- Skeletons ------------------------------- */

function DashboardListSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-start justify-between">
            <Skeleton className="size-9 rounded-xl" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
          <Skeleton className="mt-4 h-5 w-2/3" />
          <Skeleton className="mt-2 h-3 w-1/2" />
          <Skeleton className="mt-5 h-10 w-full rounded-md" />
        </div>
      ))}
    </div>
  );
}

function DashboardPageSkeleton() {
  return (
    <div className="space-y-4" aria-label="Loading dashboard" aria-busy="true">
      <header className="border-b border-border pb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-3 w-28" />
          <div className="flex gap-2"><Skeleton className="h-8 w-20" /><Skeleton className="size-8" /></div>
        </div>
        <div className="mt-5">
          <div className="flex items-center gap-3"><Skeleton className="h-8 w-56" /><Skeleton className="h-5 w-14" /></div>
          <Skeleton className="mt-3 h-3 w-28" />
        </div>
      </header>
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex gap-4"><Skeleton className="h-5 w-12" /><Skeleton className="h-5 w-20" /></div>
        <Skeleton className="h-5 w-24" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <WidgetCardSkeleton />
        <WidgetCardSkeleton />
        <div className="md:col-span-2">
          <WidgetCardSkeleton />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- List view -------------------------------- */

export function DashboardsListView() {
  const router = useRouter();
  const resource = useApiResource((signal) => dashboardsApi.list(50, undefined, signal));
  const titleId = useId();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [createMode, setCreateMode] = useState<WidgetMode>("live");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const items = resource.data?.items ?? [];
  const totalWidgets = items.reduce((sum, dashboard) => sum + (dashboard.widgetCount ?? 0), 0);

  function openCreate() {
    setName("");
    setCreateMode("live");
    setError(null);
    setCreateOpen(true);
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const created = await dashboardsApi.create(name.trim(), createMode);
      setCreateOpen(false);
      router.push(`/dashboards/${created.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create dashboard");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mt-1.5 font-syne text-3xl font-semibold tracking-tight text-text">Dashboards</h1>
          <p className="mt-1.5 text-sm text-faint">
            {resource.data
              ? <>{items.length} {items.length === 1 ? "dashboard" : "dashboards"} · {totalWidgets} {totalWidgets === 1 ? "widget" : "widgets"} · pinned from conversations</>
              : "Pinned answers, arranged your way."}
          </p>
        </div>
        <Button type="button" onClick={openCreate}>
          <Plus className="size-4" />
          New dashboard
        </Button>
      </header>

      {resource.loading && !resource.data ? (
        <DashboardListSkeleton />
      ) : resource.error && !resource.data ? (
        <ErrorState error={resource.error} onRetry={() => void resource.refresh()} />
      ) : !items.length ? (
        <EmptyState
          title="No dashboards yet"
          description="Create a dashboard, then pin query results from any conversation — live boards refresh on open, snapshots stay frozen."
          action={
            <Button type="button" onClick={openCreate}>
              <Plus className="size-4" />
              Create your first dashboard
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((dashboard) => {
            const owner = dashboard.access === "owner";
            return (
              <div
                key={dashboard.id}
                className="group relative rounded-2xl border border-border bg-surface p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-accent-line hover:shadow-[0_16px_36px_-20px_var(--accent-line)]"
              >
                <Link
                  href={`/dashboards/${dashboard.id}`}
                  aria-label={`Open ${dashboard.name}`}
                  className="absolute inset-0 z-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                />

                <div className="pointer-events-none relative z-[1]">
                  <div className="flex items-start justify-between">
                    <span className="flex size-9 items-center justify-center rounded-xl bg-accent-soft">
                      <LayoutDashboard className="size-4 text-accent-strong" strokeWidth={1.75} />
                    </span>
                    {/* space reserved for the kebab (owner) — shared badge for viewers */}
                    {!owner ? (
                      <span className="mr-9 rounded-full border border-border bg-surface-2 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-faint">
                        shared
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-4 flex items-center gap-1.5">
                    <h2 className="min-w-0 truncate font-syne text-lg font-semibold text-text">{dashboard.name}</h2>
                    <ArrowUpRight className="size-4 shrink-0 -translate-x-1 text-accent-strong opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100" strokeWidth={2} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-faint">
                    <ModeBadge mode={dashboard.mode} />
                    <span>
                      {dashboard.widgetCount ?? 0} {(dashboard.widgetCount ?? 0) === 1 ? "widget" : "widgets"} · updated {timeAgo(dashboard.updatedAt)}
                    </span>
                  </div>

                  <div className="mt-5">
                    <DashboardMiniViz id={dashboard.id} />
                  </div>
                </div>

                {owner ? (
                  <div className="absolute right-3 top-3 z-10">
                    <DashboardOwnerActions
                      dashboardId={dashboard.id}
                      dashboardName={dashboard.name}
                      onChanged={resource.refresh}
                      onDeleted={resource.refresh}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}

          {/* ghost create card */}
          <button
            type="button"
            onClick={openCreate}
            className="flex min-h-[176px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border-2 text-faint transition-all duration-200 hover:border-accent-line hover:bg-accent-soft/40 hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <span className="flex size-9 items-center justify-center rounded-xl border border-border bg-surface">
              <Plus className="size-4" />
            </span>
            <span className="text-sm font-medium">New dashboard</span>
          </button>
        </div>
      )}

      {/* create dialog */}
      <Dialog open={createOpen} onOpenChange={(openState) => { if (!creating) setCreateOpen(openState); }} panelClassName="sm:max-w-md">
        <div role="dialog" aria-modal="true" aria-labelledby={`${titleId}-create`}>
          <h2 id={`${titleId}-create`} className="font-syne text-xl font-semibold">New dashboard</h2>
          <p className="mt-1 text-sm text-muted">Name it after the team or the ritual — “Growth”, “Monday standup”.</p>
          <form className="mt-4 space-y-4" onSubmit={create}>
            <Input
              autoFocus
              required
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Dashboard name"
            />

            <fieldset className="space-y-2">
              <legend className="mb-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-faint">Dashboard type</legend>
              <div className="grid grid-cols-2 gap-2.5">
                {([
                  { key: "live", icon: Zap, title: "Live", blurb: "Widgets re-run on open & refresh. Always current." },
                  { key: "snapshot", icon: Snowflake, title: "Snapshot", blurb: "Frozen at pin time. A number you can trust to hold." },
                ] as const).map((option) => {
                  const active = createMode === option.key;
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setCreateMode(option.key)}
                      className={`group/opt relative overflow-hidden rounded-xl border p-3 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                        active
                          ? "border-accent-line bg-accent-soft shadow-[0_0_0_3px_var(--accent-soft)]"
                          : "border-border hover:border-border-2 hover:bg-surface-2/60"
                      }`}
                    >
                      <span className="flex items-center justify-between">
                        <span className={`flex size-8 items-center justify-center rounded-lg transition-colors ${active ? "bg-accent text-accent-ink" : "bg-surface-2 text-faint"}`}>
                          <Icon className="size-4" strokeWidth={2} />
                        </span>
                        {active ? <Check className="size-4 text-accent-strong" strokeWidth={2.5} /> : null}
                      </span>
                      <span className="mt-2.5 block font-syne text-sm font-semibold text-text">{option.title}</span>
                      <span className="mt-0.5 block text-[11.5px] leading-snug text-faint">{option.blurb}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-faint">You can switch this anytime from the dashboard header.</p>
            </fieldset>

            {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" disabled={creating} onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" loading={creating} disabled={!name.trim()}>Create dashboard</Button>
            </div>
          </form>
        </div>
      </Dialog>
    </div>
  );
}

/* ---------------------------- Inline editable title ------------------------ */

/**
 * Double-click the title to rename it in place (Enter/blur saves, Esc cancels).
 * No pencil, no dialog — the title itself is the control.
 */
function EditableTitle({
  name,
  canEdit,
  onSave,
}: {
  name: string;
  canEdit: boolean;
  onSave: (next: string) => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(name);
  }, [name, editing]);
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  async function commit() {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === name) {
      setDraft(name);
      return;
    }
    setSaving(true);
    try {
      await onSave(next);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        maxLength={120}
        aria-label="Dashboard name"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void commit();
          } else if (event.key === "Escape") {
            setDraft(name);
            setEditing(false);
          }
        }}
        className="min-w-0 max-w-full rounded-lg border border-accent-line bg-surface px-2 py-0.5 font-syne text-[22px] font-semibold tracking-tight text-text outline-none focus-visible:ring-2 focus-visible:ring-accent sm:text-[26px]"
      />
    );
  }

  return (
    <h1
      onDoubleClick={canEdit ? () => setEditing(true) : undefined}
      title={canEdit ? "Double-click to rename" : undefined}
      className={`group/title flex min-w-0 items-center gap-2.5 font-syne text-[22px] font-semibold tracking-tight text-text sm:text-[26px] ${canEdit ? "cursor-text" : ""}`}
    >
      <span className={`truncate border-b-2 border-transparent pb-0.5 transition-colors duration-200 ${canEdit ? "group-hover/title:border-accent-line" : ""}`}>
        {name}
      </span>
      {saving ? <Spinner size="sm" /> : null}
    </h1>
  );
}

/* ------------------------------- Detail view ------------------------------- */

export function DashboardDetailView({
  dashboardId,
}: {
  dashboardId: string;
  /** Kept for route compatibility; there is no separate edit mode anymore. */
  editor?: boolean;
}) {
  const router = useRouter();
  const resource = useApiResource((signal) => dashboardsApi.get(dashboardId, signal), dashboardId);
  const [shareOpen, setShareOpen] = useState(false);
  const [busyWidget, setBusyWidget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasActiveLinks, setHasActiveLinks] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Only blank the page before the first byte of data — refreshes keep the
  // current view on screen (this is what caused the skeleton flicker).
  if (resource.loading && !resource.data) return <DashboardPageSkeleton />;
  if (!resource.data) {
    return (
      <ErrorState
        error={resource.error ?? new Error("Dashboard not found")}
        onRetry={() => void resource.refresh()}
      />
    );
  }

  const dashboard = resource.data;
  const owner = dashboard.access === "owner";
  const refreshing = resource.loading;

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

  async function renameDashboard(next: string) {
    setError(null);
    try {
      await dashboardsApi.update(dashboardId, next);
      await resource.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to rename dashboard");
    }
  }

  async function deleteDashboard() {
    setDeleting(true);
    setError(null);
    try {
      await dashboardsApi.remove(dashboardId);
      router.replace("/dashboards");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to delete dashboard");
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <header className="border-b border-border pb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/dashboards"
            className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-faint no-underline transition-colors duration-150 hover:text-accent-strong"
          >
            <ArrowLeft className="size-3" strokeWidth={2} />
            All dashboards
          </Link>

          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              {owner ? (
                <div className="relative inline-flex">
                  <Button variant="ghost" size="sm" onClick={() => setShareOpen(true)}>
                    <Share2 className="h-3.5 w-3.5" />
                    Share
                  </Button>
                  {hasActiveLinks && (
                    <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-success ring-1 ring-bg" />
                  )}
                </div>
              ) : null}
              {owner ? (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    aria-label="Dashboard options"
                    className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border text-faint transition-colors duration-150 hover:border-border-2 hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <MoreHorizontal className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                      <Trash2 className="size-3.5" />
                      Delete dashboard
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 pt-1">
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <EditableTitle name={dashboard.name} canEdit={owner} onSave={renameDashboard} />
              <ModeBadge mode={dashboard.mode} />
              {owner && dashboard.connectionDeleted ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-warning">
                  <AlertTriangle className="size-2.5" strokeWidth={2} />
                  Data source removed
                </span>
              ) : null}
              {refreshing ? <Spinner size="sm" /> : null}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[11px] uppercase tracking-[0.1em] text-faint">
              <span className="inline-flex items-center gap-1.5 text-muted">
                <LayoutGrid className="size-3 text-faint" strokeWidth={2} />
                {dashboard.widgets.length} {dashboard.widgets.length === 1 ? "widget" : "widgets"}
              </span>
              <span aria-hidden className="h-3 w-px bg-border" />
              <span>{dashboard.access}</span>
            </div>
          </div>
        </div>
      </header>

      {error ? (
        <p className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {!dashboard.widgets.length ? (
        <EmptyState
          title="Nothing pinned yet"
          description="Ask a question in a conversation, then pin the answer — it lands here as a widget."
          action={
            <Button type="button" onClick={() => router.push("/chats")}>
              Ask a question
              <ArrowUpRight className="size-3.5" />
            </Button>
          }
        />
      ) : (
        <DashboardGrid
          key={`${dashboardId}:${dashboard.widgets.map((widget) => widget.id).join(",")}`}
          widgets={dashboard.widgets}
          dashboardId={dashboardId}
          canEdit={owner}
          busyWidget={busyWidget}
          canRefresh={owner}
          mode={dashboard.mode}
          refreshIntervalSeconds={dashboard.refreshIntervalSeconds}
          connectionDeleted={dashboard.access === "owner" ? dashboard.connectionDeleted : false}
          onRemoveWidget={(widgetId) =>
            void mutateWidget(widgetId, () =>
              dashboardsApi.removeWidget(dashboardId, widgetId),
            )
          }
          onRenameWidget={(widgetId, title) =>
            mutateWidget(widgetId, () => dashboardsApi.updateWidget(dashboardId, widgetId, { title }))
          }
          onLayoutSaved={() => void resource.refresh()}
        />
      )}

      <ShareDashboardModal
        dashboardId={dashboardId}
        dashboardMode={dashboard.mode}
        open={shareOpen}
        onOpenChange={setShareOpen}
        onActiveLinksChange={setHasActiveLinks}
      />

      <Dialog open={deleteOpen} onOpenChange={(openState) => { if (!deleting) setDeleteOpen(openState); }} panelClassName="sm:max-w-md">
        <div role="dialog" aria-modal="true">
          <h2 className="font-syne text-xl font-semibold">Delete dashboard</h2>
          <p className="mt-2 text-sm text-muted">Delete “{dashboard.name}” and all of its widgets? This cannot be undone.</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={deleting} onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button type="button" variant="danger" loading={deleting} onClick={() => void deleteDashboard()}>Delete dashboard</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
