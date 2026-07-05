"use client";

import type { QueryResult } from "@/types";
import { formatValue, labelize } from "@/lib/charts/format";

/**
 * KPI view for single-row results. A query like "average order value" returns
 * one row — showing it as a chart is meaningless and as a table is weak. Big
 * formatted numbers read instantly, which is what a single aggregate deserves.
 */
export function StatCard({ result }: { result: QueryResult }) {
  const row = result.rows[0] ?? {};
  const stats = result.columns.map((column) => ({ label: labelize(column), value: formatValue(row[column]) }));
  const columnsClass = stats.length >= 3 ? "sm:grid-cols-3" : stats.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-1";

  return (
    <div className={`grid grid-cols-1 gap-3 ${columnsClass}`}>
      {stats.map((stat) => (
        <div key={stat.label} className="rounded-xl border border-border/70 bg-surface-2/30 px-4 py-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-faint">{stat.label}</p>
          <p className="mt-1.5 font-syne text-3xl font-semibold tabular-nums text-text">{stat.value}</p>
        </div>
      ))}
    </div>
  );
}
