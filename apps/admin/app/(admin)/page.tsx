import Link from "next/link";
import { BarRow, Card, EmptyState, Kpi } from "@/components/ui";
import { formatCompact, formatInt, formatUtcDate } from "@/lib/format";
import { getOverviewData } from "@/lib/queries/overview";

export default async function OverviewPage() {
  const data = await getOverviewData();
  const { kpis } = data;
  const tokenMax = Math.max(
    1,
    ...data.tokensByProviderModel.map((t) => t.inputTokens + t.outputTokens),
  );
  const qMax = Math.max(1, ...data.questionsPerDay.map((d) => d.questionsAccepted));

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col gap-1 border-b border-border/50 pb-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Platform health and cost (UTC windows). Period tables first.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 animate-slide-up" style={{ animationDelay: "50ms", animationFillMode: "both" }}>
        <Kpi
          label="Questions today / month"
          value={`${formatInt(kpis.questionsToday)} / ${formatInt(kpis.questionsMonth)}`}
        />
        <Kpi
          label="LLM tokens this month"
          value={formatCompact(
            kpis.llmInputTokensMonth + kpis.llmOutputTokensMonth,
          )}
          hint={`in ${formatCompact(kpis.llmInputTokensMonth)} · out ${formatCompact(kpis.llmOutputTokensMonth)} · cached ${formatCompact(kpis.llmCachedTokensMonth)}`}
        />
        <Kpi
          label="Active users today / 7d / 30d"
          value={`${kpis.activeUsersToday} / ${kpis.activeUsers7d} / ${kpis.activeUsers30d}`}
        />
        <Kpi
          label="Quota blocks today"
          value={formatInt(kpis.quotaBlocksToday)}
          hint={`New plans this month: ${kpis.newPlansThisMonth}`}
        />
        <Kpi
          label="Question error rate (7d)"
          value={
            kpis.questionErrorRate7d == null
              ? "—"
              : `${(kpis.questionErrorRate7d * 100).toFixed(1)}%`
          }
          hint={`${kpis.questionsFailed7d} failed / ${kpis.questionsAccepted7d} accepted`}
        />
        <Kpi
          label="Plan distribution"
          value={`${data.planDistribution.free}F / ${data.planDistribution.pro}P`}
          hint={`${data.planDistribution.disabled} disabled`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 animate-slide-up" style={{ animationDelay: "150ms", animationFillMode: "both" }}>
        <Card title="Tokens by provider/model (this month)">
          {data.tokensByProviderModel.length === 0 ? (
            <EmptyState>No LLM usage this month.</EmptyState>
          ) : (
            data.tokensByProviderModel.map((t) => (
              <BarRow
                key={`${t.provider}:${t.model}`}
                label={`${t.provider} / ${t.model}`}
                value={t.inputTokens + t.outputTokens}
                max={tokenMax}
              />
            ))
          )}
        </Card>

        <Card title="Top 10 token consumers (this month)">
          {data.topConsumers.length === 0 ? (
            <EmptyState>No usage yet.</EmptyState>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.topConsumers.map((u) => (
                <li
                  key={u.userId}
                  className="flex items-center justify-between gap-2"
                >
                  <Link
                    href={`/users/${encodeURIComponent(u.userId)}`}
                    className="truncate font-mono text-xs text-primary hover:underline"
                  >
                    {u.userId}
                  </Link>
                  <span className="tabular-nums text-muted-foreground">
                    {formatCompact(u.inputTokens + u.outputTokens)} tok ·{" "}
                    {u.questionsAccepted} q
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Questions per day (last 30d)">
          <div className="flex h-28 items-end gap-0.5">
            {data.questionsPerDay.map((d) => {
              const h = Math.max(2, (d.questionsAccepted / qMax) * 100);
              return (
                <div
                  key={d.dayKey}
                  title={`${d.dayKey}: ${d.questionsAccepted}`}
                  className="flex-1 rounded-t-sm bg-primary/60 transition-colors hover:bg-primary"
                  style={{ height: `${h}%` }}
                />
              );
            })}
          </div>
        </Card>

        <Card title="Recent quota blocks & schema failures (24h)">
          {data.recentEvents.length === 0 ? (
            <EmptyState>Quiet last 24h.</EmptyState>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.recentEvents.map((e) => (
                <li key={e.id} className="flex flex-wrap gap-x-3 gap-y-0.5">
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {formatUtcDate(e.createdAt)}
                  </span>
                  <Link
                    href={`/events?type=${encodeURIComponent(e.eventType)}`}
                    className="text-primary hover:underline"
                  >
                    {e.eventType}
                  </Link>
                  {e.userId ? (
                    <Link
                      href={`/users/${encodeURIComponent(e.userId)}`}
                      className="truncate font-mono text-[11px] text-muted-foreground hover:underline"
                    >
                      {e.userId}
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
