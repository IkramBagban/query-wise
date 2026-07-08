"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";

import type { QueryResult } from "@/types";
import { formatFullAs, inferResultFormats } from "@/lib/charts/semantics";

interface TableViewProps {
  result: QueryResult;
}

/** Turn snake_case / raw SQL aliases into readable Title Case headers. */
function prettyHeader(column: string): string {
  return column
    .replace(/[_\s]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function formatDateLike(value: unknown): string {
  if (value instanceof Date) {
    return value.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  // Avoid treating numeric strings like "166" as dates.
  const looksLikeDateString =
    typeof value === "string" &&
    /[-/:T]/.test(value) &&
    !Number.isNaN(Date.parse(value));
  if (looksLikeDateString) {
    return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  return String(value ?? "");
}

export function TableView({ result }: TableViewProps) {
  const [sortBy, setSortBy] = useState<{ key: string; order: "asc" | "desc" } | null>(null);
  const columnFormats = useMemo(() => inferResultFormats(result.columns, result.rows), [result.columns, result.rows]);

  const rows = useMemo(() => {
    const baseRows = [...result.rows];
    if (sortBy) {
      baseRows.sort((a, b) => {
        const left = a[sortBy.key];
        const right = b[sortBy.key];
        if (left === right) return 0;
        if (left === null || left === undefined) return 1;
        if (right === null || right === undefined) return -1;
        if (typeof left === "number" && typeof right === "number") {
          return sortBy.order === "asc" ? left - right : right - left;
        }
        return sortBy.order === "asc"
          ? String(left).localeCompare(String(right))
          : String(right).localeCompare(String(left));
      });
    }
    return baseRows.slice(0, 50);
  }, [result.rows, sortBy]);

  // Right-align columns whose values are numeric (checked on the first non-null row).
  const numericColumns = useMemo(() => {
    const set = new Set<string>();
    for (const column of result.columns) {
      const sample = result.rows.find((row) => row[column] !== null && row[column] !== undefined)?.[column];
      if (toFiniteNumber(sample) !== null || isNumber(sample)) set.add(column);
    }
    return set;
  }, [result.columns, result.rows]);

  return (
    <div className="max-h-[360px] overflow-auto rounded-xl border border-border bg-surface">
      <table className="min-w-full border-separate border-spacing-0 text-[13px]">
        <thead className="sticky top-0 z-10">
          <tr>
            {result.columns.map((column) => {
              const active = sortBy?.key === column;
              const alignRight = numericColumns.has(column);
              return (
                <th
                  key={column}
                  scope="col"
                  aria-sort={active ? (sortBy?.order === "asc" ? "ascending" : "descending") : "none"}
                  className="group/th cursor-pointer select-none border-b border-border bg-surface-2 px-4 py-2.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-faint transition-colors hover:text-muted"
                  onClick={() =>
                    setSortBy((prev) =>
                      prev?.key === column
                        ? { key: column, order: prev.order === "asc" ? "desc" : "asc" }
                        : { key: column, order: "asc" },
                    )
                  }
                >
                  <span className={`inline-flex items-center gap-1 ${alignRight ? "flex-row-reverse" : ""}`}>
                    {prettyHeader(column)}
                    {active ? (
                      sortBy?.order === "asc" ? (
                        <ChevronUp className="size-3 text-accent-strong" strokeWidth={2.5} />
                      ) : (
                        <ChevronDown className="size-3 text-accent-strong" strokeWidth={2.5} />
                      )
                    ) : (
                      <ChevronsUpDown className="size-3 opacity-0 transition-opacity group-hover/th:opacity-60" strokeWidth={2} />
                    )}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="transition-colors hover:bg-surface-2/50">
              {result.columns.map((column, columnIndex) => {
                const value = row[column];
                const numericValue = toFiniteNumber(value);
                const isNumeric = numericValue !== null || isNumber(value);
                const displayNumber = numericValue ?? (isNumber(value) ? value : 0);
                const format = columnFormats.get(column);
                return (
                  <td
                    key={column}
                    className={`border-b border-border/50 px-4 py-2.5 ${
                      isNumeric ? "text-right font-mono tabular-nums text-text" : "text-left"
                    } ${columnIndex === 0 ? "font-medium text-text" : "text-muted"}`}
                  >
                    {isNumeric ? formatFullAs(displayNumber, format ?? { kind: "number", scale: 1 }) : formatDateLike(value)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {result.rowCount > 50 ? (
        <p className="sticky bottom-0 border-t border-border bg-surface/95 px-4 py-2 font-mono text-[11px] text-faint backdrop-blur-sm">
          Showing 50 of {result.rowCount.toLocaleString()} rows
        </p>
      ) : null}
    </div>
  );
}
