import { Card, DataTable, EmptyState, Kpi } from "@/components/ui";
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

  const totalInput = data.rows.reduce((sum, r) => sum + r.inputTokens, 0);
  const totalOutput = data.rows.reduce((sum, r) => sum + r.outputTokens, 0);
  const totalCalls = data.rows.reduce((sum, r) => sum + r.calls, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border/50 pb-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Cost</h1>
          <p className="text-sm text-muted-foreground">
            Token spend only — no dollar estimates until a price table lands.
            Range max 90d.
          </p>
          <p className="text-xs text-muted-foreground">
            {formatUtcDate(data.from)} → {formatUtcDate(data.to)}
          </p>
        </div>
        <a
          href={csvHref}
          download="llm-cost.csv"
          className="rounded-lg border border-border/50 bg-card px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Export CSV
        </a>
      </div>

      <form 
        className="animate-slide-up flex flex-wrap items-end gap-4 rounded-2xl border border-border/50 bg-card/50 p-5 backdrop-blur-sm"
        style={{ animationDelay: "50ms", animationFillMode: "both" }}
      >
        <label className="text-xs text-muted-foreground">
          Range
          <select
            name="preset"
            defaultValue={preset}
            className="mt-1 block w-32 rounded-lg border border-border/50 bg-muted px-3 py-2 text-sm text-foreground transition-colors focus:border-accent focus:outline-none"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="this_month">This month</option>
            <option value="last_month">Last month</option>
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Provider
          <select
            name="provider"
            defaultValue={provider ?? ""}
            className="mt-1 block w-32 rounded-lg border border-border/50 bg-muted px-3 py-2 text-sm text-foreground transition-colors focus:border-accent focus:outline-none"
          >
            <option value="">All</option>
            {data.providers.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Model
          <select
            name="model"
            defaultValue={model ?? ""}
            className="mt-1 block w-32 rounded-lg border border-border/50 bg-muted px-3 py-2 text-sm text-foreground transition-colors focus:border-accent focus:outline-none"
          >
            <option value="">All</option>
            {data.models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Task
          <select
            name="task"
            defaultValue={task ?? ""}
            className="mt-1 block w-32 rounded-lg border border-border/50 bg-muted px-3 py-2 text-sm text-foreground transition-colors focus:border-accent focus:outline-none"
          >
            <option value="">All</option>
            {data.tasks.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          User id
          <input
            name="userId"
            defaultValue={userId ?? ""}
            className="mt-1 block w-48 rounded-lg border border-border/50 bg-muted px-3 py-2 font-mono text-sm text-foreground transition-colors focus:border-accent focus:outline-none"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Apply
        </button>
      </form>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="animate-slide-up" style={{ animationDelay: "150ms", animationFillMode: "both" }}>
          <Kpi label="Total Calls" value={formatCompact(totalCalls)} />
        </div>
        <div className="animate-slide-up" style={{ animationDelay: "200ms", animationFillMode: "both" }}>
          <Kpi label="Input Tokens" value={formatCompact(totalInput)} />
        </div>
        <div className="animate-slide-up" style={{ animationDelay: "250ms", animationFillMode: "both" }}>
          <Kpi label="Output Tokens" value={formatCompact(totalOutput)} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="animate-slide-up lg:col-span-2" style={{ animationDelay: "300ms", animationFillMode: "both" }}>
          <Card title="Tokens over time" className="rounded-2xl shadow-sm">
            {dayEntries.length === 0 ? (
              <EmptyState>No series data.</EmptyState>
            ) : (
              <div className="flex h-48 items-end gap-1">
                {dayEntries.map(([day, value]) => (
                  <div
                    key={day}
                    title={`${day}: ${value}`}
                    className="flex-1 rounded-t-sm bg-primary/80 transition-all hover:bg-primary"
                    style={{
                      height: `${Math.max(2, (value / maxDay) * 100)}%`,
                    }}
                  />
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="animate-slide-up lg:col-span-2" style={{ animationDelay: "350ms", animationFillMode: "both" }}>
          <Card title="Breakdown" className="rounded-2xl shadow-sm">
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
                  <tr key={`${r.provider}:${r.model}:${r.task}`} className="group transition-colors hover:bg-muted/50">
                    <td className="px-3 py-3 text-foreground">{r.provider}</td>
                    <td className="px-3 py-3 font-mono text-xs text-muted-foreground">{r.model}</td>
                    <td className="px-3 py-3 text-foreground">{r.task}</td>
                    <td className="px-3 py-3 tabular-nums text-foreground">{r.calls}</td>
                    <td className="px-3 py-3 tabular-nums text-foreground">
                      {formatCompact(r.inputTokens)}
                    </td>
                    <td className="px-3 py-3 tabular-nums text-foreground">
                      {formatCompact(r.outputTokens)}
                    </td>
                    <td className="px-3 py-3 tabular-nums text-foreground">
                      {formatCompact(r.cachedTokens)}
                    </td>
                    <td className="px-3 py-3 tabular-nums text-foreground">{r.failures}</td>
                    <td className="px-3 py-3 tabular-nums text-foreground">{r.distinctUsers}</td>
                  </tr>
                ))}
              </DataTable>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
