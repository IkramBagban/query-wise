"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  LayoutDashboard,
  Link2,
  MessageSquare,
  Snowflake,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { connectionsApi } from "@/lib/api-client";
import type { ConnectionDeletionImpact } from "@/lib/api-client";

interface ConsequenceRow {
  icon: typeof MessageSquare;
  tone: "neutral" | "danger";
  count: number;
  title: string;
  detail: string;
}

function buildRows(impact: ConnectionDeletionImpact): ConsequenceRow[] {
  return [
    {
      icon: MessageSquare,
      tone: "neutral",
      count: impact.conversations,
      title: impact.conversations === 1 ? "chat becomes read-only" : "chats become read-only",
      detail: "History stays viewable — new questions are blocked.",
    },
    {
      icon: LayoutDashboard,
      tone: "neutral",
      count: impact.dashboards,
      title: impact.dashboards === 1 ? "dashboard stops refreshing" : "dashboards stop refreshing",
      detail: "Widgets keep their last known values.",
    },
    {
      icon: Link2,
      tone: "danger",
      count: impact.liveShareLinks,
      title: impact.liveShareLinks === 1 ? "live share link revoked" : "live share links revoked",
      detail: "Viewers will see “link no longer available.”",
    },
    {
      icon: Snowflake,
      tone: "neutral",
      count: impact.snapshotShareLinks,
      title: impact.snapshotShareLinks === 1 ? "snapshot link unaffected" : "snapshot links unaffected",
      detail: "Frozen data keeps working forever.",
    },
  ];
}

function ConsequenceItem({ row }: { row: ConsequenceRow }) {
  const Icon = row.icon;
  const muted = row.count === 0;
  return (
    <li
      className={`flex items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors ${
        muted
          ? "border-border bg-surface-2/40 opacity-60"
          : row.tone === "danger"
            ? "border-danger/25 bg-danger/5"
            : "border-border bg-surface-2/60"
      }`}
    >
      <span
        className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${
          muted
            ? "bg-surface-2 text-faint"
            : row.tone === "danger"
              ? "bg-danger/10 text-danger"
              : "bg-accent-soft text-accent-strong"
        }`}
      >
        <Icon className="size-4" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-text">
          <span className="font-semibold tabular-nums">{row.count}</span>{" "}
          <span className={muted ? "text-faint" : undefined}>{row.title}</span>
        </p>
        <p className="mt-0.5 text-xs text-faint">{row.detail}</p>
      </div>
    </li>
  );
}

/**
 * SPEC-13 §2: the delete-impact dialog. Replaces the list-view window.confirm and
 * the confirm-less detail-page delete. Fetches real dependent counts, shows a
 * per-resource-type consequence list, and keeps Delete disabled until counts load.
 */
export function ConnectionDeleteDialog({
  open,
  connectionId,
  connectionName,
  deleting,
  onConfirm,
  onOpenChange,
}: {
  open: boolean;
  connectionId: string | null;
  connectionName: string;
  deleting: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [impact, setImpact] = useState<ConnectionDeletionImpact | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !connectionId) return;
    let active = true;
    setImpact(null);
    setError(null);
    void connectionsApi.impact(connectionId).then(
      (result) => { if (active) setImpact(result); },
      (reason) => { if (active) setError(reason instanceof Error ? reason.message : "Unable to load impact"); },
    );
    return () => { active = false; };
  }, [open, connectionId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} panelClassName="max-w-lg">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl border border-danger/25 bg-danger/5 text-danger">
            <AlertTriangle className="size-5" strokeWidth={2} />
          </span>
          <div>
            <h2 className="font-syne text-xl font-semibold text-text">Delete connection</h2>
            <p className="mt-1 text-sm text-faint">
              Removing <span className="font-medium text-text">{connectionName}</span> deletes its saved
              credentials. Dependents survive in degraded states — nothing is cascade-deleted.
            </p>
          </div>
        </div>
        <Button type="button" variant="icon" aria-label="Close dialog" onClick={() => onOpenChange(false)}>
          <X />
        </Button>
      </div>

      <div className="mt-5">
        <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-faint">What happens</p>
        {error ? (
          <p className="rounded-lg border border-danger/25 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>
        ) : impact ? (
          <ul className="flex flex-col gap-2">
            {buildRows(impact).map((row) => (
              <ConsequenceItem key={row.title} row={row} />
            ))}
          </ul>
        ) : (
          <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading impact">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={deleting}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="danger"
          loading={deleting}
          disabled={!impact || Boolean(error)}
          onClick={onConfirm}
        >
          <Trash2 className="size-4" />
          Delete connection
        </Button>
      </div>
    </Dialog>
  );
}
