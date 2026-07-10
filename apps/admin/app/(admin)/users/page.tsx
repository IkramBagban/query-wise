import Link from "next/link";
import { Badge, DataTable, EmptyState } from "@/components/ui";
import { formatCompact, formatInt, formatUtcDate } from "@/lib/format";
import { listUsers, type UsersSort } from "@/lib/queries/users";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const plan =
    sp.plan === "free" || sp.plan === "pro" || sp.plan === "all"
      ? sp.plan
      : "all";
  const status =
    sp.status === "active" || sp.status === "disabled" || sp.status === "all"
      ? sp.status
      : "all";
  const hasOverrides =
    sp.overrides === "yes" || sp.overrides === "no" || sp.overrides === "all"
      ? sp.overrides
      : "all";
  const sort = (
    ["tokens_month", "questions_month", "created", "last_activity"] as const
  ).includes(sp.sort as UsersSort)
    ? (sp.sort as UsersSort)
    : "tokens_month";
  const page = Math.max(1, Number(sp.page) || 1);

  const result = await listUsers({
    q,
    plan,
    status,
    hasOverrides,
    sort,
    page,
  });
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  function href(overrides: Record<string, string | number | undefined>) {
    const params = new URLSearchParams();
    const merged = {
      q,
      plan,
      status,
      overrides: hasOverrides,
      sort,
      page,
      ...overrides,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v === undefined || v === "" || v === "all") continue;
      if (k === "page" && Number(v) <= 1) continue;
      params.set(k, String(v));
    }
    const s = params.toString();
    return s ? `/users?${s}` : "/users";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="mt-1 text-sm text-muted">
          One row per plan record. Default sort: tokens this month (cost hunting).
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4">
        <label className="text-xs text-muted">
          Search
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="email or clerk id"
            className="mt-0.5 block w-56 rounded border border-border bg-bg px-2 py-1.5 text-sm text-text"
          />
        </label>
        <label className="text-xs text-muted">
          Plan
          <select
            name="plan"
            defaultValue={plan}
            className="mt-0.5 block rounded border border-border bg-bg px-2 py-1.5 text-sm"
          >
            <option value="all">All</option>
            <option value="free">Free</option>
            <option value="pro">Pro</option>
          </select>
        </label>
        <label className="text-xs text-muted">
          Status
          <select
            name="status"
            defaultValue={status}
            className="mt-0.5 block rounded border border-border bg-bg px-2 py-1.5 text-sm"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>
        </label>
        <label className="text-xs text-muted">
          Overrides
          <select
            name="overrides"
            defaultValue={hasOverrides}
            className="mt-0.5 block rounded border border-border bg-bg px-2 py-1.5 text-sm"
          >
            <option value="all">All</option>
            <option value="yes">Has overrides</option>
            <option value="no">No overrides</option>
          </select>
        </label>
        <label className="text-xs text-muted">
          Sort
          <select
            name="sort"
            defaultValue={sort}
            className="mt-0.5 block rounded border border-border bg-bg px-2 py-1.5 text-sm"
          >
            <option value="tokens_month">Tokens this month</option>
            <option value="questions_month">Questions this month</option>
            <option value="created">Created</option>
            <option value="last_activity">Last activity</option>
          </select>
        </label>
        <button
          type="submit"
          className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white"
        >
          Apply
        </button>
      </form>

      {result.rows.length === 0 ? (
        <EmptyState>No users match.</EmptyState>
      ) : (
        <DataTable
          headers={[
            "Identity",
            "Plan",
            "Status",
            "Questions d/m",
            "Tokens m",
            "Conn",
            "Dash",
            "Shares",
            "Last activity",
            "Created",
          ]}
        >
          {result.rows.map((row) => (
            <tr key={row.userId} className="hover:bg-surface2/50">
              <td className="px-3 py-2">
                <Link
                  href={`/users/${encodeURIComponent(row.userId)}`}
                  className="font-medium text-accent hover:underline"
                >
                  {row.displayLabel}
                </Link>
                <div className="font-mono text-[10px] text-faint">
                  {row.identity?.email && row.identity.email !== row.displayLabel
                    ? row.identity.email
                    : row.userId}
                </div>
              </td>
              <td className="px-3 py-2">
                <Badge tone={row.planId === "pro" ? "accent" : "neutral"}>
                  {row.planId}
                  {row.hasOverrides ? " ⚙" : ""}
                </Badge>
              </td>
              <td className="px-3 py-2">
                <Badge tone={row.status === "disabled" ? "danger" : "neutral"}>
                  {row.status}
                </Badge>
              </td>
              <td className="px-3 py-2 tabular-nums text-muted">
                {row.questionsToday}/{row.limitDay} · {row.questionsMonth}/
                {row.limitMonth}
              </td>
              <td className="px-3 py-2 tabular-nums">
                {formatCompact(row.tokensMonth)}
              </td>
              <td className="px-3 py-2 tabular-nums">{row.connectionsNonDemo}</td>
              <td className="px-3 py-2 tabular-nums">{row.dashboards}</td>
              <td className="px-3 py-2 tabular-nums">{row.activeShares}</td>
              <td className="px-3 py-2 text-xs text-muted">
                {formatUtcDate(row.lastActivityAt)}
              </td>
              <td className="px-3 py-2 text-xs text-muted">
                {formatUtcDate(row.createdAt)}
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      <div className="flex items-center justify-between text-sm text-muted">
        <span>
          {formatInt(result.total)} users · page {result.page}/{totalPages}
        </span>
        <div className="flex gap-2">
          {page > 1 ? (
            <Link href={href({ page: page - 1 })} className="text-accent">
              Previous
            </Link>
          ) : null}
          {page < totalPages ? (
            <Link href={href({ page: page + 1 })} className="text-accent">
              Next
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
