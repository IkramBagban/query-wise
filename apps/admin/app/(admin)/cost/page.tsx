import { Card, DataTable, EmptyState } from "@/components/ui";
import { formatCompact, formatUtcDate } from "@/lib/format";
import {
  costRowsToCsv,
  getCostExplorer,
  type CostRangePreset,
} from "@/lib/queries/cost";

export default async function CostPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const preset = (
    ["7d", "30d", "this_month", "last_month"] as const
  ).includes(sp.preset as CostRangePreset)
    ? (sp.preset as CostRangePreset)
    : "30d";
  const provider = typeof sp.provider === "string" ? sp.provider : undefined;
  const model = typeof sp.model === "string" ? sp.model : undefined;
  const task = typeof sp.task === "string" ? sp.task : undefined;
  const userId = typeof sp.userId === "string" ? sp.userId : undefined;
  const exportCsv = sp.export === "csv";

  const data = await getCostExplorer({
    preset,
    provider: provider || undefined,
    model: model || undefined,
    task: task || undefined,
    userId: userId || undefined,
  });

  if (exportCsv) {
    // Server-rendered CSV download via data URL link is enough for admin v1;
    // when export=csv we still render the page with a downloadable blob link below.
  }

  const csv = costRowsToCsv(data.rows);
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;

  // Tokens over time by day
  const byDay = new Map<string, number>();
  for (const s of data.series) {
    byDay.set(
      s.dayKey,
      (byDay.get(s.dayKey) ?? 0) + s.inputTokens + s.outputTokens,
    );
  }
  const dayEntries = Array.from(byDay.entries()).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const maxDay = Math.max(1, ...dayEntries.map(([, v]) => v));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">LLM cost</h1>
          <p className="mt-1 text-sm text-muted">
            Token spend only — no dollar estimates until a price table lands.
            Range max 90d.
          </p>
          <p className="mt-1 text-xs text-faint">
            {formatUtcDate(data.from)} → {formatUtcDate(data.to)}
          </p>
        </div>
        <a
          href={csvHref}
          download="llm-cost.csv"
          className="rounded border border-border px-3 py-1.5 text-sm text-muted hover:text-text"
        >
          Export CSV
        </a>
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4">
        <label className="text-xs text-muted">
          Range
          <select
            name="preset"
            defaultValue={preset}
            className="mt-0.5 block rounded border border-border bg-bg px-2 py-1.5 text-sm"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="this_month">This month</option>
            <option value="last_month">Last month</option>
          </select>
        </label>
        <label className="text-xs text-muted">
          Provider
          <select
            name="provider"
            defaultValue={provider ?? ""}
            className="mt-0.5 block rounded border border-border bg-bg px-2 py-1.5 text-sm"
          >
            <option value="">All</option>
            {data.providers.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted">
          Model
          <select
            name="model"
            defaultValue={model ?? ""}
            className="mt-0.5 block rounded border border-border bg-bg px-2 py-1.5 text-sm"
          >
            <option value="">All</option>
            {data.models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted">
          Task
          <select
            name="task"
            defaultValue={task ?? ""}
            className="mt-0.5 block rounded border border-border bg-bg px-2 py-1.5 text-sm"
          >
            <option value="">All</option>
            {data.tasks.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted">
          User id
          <input
            name="userId"
            defaultValue={userId ?? ""}
            className="mt-0.5 block w-48 rounded border border-border bg-bg px-2 py-1.5 font-mono text-sm"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white"
        >
          Apply
        </button>
      </form>

      <Card title="Tokens over time">
        {dayEntries.length === 0 ? (
          <EmptyState>No series data.</EmptyState>
        ) : (
          <div className="flex h-32 items-end gap-0.5">
            {dayEntries.map(([day, value]) => (
              <div
                key={day}
                title={`${day}: ${value}`}
                className="flex-1 rounded-t bg-accent/80"
                style={{
                  height: `${Math.max(2, (value / maxDay) * 100)}%`,
                }}
              />
            ))}
          </div>
        )}
      </Card>

      <Card title="Breakdown">
        {data.rows.length === 0 ? (
          <EmptyState>No LLM usage in range.</EmptyState>
        ) : (
          <DataTable
            headers={[
              "Provider",
              "Model",
              "Task",
              "Calls",
              "Input",
              "Output",
              "Cached",
              "Failures",
              "Users",
            ]}
          >
            {data.rows.map((r) => (
              <tr key={`${r.provider}:${r.model}:${r.task}`}>
                <td className="px-3 py-1.5">{r.provider}</td>
                <td className="px-3 py-1.5 font-mono text-xs">{r.model}</td>
                <td className="px-3 py-1.5">{r.task}</td>
                <td className="px-3 py-1.5 tabular-nums">{r.calls}</td>
                <td className="px-3 py-1.5 tabular-nums">
                  {formatCompact(r.inputTokens)}
                </td>
                <td className="px-3 py-1.5 tabular-nums">
                  {formatCompact(r.outputTokens)}
                </td>
                <td className="px-3 py-1.5 tabular-nums">
                  {formatCompact(r.cachedTokens)}
                </td>
                <td className="px-3 py-1.5 tabular-nums">{r.failures}</td>
                <td className="px-3 py-1.5 tabular-nums">{r.distinctUsers}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>
    </div>
  );
}
