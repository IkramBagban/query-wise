import Link from "next/link";
import { Card, EmptyState, DataTable, Kpi } from "@/components/ui";
import { formatUtcDate } from "@/lib/format";
import {
  listMetricEvents,
  METRIC_EVENT_TYPES,
} from "@/lib/queries/events";

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const typeParam = sp.type;
  const eventTypes = Array.isArray(typeParam)
    ? typeParam
    : typeof typeParam === "string" && typeParam
      ? typeParam.split(",").filter(Boolean)
      : undefined;
  const userId = typeof sp.userId === "string" ? sp.userId : undefined;
  const from = typeof sp.from === "string" ? sp.from : undefined;
  const to = typeof sp.to === "string" ? sp.to : undefined;
  const cursorCreatedAt =
    typeof sp.cursorCreatedAt === "string" ? sp.cursorCreatedAt : undefined;
  const cursorId = typeof sp.cursorId === "string" ? sp.cursorId : undefined;

  const result = await listMetricEvents({
    eventTypes,
    userId,
    from,
    to,
    cursorCreatedAt,
    cursorId,
  });

  const activeFilters = [eventTypes, userId, from, to].filter(Boolean).length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-1 border-b border-border/50 pb-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Events</h1>
        <p className="text-sm text-muted-foreground">
          MetricEvent stream (payloads are metadata-only by contract).
        </p>
      </div>

      <div
        className="animate-slide-up"
        style={{ animationDelay: "50ms", animationFillMode: "both" }}
      >
        <Card title="Filters">
          <form className="flex flex-wrap items-end gap-4">
            <label className="text-xs font-medium text-muted-foreground">
              Event type
              <select
                name="type"
                defaultValue={eventTypes?.[0] ?? ""}
                className="mt-1.5 block w-48 rounded-lg border border-border/60 bg-card/50 px-3 py-2 text-sm text-foreground shadow-sm backdrop-blur-sm transition-all hover:border-border focus:border-accent focus:bg-card focus:outline-none focus:ring-2 focus:ring-accent/20"
              >
                <option value="">All</option>
                {METRIC_EVENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              User id
              <input
                name="userId"
                defaultValue={userId ?? ""}
                placeholder="e.g. usr_123"
                className="mt-1.5 block w-48 rounded-lg border border-border/60 bg-card/50 px-3 py-2 font-mono text-sm text-foreground shadow-sm backdrop-blur-sm transition-all hover:border-border focus:border-accent focus:bg-card focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              From (ISO)
              <input
                name="from"
                defaultValue={from ?? ""}
                placeholder="YYYY-MM-DD"
                className="mt-1.5 block w-40 rounded-lg border border-border/60 bg-card/50 px-3 py-2 text-sm text-foreground shadow-sm backdrop-blur-sm transition-all hover:border-border focus:border-accent focus:bg-card focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              To (ISO)
              <input
                name="to"
                defaultValue={to ?? ""}
                placeholder="YYYY-MM-DD"
                className="mt-1.5 block w-40 rounded-lg border border-border/60 bg-card/50 px-3 py-2 text-sm text-foreground shadow-sm backdrop-blur-sm transition-all hover:border-border focus:border-accent focus:bg-card focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
            </label>
            <button
              type="submit"
              className="rounded-lg bg-primary px-6 py-2 text-sm font-semibold text-white shadow-md shadow-accent/20 transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary-strong hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-bg active:translate-y-0"
            >
              Apply
            </button>
          </form>
        </Card>
      </div>

      <div
        className="grid grid-cols-1 gap-4 sm:grid-cols-3 animate-slide-up"
        style={{ animationDelay: "150ms", animationFillMode: "both" }}
      >
        <Kpi label="Events Loaded" value={result.rows.length.toString()} />
        <Kpi label="Filters Applied" value={activeFilters.toString()} />
        <Kpi label="More Available" value={result.nextCursor ? "Yes" : "No"} />
      </div>

      <div
        className="animate-slide-up"
        style={{ animationDelay: "250ms", animationFillMode: "both" }}
      >
        {result.rows.length === 0 ? (
          <EmptyState>No events found for the given criteria.</EmptyState>
        ) : (
          <DataTable headers={["Time", "Type", "User", "Resource", "Payload"]}>
            {result.rows.map((e) => (
              <tr
                key={e.id}
                className="group transition-colors hover:bg-muted/50"
              >
                <td className="whitespace-nowrap px-4 py-3 align-top">
                  <span className="font-mono text-[11px] text-muted-foreground group-hover:text-foreground transition-colors">
                    {formatUtcDate(e.createdAt)}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 align-top">
                  <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">
                    {e.eventType}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 align-top">
                  {e.userId ? (
                    <Link
                      href={`/users/${encodeURIComponent(e.userId)}`}
                      className="font-mono text-[11px] text-muted-foreground transition-colors hover:text-primary hover:underline"
                    >
                      {e.userId}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 align-top">
                  {e.resourceType ? (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-foreground">{e.resourceType}</span>
                      {e.resourceId ? (
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {e.resourceId.slice(0, 8)}
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </td>
                <td className="w-full min-w-[200px] px-4 py-3 align-top">
                  {Object.keys(e.payload ?? {}).length > 0 ? (
                    <pre className="max-w-xl overflow-x-auto rounded-lg bg-muted/30 p-2.5 font-mono text-[10px] text-muted-foreground ring-1 ring-inset ring-border/50">
                      {JSON.stringify(e.payload ?? {}, null, 2)}
                    </pre>
                  ) : (
                    <span className="text-[11px] italic text-muted-foreground">
                      Empty payload
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </div>

      {result.nextCursor ? (
        <div
          className="flex justify-center animate-slide-up"
          style={{ animationDelay: "350ms", animationFillMode: "both" }}
        >
          <Link
            href={`/events?${new URLSearchParams({
              ...(eventTypes?.[0] ? { type: eventTypes[0] } : {}),
              ...(userId ? { userId } : {}),
              ...(from ? { from } : {}),
              ...(to ? { to } : {}),
              cursorCreatedAt: result.nextCursor.createdAt,
              cursorId: result.nextCursor.id,
            }).toString()}`}
            className="inline-flex items-center justify-center rounded-lg border border-border bg-card px-6 py-2.5 text-sm font-medium text-foreground shadow-sm transition-all hover:bg-muted hover:text-primary focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-bg"
          >
            Load More Events
          </Link>
        </div>
      ) : null}
    </div>
  );
}
