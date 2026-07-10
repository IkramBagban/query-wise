import type { ReactNode } from "react";

export function Card({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-border bg-surface p-4 ${className}`}
    >
      {title ? (
        <h2 className="mb-3 text-sm font-semibold tracking-tight text-text">
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  );
}

export function Kpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-[11px] uppercase tracking-wider text-faint">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-text">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "warn" | "danger";
}) {
  const tones = {
    neutral: "bg-surface2 text-muted",
    accent: "bg-accent/15 text-accent",
    warn: "bg-amber-500/15 text-amber-300",
    danger: "bg-danger/15 text-danger",
  };
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function DataTable({
  headers,
  children,
}: {
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead className="bg-surface2 text-[11px] uppercase tracking-wider text-faint">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border2 px-4 py-8 text-center text-sm text-faint">
      {children}
    </p>
  );
}

export function Mono({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-surface2 px-1 py-0.5 font-mono text-[11px] text-muted">
      {children}
    </code>
  );
}

export function BarRow({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="mb-2">
      <div className="mb-0.5 flex justify-between gap-2 text-xs">
        <span className="truncate text-muted">{label}</span>
        <span className="tabular-nums text-faint">{value.toLocaleString()}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded bg-surface2">
        <div
          className="h-full rounded bg-accent"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
