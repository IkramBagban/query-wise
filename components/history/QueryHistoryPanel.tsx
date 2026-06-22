"use client";

import { Clock, Play, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { QueryHistoryEntry } from "@/types";

interface QueryHistoryPanelProps {
  history: QueryHistoryEntry[];
  onRerun: (entry: QueryHistoryEntry) => void;
  onRemove: (id: string) => void;
  onClearAll: () => void;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function QueryHistoryPanel({
  history,
  onRerun,
  onRemove,
  onClearAll,
}: QueryHistoryPanelProps) {
  const [search, setSearch] = useState("");
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!search.trim()) return history;
    const term = search.toLowerCase();
    return history.filter(
      (e) =>
        e.question.toLowerCase().includes(term) ||
        e.sql.toLowerCase().includes(term),
    );
  }, [history, search]);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-syne text-xl font-bold text-text-1">Query History</h2>
          <p className="text-xs text-text-3">{history.length} saved queries</p>
        </div>
        {history.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setClearConfirmOpen(true)}
            className="border-danger/25 text-danger hover:bg-danger/10"
          >
            Clear all
          </Button>
        )}
      </div>

      {history.length > 0 && (
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search queries..."
            className="w-full rounded-lg border border-border bg-surface-2 py-2 pl-8 pr-3 text-xs text-text-1 outline-none placeholder:text-text-3 focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
          />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto -mx-1 px-1">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Clock className="mb-3 h-10 w-10 text-text-3/50" />
            <p className="text-sm font-medium text-text-2">
              {history.length === 0 ? "No queries yet" : "No matching queries"}
            </p>
            <p className="mt-1 text-xs text-text-3">
              {history.length === 0
                ? "Your query results will appear here automatically."
                : "Try a different search term."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((entry) => (
              <div
                key={entry.id}
                className="group rounded-xl border border-[#174128]/12 bg-white/70 p-3 transition-colors hover:border-accent/30 hover:bg-white"
              >
                <p className="mb-1.5 text-[13px] font-medium leading-snug text-text-1 line-clamp-2">
                  {entry.question}
                </p>
                <p className="mb-2 font-mono text-[11px] leading-relaxed text-text-3 line-clamp-1">
                  {entry.sql}
                </p>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="neutral" showDot={false}>
                      {formatRelativeTime(entry.timestamp)}
                    </Badge>
                    <Badge variant="neutral" showDot={false}>
                      {entry.rowCount} rows
                    </Badge>
                    <Badge variant="neutral" showDot={false}>
                      {entry.executionTimeMs}ms
                    </Badge>
                    {entry.chartType && (
                      <Badge variant="success" showDot={false}>
                        {entry.chartType}
                      </Badge>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => onRerun(entry)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-accent hover:bg-accent/10"
                      aria-label="Re-run query"
                    >
                      <Play className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(entry.id)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-danger hover:bg-danger/10"
                      aria-label="Delete entry"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={clearConfirmOpen}
        onOpenChange={setClearConfirmOpen}
        panelClassName="max-w-md"
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-text-1">Clear all history?</h2>
            <p className="text-sm text-text-2">
              This will permanently remove all {history.length} saved queries.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setClearConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                onClearAll();
                setClearConfirmOpen(false);
              }}
            >
              Clear all
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
