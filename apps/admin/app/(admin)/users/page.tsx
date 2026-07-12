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
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-1 border-b border-border/50 pb-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Users</h1>
        <p className="text-sm text-muted-foreground">
          One row per plan record. Default sort: tokens this month (cost hunting).
        </p>
      </div>

      <form
        className="mb-8 grid gap-4 rounded-xl border bg-card p-6 text-card-foreground shadow-sm md:grid-cols-2 lg:grid-cols-5 animate-slide-up"
        style={{ animationDelay: "50ms", animationFillMode: "both" }}
      >
        <div className="grid gap-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Search
          </label>
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="email or clerk id"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
        <div className="grid gap-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Plan
          </label>
          <select
            name="plan"
            defaultValue={plan}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="all">All Plans</option>
            <option value="free">Free</option>
            <option value="pro">Pro</option>
          </select>
        </div>
        <div className="grid gap-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Status
          </label>
          <select
            name="status"
            defaultValue={status}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
        <div className="grid gap-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Overrides
          </label>
          <select
            name="overrides"
            defaultValue={hasOverrides}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="all">All Configs</option>
            <option value="yes">Has Overrides</option>
            <option value="no">Default Only</option>
          </select>
        </div>
        <div className="grid gap-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Sort
          </label>
          <select
            name="sort"
            defaultValue={sort}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="tokens_month">Tokens this month</option>
            <option value="questions_month">Questions this month</option>
            <option value="created">Created</option>
            <option value="last_activity">Last activity</option>
          </select>
        </div>
        <div className="md:col-span-2 lg:col-span-5 flex justify-end">
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-8 py-2 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
          >
            Apply Filters
          </button>
        </div>
      </form>

      <div
        className="animate-slide-up"
        style={{ animationDelay: "150ms", animationFillMode: "both" }}
      >
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
              <tr key={row.userId} className="hover:bg-muted/50">
                <td className="px-3 py-2">
                  <Link
                    href={`/users/${encodeURIComponent(row.userId)}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {row.displayLabel}
                  </Link>
                  <div className="font-mono text-[10px] text-muted-foreground">
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
                <td className="px-3 py-2 tabular-nums text-muted-foreground">
                  {row.questionsToday}/{row.limitDay} · {row.questionsMonth}/
                  {row.limitMonth}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {formatCompact(row.tokensMonth)}
                </td>
                <td className="px-3 py-2 tabular-nums">{row.connectionsNonDemo}</td>
                <td className="px-3 py-2 tabular-nums">{row.dashboards}</td>
                <td className="px-3 py-2 tabular-nums">{row.activeShares}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {formatUtcDate(row.lastActivityAt)}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {formatUtcDate(row.createdAt)}
                </td>
              </tr>
            ))}
          </DataTable>
        )}

        <div className="mt-8 flex items-center justify-between text-sm text-muted-foreground font-medium bg-muted/30 px-6 py-4 rounded-2xl border border-border/50">
          <span>
            {formatInt(result.total)} users · page {result.page}/{totalPages}
          </span>
          <div className="flex gap-3">
            {page > 1 ? (
              <Link href={href({ page: page - 1 })} className="inline-flex items-center rounded-xl border border-border bg-card/50 px-5 py-2 text-sm font-bold text-foreground shadow-sm backdrop-blur-sm transition-all hover:bg-muted hover:text-primary hover:border-accent/30 focus:outline-none focus:ring-4 focus:ring-accent/10 active:scale-95">
                Previous
              </Link>
            ) : null}
            {page < totalPages ? (
              <Link href={href({ page: page + 1 })} className="inline-flex items-center rounded-xl border border-border bg-card/50 px-5 py-2 text-sm font-bold text-foreground shadow-sm backdrop-blur-sm transition-all hover:bg-muted hover:text-primary hover:border-accent/30 focus:outline-none focus:ring-4 focus:ring-accent/10 active:scale-95">
                Next
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
