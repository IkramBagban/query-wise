"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, GripVertical, Pencil, RefreshCw, Trash2, X } from "lucide-react";

import { V2Chart, isBoundedResultPreview, previewToQueryResult } from "@/components/V2Chart";
import { resolveView } from "@/lib/charts/views";
import { cn } from "@/lib/utils";
import type { BoundedResultPreview, ChartConfig, ViewTransform, WidgetMode } from "@query-wise/shared/types";

export interface LiveWidgetView {
  id: string;
  title: string;
  mode: WidgetMode;
  chartConfig: ChartConfig;
  preview: BoundedResultPreview;
  /** SPEC-09 §2.3: pinned view transform, re-applied on every render (snapshot/live). */
  viewTransform?: ViewTransform | null;
  error: string | null;
  refreshing: boolean;
}

/** Inline widget-title editor: pencil / double-click to edit, Enter or blur saves, Esc cancels. */
function WidgetTitle({
  title,
  canEdit,
  onRename,
}: {
  title: string;
  canEdit: boolean;
  onRename?: (title: string) => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(title);
  }, [title, editing]);
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const canRename = canEdit && Boolean(onRename);

  async function commit() {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === title) {
      setDraft(title);
      return;
    }
    setSaving(true);
    try {
      await onRename?.(next);
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
        aria-label="Widget title"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void commit();
          } else if (event.key === "Escape") {
            setDraft(title);
            setEditing(false);
          }
        }}
        className="qw-no-drag min-w-0 flex-1 rounded-md border border-accent-line bg-surface px-1.5 py-0.5 text-[13.5px] font-semibold text-text outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />
    );
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
      <h2
        onDoubleClick={canRename ? () => setEditing(true) : undefined}
        title={canRename ? title : undefined}
        className="min-w-0 truncate text-[13.5px] font-semibold text-text"
      >
        {title}
      </h2>
      {canRename ? (
        <button
          type="button"
          aria-label="Rename widget"
          title="Rename"
          onClick={() => setEditing(true)}
          className="qw-no-drag inline-flex size-5 shrink-0 items-center justify-center rounded text-faint opacity-0 transition group-hover/widget:opacity-100 hover:bg-surface-2 hover:text-text"
        >
          <Pencil className="size-3" />
        </button>
      ) : null}
      {saving ? <span className="text-[10px] text-faint">saving…</span> : null}
    </div>
  );
}

export function LiveWidgetCard({
  view,
  canEdit,
  onRefresh,
  onRemove,
  onRename,
  removing,
}: {
  view: LiveWidgetView;
  canEdit: boolean;
  onRefresh: () => void;
  onRemove?: () => void;
  onRename?: (title: string) => Promise<void> | void;
  removing?: boolean;
}) {
  const isSnapshot = view.mode === "snapshot";
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  // SPEC-09 §2.3: apply the pinned transform before charting — same path as the
  // conversation card and public share.
  const resolvedView =
    view.viewTransform && isBoundedResultPreview(view.preview)
      ? resolveView(previewToQueryResult(view.preview), {
          id: view.id,
          chartConfig: view.chartConfig,
          transform: view.viewTransform,
        })
      : null;

  return (
    <div
      className={cn(
        "group/widget relative flex h-full flex-col overflow-hidden rounded-2xl border border-border/70 bg-surface shadow-[0_1px_2px_rgba(15,25,16,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-accent-line/60 hover:shadow-[0_18px_40px_-24px_var(--accent-line)]",
      )}
    >
      {/* editorial top hairline — lights up on hover, replaces the hard divider */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-px bg-gradient-to-r from-transparent via-accent-line to-transparent opacity-0 transition-opacity duration-300 group-hover/widget:opacity-100"
      />
      {/* thin refresh progress bar */}
      {view.refreshing ? <span aria-hidden className="qw-live-bar" /> : null}

      {/* header — the drag zone (interactive controls opt out via .qw-no-drag) */}
      <div
        className={cn(
          "qw-drag-handle flex shrink-0 items-center gap-2 px-4 pb-2 pt-3",
          canEdit && "cursor-grab active:cursor-grabbing",
        )}
      >
        {canEdit ? (
          <GripVertical className="size-3.5 shrink-0 text-faint/60 transition group-hover/widget:text-faint" strokeWidth={1.75} aria-hidden />
        ) : null}

        <WidgetTitle title={view.title} canEdit={canEdit} onRename={onRename} />

        <div className="flex shrink-0 items-center gap-0.5">
          {view.error ? (
            <span
              title={view.error}
              className="inline-flex size-6 items-center justify-center text-warning"
              aria-label={`Refresh problem: ${view.error}`}
            >
              <AlertCircle className="size-3.5" />
            </span>
          ) : null}

          {!isSnapshot ? (
            <button
              type="button"
              aria-label={`Refresh ${view.title}`}
              title="Refresh"
              disabled={view.refreshing}
              onClick={onRefresh}
              className="qw-no-drag inline-flex size-6 items-center justify-center rounded-md text-faint transition hover:bg-surface-2 hover:text-text disabled:opacity-60"
            >
              <RefreshCw className={cn("size-3.5", view.refreshing && "qw-spin-once")} />
            </button>
          ) : null}

          {canEdit && onRemove ? (
            confirmingRemove ? (
              <span className="qw-no-drag flex items-center gap-0.5">
                <button
                  type="button"
                  aria-label="Confirm remove"
                  title="Confirm remove"
                  disabled={removing}
                  onClick={onRemove}
                  className="inline-flex size-6 items-center justify-center rounded-md bg-danger/10 text-danger transition hover:bg-danger/20 disabled:opacity-60"
                >
                  <Check className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Cancel remove"
                  title="Cancel"
                  onClick={() => setConfirmingRemove(false)}
                  className="inline-flex size-6 items-center justify-center rounded-md text-faint transition hover:bg-surface-2 hover:text-text"
                >
                  <X className="size-3.5" />
                </button>
              </span>
            ) : (
              <button
                type="button"
                aria-label={`Remove ${view.title}`}
                title="Remove widget"
                onClick={() => setConfirmingRemove(true)}
                className="qw-no-drag inline-flex size-6 items-center justify-center rounded-md text-faint opacity-0 transition group-hover/widget:opacity-100 hover:bg-danger/10 hover:text-danger"
              >
                <Trash2 className="size-3.5" />
              </button>
            )
          ) : null}
        </div>
      </div>

      {/* chart body — stays interactive; dims to 60% during refresh, never blanks */}
      <div
        className="min-h-0 flex-1 overflow-hidden px-3.5 pb-1 pt-1 transition-opacity duration-200"
        style={{ opacity: view.refreshing ? 0.6 : 1 }}
      >
        <div className="h-full w-full">
          <V2Chart
            preview={view.preview}
            config={resolvedView?.config ?? view.chartConfig}
            resultOverride={resolvedView?.result}
          />
        </div>
      </div>
    </div>
  );
}
