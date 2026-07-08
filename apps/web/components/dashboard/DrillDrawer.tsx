"use client";

import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { MessageSquarePlus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { isBoundedResultPreview } from "@/components/V2Chart";
import type { BoundedResultPreview } from "@query-wise/shared/types";

export interface DrillTarget {
  widgetId: string;
  title: string;
  connectionId: string | null;
  sqlText: string | null;
  preview: unknown;
  /** Optional category the user clicked (chartConfig xKey/nameKey + value). */
  category?: { key: string; value: string } | null;
}

function buildAskQuestion(target: DrillTarget): string {
  if (target.category) {
    return `In the "${target.title}" widget, drill into ${target.category.key} = ${target.category.value}. Why is it at this level, and what's driving it?`;
  }
  return `Tell me more about the "${target.title}" widget — what's driving these numbers and what changed recently?`;
}

function DrillTable({ preview }: { preview: BoundedResultPreview }) {
  const columns = preview.columns.slice(0, 12);
  const rows = preview.rows.slice(0, 100);
  return (
    <div className="overflow-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-left text-xs">
        <thead className="sticky top-0 bg-surface-2">
          <tr>
            {columns.map((column) => (
              <th key={column.name} className="whitespace-nowrap px-3 py-2 font-mono text-[10.5px] uppercase tracking-[0.06em] text-faint">
                {column.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-t border-border/70">
              {columns.map((column) => (
                <td key={column.name} className="whitespace-nowrap px-3 py-1.5 text-text/90">
                  {String((row as Record<string, unknown>)[column.name] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * SPEC-06 §7 + §8b: click-to-drill drawer. Slides in from the right over a
 * backdrop-blur scrim, shows the widget's underlying rows, and hands off to a new
 * conversation pre-seeded with the widget's context ("Ask about this").
 */
export function DrillDrawer({ target, onClose }: { target: DrillTarget | null; onClose: () => void }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const preview = target?.preview;
  const rowCount = isBoundedResultPreview(preview) ? preview.returnedRowCount : 0;

  function askAboutThis() {
    if (!target) return;
    const params = new URLSearchParams();
    params.set("q", buildAskQuestion(target));
    if (target.connectionId) params.set("connectionId", target.connectionId);
    onClose();
    router.push(`/chats/new?${params.toString()}`);
  }

  return (
    <AnimatePresence>
      {target ? (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={`Drill into ${target.title}`}>
          <motion.div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.2 }}
            onClick={onClose}
          />
          <motion.aside
            className="absolute right-0 top-0 flex h-full w-full max-w-xl flex-col border-l border-border bg-surface shadow-2xl"
            initial={{ x: reduce ? 0 : "100%" }}
            animate={{ x: 0 }}
            exit={{ x: reduce ? 0 : "100%" }}
            transition={reduce ? { duration: 0 } : { duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div className="min-w-0">
                <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-accent-strong">Drill-through</p>
                <h2 className="truncate font-syne text-lg font-semibold text-text">{target.title}</h2>
                <p className="mt-0.5 text-xs text-faint">
                  {rowCount} underlying {rowCount === 1 ? "row" : "rows"}
                  {target.category ? ` · ${target.category.key} = ${target.category.value}` : ""}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close drawer"
                onClick={onClose}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-faint transition hover:bg-surface-2 hover:text-text"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-5">
              {isBoundedResultPreview(preview) ? (
                <DrillTable preview={preview} />
              ) : (
                <p className="rounded-lg border border-dashed border-border p-4 text-xs text-faint">
                  No underlying rows are available for this widget.
                </p>
              )}
              {target.sqlText ? (
                <details className="mt-4 rounded-lg border border-border bg-surface-2/40 p-3">
                  <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.08em] text-faint">
                    Query
                  </summary>
                  <pre className="mt-2 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-code-text">
                    {target.sqlText}
                  </pre>
                </details>
              ) : null}
            </div>

            <div className="border-t border-border px-5 py-4">
              <Button type="button" className="w-full active:scale-[0.98]" onClick={askAboutThis}>
                <MessageSquarePlus className="size-4" />
                Ask about this
              </Button>
            </div>
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
