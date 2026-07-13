import { Card, DataTable, EmptyState, Kpi } from "@/components/ui";
import { formatInt, formatUtcDate } from "@/lib/format";
import { getSystemHealth } from "@/lib/queries/system";

export default async function SystemPage() {
  const data = await getSystemHealth();
  const age = data.jobs.oldestQueuedAgeSeconds;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-1 border-b border-border/50 pb-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">System</h1>
        <p className="text-sm text-muted-foreground">
          Read-only ops view. Job retries stay with the worker.
        </p>
      </div>

      <div
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 animate-slide-up"
        style={{ animationDelay: "50ms", animationFillMode: "both" }}
      >
        {data.jobs.byStatus.map((s) => (
          <Kpi
            key={s.status}
            label={`Jobs · ${s.status}`}
            value={formatInt(s.count)}
          />
        ))}
        <Kpi
          label="Oldest queued age"
          value={age == null ? "—" : `${formatInt(age)}s`}
        />
        <Kpi
          label="Schema sync failed (7d)"
          value={formatInt(data.schemaSyncs7d.failed)}
          hint={`queued ${data.schemaSyncs7d.queued} · ok ${data.schemaSyncs7d.succeeded}`}
        />
        <Kpi
          label="In-flight runs (7d touch)"
          value={formatInt(data.recoveryActivity7d)}
          hint="Non-terminal runs updated in window"
        />
      </div>

      <div
        className="grid gap-6 lg:grid-cols-2 animate-slide-up"
        style={{ animationDelay: "150ms", animationFillMode: "both" }}
      >
        <Card title="Recent dead jobs">
          {data.jobs.recentFailures.length === 0 ? (
            <EmptyState>No dead jobs.</EmptyState>
          ) : (
            <DataTable
              headers={["Type", "Error", "Attempts", "Updated"]}
            >
              {data.jobs.recentFailures.map((j) => (
                <tr key={j.id}>
                  <td className="px-3 py-1.5">{j.type}</td>
                  <td className="px-3 py-1.5 font-mono text-xs text-danger">
                    {j.lastErrorCode ?? "—"}
                  </td>
                  <td className="px-3 py-1.5 tabular-nums">{j.attempts}</td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">
                    {formatUtcDate(j.updatedAt)}
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </Card>

        <Card title="Failed schema snapshots (7d, error codes only)">
          {data.schemaSyncs7d.latestFailedSnapshots.length === 0 ? (
            <EmptyState>None.</EmptyState>
          ) : (
            <DataTable headers={["Snapshot", "Connection", "Error", "Updated"]}>
              {data.schemaSyncs7d.latestFailedSnapshots.map((s) => (
                <tr key={s.id}>
                  <td className="px-3 py-1.5 font-mono text-[11px]">
                    {s.id.slice(0, 8)}…
                  </td>
                  <td className="px-3 py-1.5 font-mono text-[11px]">
                    {s.connectionId.slice(0, 8)}…
                  </td>
                  <td className="px-3 py-1.5 font-mono text-xs text-danger">
                    {s.errorCode ?? "—"}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">
                    {formatUtcDate(s.updatedAt)}
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </Card>
      </div>

      <div
        className="grid gap-6 animate-slide-up"
        style={{ animationDelay: "250ms", animationFillMode: "both" }}
      >
        <Card title="QueryRun error-code distribution (7d)">
          {data.queryRunErrors7d.length === 0 ? (
            <EmptyState>No errors.</EmptyState>
          ) : (
            <DataTable headers={["Error code", "Count"]}>
              {data.queryRunErrors7d.map((e) => (
                <tr key={e.errorCode}>
                  <td className="px-3 py-1.5 font-mono text-xs">{e.errorCode}</td>
                  <td className="px-3 py-1.5 tabular-nums">{e.count}</td>
                </tr>
              ))}
            </DataTable>
          )}
        </Card>
      </div>
    </div>
  );
}
