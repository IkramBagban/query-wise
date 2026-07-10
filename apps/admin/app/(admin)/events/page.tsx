import Link from "next/link";
import { Card, EmptyState } from "@/components/ui";
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
        <p className="mt-1 text-sm text-muted">
          MetricEvent stream (payloads are metadata-only by contract).
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4">
        <label className="text-xs text-muted">
          Event type
          <select
            name="type"
            defaultValue={eventTypes?.[0] ?? ""}
            className="mt-0.5 block max-w-xs rounded border border-border bg-bg px-2 py-1.5 text-sm"
          >
            <option value="">All</option>
            {METRIC_EVENT_TYPES.map((t) => (
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
        <label className="text-xs text-muted">
          From (ISO)
          <input
            name="from"
            defaultValue={from ?? ""}
            className="mt-0.5 block w-48 rounded border border-border bg-bg px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs text-muted">
          To (ISO)
          <input
            name="to"
            defaultValue={to ?? ""}
            className="mt-0.5 block w-48 rounded border border-border bg-bg px-2 py-1.5 text-sm"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white"
        >
          Apply
        </button>
      </form>

      {result.rows.length === 0 ? (
        <EmptyState>No events.</EmptyState>
      ) : (
        <div className="space-y-3">
          {result.rows.map((e) => (
            <Card key={e.id}>
              <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-mono text-[11px] text-faint">
                  {formatUtcDate(e.createdAt)}
                </span>
                <span className="font-medium text-accent">{e.eventType}</span>
                {e.userId ? (
                  <Link
                    href={`/users/${encodeURIComponent(e.userId)}`}
                    className="font-mono text-[11px] text-muted hover:underline"
                  >
                    {e.userId}
                  </Link>
                ) : null}
                {e.resourceType ? (
                  <span className="text-xs text-faint">
                    {e.resourceType}
                    {e.resourceId ? `:${e.resourceId.slice(0, 8)}` : ""}
                  </span>
                ) : null}
              </div>
              <pre className="overflow-x-auto rounded-lg bg-bg p-3 font-mono text-[11px] text-muted">
                {JSON.stringify(e.payload ?? {}, null, 2)}
              </pre>
            </Card>
          ))}
        </div>
      )}

      {result.nextCursor ? (
        <Link
          href={`/events?${new URLSearchParams({
            ...(eventTypes?.[0] ? { type: eventTypes[0] } : {}),
            ...(userId ? { userId } : {}),
            ...(from ? { from } : {}),
            ...(to ? { to } : {}),
            cursorCreatedAt: result.nextCursor.createdAt,
            cursorId: result.nextCursor.id,
          }).toString()}`}
          className="text-sm text-accent"
        >
          Load more
        </Link>
      ) : null}
    </div>
  );
}
