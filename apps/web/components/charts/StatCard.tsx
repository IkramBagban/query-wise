"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import type { QueryResult } from "@/types";
import { formatValue, isDateLikeValue, labelize } from "@/lib/charts/format";
import { inferColumnProfile } from "@/lib/charts/profiles";
import { formatFullAs, inferColumnFormat } from "@/lib/charts/semantics";

/**
 * KPI view. Two shapes:
 *  - a single-row aggregate → each column as a big formatted number, and
 *  - a single-measure time series → the latest value, its change vs the prior
 *    period, and an inline sparkline. A number with a trend beats a bare number.
 */

function Sparkline({ values }: { values: number[] }) {
  const width = 120;
  const height = 32;
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length < 2) return null;
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / span) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = points[points.length - 1].split(",");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible" aria-hidden>
      <polyline points={points.join(" ")} fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={2.2} fill="var(--accent)" />
    </svg>
  );
}

function DeltaBadge({ pct }: { pct: number }) {
  const up = pct > 0;
  const flat = Math.abs(pct) < 0.05;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  const tone = flat ? "text-faint" : up ? "text-success" : "text-danger";
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${tone}`}>
      <Icon className="size-3.5" />
      {flat ? "0%" : `${up ? "+" : ""}${pct.toFixed(1)}%`}
    </span>
  );
}

function TrendStat({ result }: { result: QueryResult }) {
  const measure = result.columns.find(
    (column) => {
      const p = inferColumnProfile(result.rows, column);
      return p.kind === "numeric" && !p.likelyId;
    },
  )!;
  const dimension = result.columns.find((column) => column !== measure);
  const values = result.rows.map((row) => Number(row[measure]));
  const format = inferColumnFormat(measure, result.rows);
  const latest = values[values.length - 1];
  const previous = values[values.length - 2];
  const deltaPct = Number.isFinite(previous) && previous !== 0 ? ((latest - previous) / Math.abs(previous)) * 100 : null;
  const latestLabel = dimension ? formatValue(result.rows[result.rows.length - 1][dimension]) : null;

  return (
    <div className="rounded-xl border border-border/70 bg-surface-2/30 px-4 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-faint">{labelize(measure)}</p>
          <p className="mt-1 font-syne text-3xl font-semibold tabular-nums text-text">{formatFullAs(latest, format)}</p>
          <div className="mt-1 flex items-center gap-2 text-xs text-faint">
            {deltaPct != null ? <DeltaBadge pct={deltaPct} /> : null}
            {latestLabel ? <span>vs prior · latest {latestLabel}</span> : null}
          </div>
        </div>
        <div className="shrink-0 pt-1">
          <Sparkline values={values} />
        </div>
      </div>
    </div>
  );
}

export function StatCard({ result }: { result: QueryResult }) {
  // Single-measure series → trend KPI with delta + sparkline.
  if (result.rows.length > 1) {
    const measures = result.columns.filter((column) => {
      const p = inferColumnProfile(result.rows, column);
      return p.kind === "numeric" && !p.likelyId;
    });
    if (measures.length === 1) return <TrendStat result={result} />;
  }

  const row = result.rows[0] ?? {};
  const stats = result.columns.map((column) => {
    const raw = row[column];
    const value =
      raw != null && !isDateLikeValue(raw) && Number.isFinite(Number(raw))
        ? formatFullAs(raw, inferColumnFormat(column, result.rows))
        : formatValue(raw);
    return { label: labelize(column), value };
  });
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
