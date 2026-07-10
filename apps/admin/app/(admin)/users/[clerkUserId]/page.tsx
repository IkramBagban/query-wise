import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionsPanel } from "@/components/actions-panel";
import { CopyButton } from "@/components/copy-button";
import { Badge, Card, DataTable, EmptyState, Mono } from "@/components/ui";
import {
  formatCompact,
  formatInt,
  formatUtcDate,
} from "@/lib/format";
import { getUserDetail } from "@/lib/queries/user-detail";

export default async function UserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ clerkUserId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { clerkUserId } = await params;
  const sp = await searchParams;
  const runsPage = Math.max(1, Number(sp.runsPage) || 1);
  const data = await getUserDetail(clerkUserId, runsPage);
  if (!data) notFound();

  const { plan, usage } = data;
  const runsTotalPages = Math.max(
    1,
    Math.ceil(data.runs.total / data.runs.pageSize),
  );

  return (
    <div className="space-y-8">
      <div>
        <Link href="/users" className="text-xs text-muted hover:text-accent">
          ← Users
        </Link>
        <div className="mt-2 flex flex-wrap items-start gap-4">
          {data.identity?.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.identity.imageUrl}
              alt=""
              className="h-12 w-12 rounded-full border border-border"
            />
          ) : null}
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {data.displayLabel}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {data.identity?.email ?? "No email from Clerk"}
              {data.identity?.createdAt
                ? ` · Clerk since ${formatUtcDate(data.identity.createdAt)}`
                : ""}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Mono>{data.userId}</Mono>
              <CopyButton value={data.userId} />
            </div>
          </div>
          <div className="ml-auto flex gap-2">
            <Badge tone={plan.planId === "pro" ? "accent" : "neutral"}>
              {plan.planId}
            </Badge>
            <Badge tone={plan.status === "disabled" ? "danger" : "neutral"}>
              {plan.status}
            </Badge>
            {plan.hasOverrides ? <Badge tone="warn">overrides</Badge> : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Plan">
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted">Source</dt>
            <dd>{plan.source}</dd>
            <dt className="text-muted">Pro granted</dt>
            <dd>{formatUtcDate(plan.proGrantedAt)}</dd>
            <dt className="text-muted">Notes (ops)</dt>
            <dd className="whitespace-pre-wrap">{plan.notes || "—"}</dd>
            <dt className="text-muted">Overrides</dt>
            <dd className="font-mono text-xs">
              day={String(plan.overrides.questionsPerDayOverride)} month=
              {String(plan.overrides.questionsPerMonthOverride)} conn=
              {String(plan.overrides.maxConnectionsOverride)} dash=
              {String(plan.overrides.maxDashboardsOverride)} schema=
              {String(plan.overrides.schemaRefreshesPerDayOverride)}
            </dd>
          </dl>
          <h3 className="mb-2 mt-4 text-xs font-semibold uppercase text-faint">
            Plan history
          </h3>
          {data.planHistory.length === 0 ? (
            <EmptyState>No plan changes logged.</EmptyState>
          ) : (
            <DataTable
              headers={["When", "From → To", "Source", "Actor", "Notes"]}
            >
              {data.planHistory.map((h) => (
                <tr key={h.id}>
                  <td className="px-3 py-1.5 text-xs text-muted">
                    {formatUtcDate(h.createdAt)}
                  </td>
                  <td className="px-3 py-1.5">
                    {h.fromPlanId} → {h.toPlanId}
                  </td>
                  <td className="px-3 py-1.5">{h.source}</td>
                  <td className="px-3 py-1.5 font-mono text-[11px]">
                    {h.actorLabel ?? "—"}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-muted">
                    {h.notes ?? "—"}
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </Card>

        <Card title="Usage meters (effective limits)">
          <ul className="space-y-2 text-sm">
            <li>
              Questions today:{" "}
              <strong>
                {usage.questionsToday}/{plan.limits.questionsPerDay}
              </strong>
            </li>
            <li>
              Questions month:{" "}
              <strong>
                {usage.questionsMonth}/{plan.limits.questionsPerMonth}
              </strong>
            </li>
            <li>
              Schema refreshes today:{" "}
              <strong>
                {usage.schemaRefreshesToday}/{plan.limits.schemaRefreshesPerDay}
              </strong>
            </li>
            <li>
              Connections (non-demo):{" "}
              <strong>
                {usage.connectionsNonDemo}/{plan.limits.maxConnectionsNonDemo}
              </strong>
            </li>
            <li>
              Dashboards:{" "}
              <strong>
                {usage.dashboards}/{plan.limits.maxDashboards}
              </strong>
            </li>
            <li>
              Active shares:{" "}
              <strong>
                {usage.activeShares}/{plan.limits.maxActiveShareLinks}
              </strong>
            </li>
            <li className="text-muted">
              Tokens this month: in {formatCompact(usage.tokensMonthInput)} · out{" "}
              {formatCompact(usage.tokensMonthOutput)} · cached{" "}
              {formatCompact(usage.tokensMonthCached)}
            </li>
          </ul>
        </Card>
      </div>

      <Card title="30-day trend (questions + tokens)">
        <div className="overflow-x-auto">
          <div className="flex min-w-[640px] items-end gap-0.5 h-24">
            {data.trend30d.map((d) => {
              const maxQ = Math.max(
                1,
                ...data.trend30d.map((x) => x.questionsAccepted),
              );
              const h = Math.max(2, (d.questionsAccepted / maxQ) * 100);
              return (
                <div
                  key={d.dayKey}
                  title={`${d.dayKey}: ${d.questionsAccepted}q, ${d.inputTokens + d.outputTokens} tok`}
                  className="flex-1 rounded-t bg-accent/70"
                  style={{ height: `${h}%` }}
                />
              );
            })}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="LLM by task (this month)">
          {data.llmByTask.length === 0 ? (
            <EmptyState>No LLM calls.</EmptyState>
          ) : (
            <DataTable headers={["Task", "Calls", "In", "Out", "Fail"]}>
              {data.llmByTask.map((r) => (
                <tr key={r.task}>
                  <td className="px-3 py-1.5">{r.task}</td>
                  <td className="px-3 py-1.5 tabular-nums">{r.calls}</td>
                  <td className="px-3 py-1.5 tabular-nums">
                    {formatCompact(r.inputTokens)}
                  </td>
                  <td className="px-3 py-1.5 tabular-nums">
                    {formatCompact(r.outputTokens)}
                  </td>
                  <td className="px-3 py-1.5 tabular-nums">{r.failures}</td>
                </tr>
              ))}
            </DataTable>
          )}
        </Card>
        <Card title="LLM by provider/model (this month)">
          {data.llmByProviderModel.length === 0 ? (
            <EmptyState>No LLM calls.</EmptyState>
          ) : (
            <DataTable headers={["Provider", "Model", "Calls", "Tokens"]}>
              {data.llmByProviderModel.map((r) => (
                <tr key={`${r.provider}:${r.model}`}>
                  <td className="px-3 py-1.5">{r.provider}</td>
                  <td className="px-3 py-1.5 font-mono text-xs">{r.model}</td>
                  <td className="px-3 py-1.5 tabular-nums">{r.calls}</td>
                  <td className="px-3 py-1.5 tabular-nums">
                    {formatCompact(r.inputTokens + r.outputTokens)}
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </Card>
      </div>

      <Card title="Query runs (metadata only)">
        <p className="mb-3 text-xs text-muted">
          Question text is not listed here — open a run for the content-gated
          debug view.
        </p>
        {data.runs.rows.length === 0 ? (
          <EmptyState>No runs.</EmptyState>
        ) : (
          <DataTable
            headers={[
              "Run",
              "Status",
              "Created",
              "Latency",
              "Connection",
              "Steps",
              "SQL tries",
              "Chart",
              "Tokens",
              "Error",
            ]}
          >
            {data.runs.rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-1.5">
                  <Link
                    href={`/users/${encodeURIComponent(data.userId)}/runs/${encodeURIComponent(r.id)}`}
                    className="font-mono text-[11px] text-accent hover:underline"
                  >
                    {r.id.slice(0, 8)}…
                  </Link>
                </td>
                <td className="px-3 py-1.5">{r.status}</td>
                <td className="px-3 py-1.5 text-xs text-muted">
                  {formatUtcDate(r.createdAt)}
                </td>
                <td className="px-3 py-1.5 tabular-nums">
                  {r.executionTimeMs != null ? `${r.executionTimeMs}ms` : "—"}
                </td>
                <td className="px-3 py-1.5 text-xs">
                  {r.connectionName ?? "—"}
                </td>
                <td className="px-3 py-1.5 tabular-nums">
                  {r.agentSteps ?? "—"}
                </td>
                <td className="px-3 py-1.5 tabular-nums">
                  {r.sqlAttempts ?? "—"}
                </td>
                <td className="px-3 py-1.5 text-xs">{r.chartType ?? "—"}</td>
                <td className="px-3 py-1.5 tabular-nums text-xs">
                  {formatCompact(r.inputTokens + r.outputTokens)}
                </td>
                <td className="px-3 py-1.5 font-mono text-[11px] text-danger">
                  {r.errorCode ?? ""}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
        <div className="mt-3 flex justify-between text-xs text-muted">
          <span>
            {formatInt(data.runs.total)} runs · page {data.runs.page}/
            {runsTotalPages}
          </span>
          <div className="flex gap-2">
            {data.runs.page > 1 ? (
              <Link
                href={`/users/${encodeURIComponent(data.userId)}?runsPage=${data.runs.page - 1}`}
                className="text-accent"
              >
                Previous
              </Link>
            ) : null}
            {data.runs.page < runsTotalPages ? (
              <Link
                href={`/users/${encodeURIComponent(data.userId)}?runsPage=${data.runs.page + 1}`}
                className="text-accent"
              >
                Next
              </Link>
            ) : null}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Connections (no credentials)">
          {data.connections.length === 0 ? (
            <EmptyState>None.</EmptyState>
          ) : (
            <DataTable
              headers={["Name", "Host", "Demo", "Status", "Schema", "Created"]}
            >
              {data.connections.map((c) => (
                <tr key={c.id}>
                  <td className="px-3 py-1.5">{c.name}</td>
                  <td className="px-3 py-1.5 font-mono text-xs">
                    {c.hostDisplay}
                  </td>
                  <td className="px-3 py-1.5">{c.isDemo ? "yes" : ""}</td>
                  <td className="px-3 py-1.5">{c.status}</td>
                  <td className="px-3 py-1.5 text-xs">
                    {c.schemaSyncStatus}
                    {c.lastSchemaSyncAt
                      ? ` · ${formatUtcDate(c.lastSchemaSyncAt)}`
                      : ""}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-muted">
                    {formatUtcDate(c.createdAt)}
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </Card>

        <Card title="Dashboards">
          {data.dashboards.length === 0 ? (
            <EmptyState>None.</EmptyState>
          ) : (
            <DataTable headers={["Name", "Mode", "Widgets", "Created"]}>
              {data.dashboards.map((d) => (
                <tr key={d.id}>
                  <td className="px-3 py-1.5">{d.name}</td>
                  <td className="px-3 py-1.5">{d.mode}</td>
                  <td className="px-3 py-1.5 tabular-nums">{d.widgetCount}</td>
                  <td className="px-3 py-1.5 text-xs text-muted">
                    {formatUtcDate(d.createdAt)}
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </Card>

        <Card title="Share links (no tokens/URLs)">
          {data.shares.length === 0 ? (
            <EmptyState>None.</EmptyState>
          ) : (
            <DataTable
              headers={[
                "Dashboard",
                "Created",
                "Expires",
                "Revoked",
                "Password",
                "Views",
              ]}
            >
              {data.shares.map((s) => (
                <tr key={s.id}>
                  <td className="px-3 py-1.5">{s.dashboardName}</td>
                  <td className="px-3 py-1.5 text-xs text-muted">
                    {formatUtcDate(s.createdAt)}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-muted">
                    {formatUtcDate(s.expiresAt)}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-muted">
                    {formatUtcDate(s.revokedAt)}
                  </td>
                  <td className="px-3 py-1.5">
                    {s.passwordProtected ? "yes" : "no"}
                  </td>
                  <td className="px-3 py-1.5 tabular-nums">{s.viewCount}</td>
                </tr>
              ))}
            </DataTable>
          )}
        </Card>

        <Card title="Conversations (titles excluded)">
          <p className="text-sm">
            Count: <strong>{data.conversationsSummary.count}</strong>
          </p>
          <p className="mt-1 text-xs text-muted">
            Last activity:{" "}
            {formatUtcDate(data.conversationsSummary.lastActivityAt)}
          </p>
        </Card>
      </div>

      <Card title="Admin actions">
        <ActionsPanel
          userId={data.userId}
          planId={plan.planId}
          status={plan.status}
          questionsToday={usage.questionsToday}
          questionsMonth={usage.questionsMonth}
          schemaRefreshesToday={usage.schemaRefreshesToday}
          overrides={plan.overrides}
        />
      </Card>

      <Card title="Admin audit trail for this user">
        {data.adminAudit.length === 0 ? (
          <EmptyState>No admin actions yet.</EmptyState>
        ) : (
          <DataTable headers={["When", "Action", "Actor", "Outcome"]}>
            {data.adminAudit.map((a) => (
              <tr key={a.id}>
                <td className="px-3 py-1.5 text-xs text-muted">
                  {formatUtcDate(a.createdAt)}
                </td>
                <td className="px-3 py-1.5 font-mono text-xs">{a.action}</td>
                <td className="px-3 py-1.5 font-mono text-[11px]">
                  {a.actorUserId ?? "—"}
                </td>
                <td className="px-3 py-1.5">{a.outcome}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>
    </div>
  );
}
