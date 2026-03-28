"use client";

import { useMemo, useState } from "react";

import { formatNumber } from "@/lib/utils";
import type { QueryResult } from "@/types";

interface TableViewProps {
  result: QueryResult;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatDateLike(value: unknown): string {
  if (value instanceof Date) {
    return value.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  return String(value ?? "");
}

export function TableView({ result }: TableViewProps) {
  const [sortBy, setSortBy] = useState<{ key: string; order: "asc" | "desc" } | null>(null);

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

  return (
    <div className="max-h-[350px] overflow-auto rounded-md border border-border">
      <table className="min-w-full border-separate border-spacing-0 text-xs">
        <thead className="sticky top-0 bg-surface-3">
          <tr>
            {result.columns.map((column) => {
              const active = sortBy?.key === column;
              return (
                <th
                  key={column}
                  className="cursor-pointer border-b border-border px-3 py-2 text-left text-text-2"
                  onClick={() =>
                    setSortBy((prev) => {
                      if (prev?.key === column) {
                        return { key: column, order: prev.order === "asc" ? "desc" : "asc" };
                      }
                      return { key: column, order: "asc" };
                    })
                  }
                >
                  {column} {active ? (sortBy?.order === "asc" ? "↑" : "↓") : ""}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className={rowIndex % 2 === 0 ? "bg-surface" : "bg-surface-2"}>
              {result.columns.map((column) => {
                const value = row[column];
                const isNumeric = isNumber(value);
                return (
                  <td key={column} className={`border-b border-border px-3 py-2 ${isNumeric ? "text-right" : "text-left"}`}>
                    {isNumeric ? formatNumber(value) : formatDateLike(value)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {result.rowCount > 50 ? (
        <p className="border-t border-border bg-surface p-2 text-xs text-text-3">Showing 50 of {result.rowCount} rows</p>
      ) : null}
    </div>
  );
}
