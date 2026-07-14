"use client";

import { Check, Database, Gauge, LayoutDashboard, RefreshCw, ShieldCheck, Share2 } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { RedeemCouponCard } from "@/components/RedeemCouponCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePlanUsage, type PlanUsageDto } from "@/lib/plans/use-plan-usage";

function getResetSummary() {
  const now = new Date();
  const nextDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const format = (value: Date) => new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(value);

  return { daily: format(nextDay), monthly: format(nextMonth) };
}

function IncludedFeature({ children }: { children: React.ReactNode }) {
  return <li className="flex items-start gap-2 text-sm text-muted-foreground"><Check className="mt-0.5 size-4 shrink-0 text-primary" />{children}</li>;
}

function ResourceMeter({
  icon: Icon,
  label,
  used,
  limit,
}: {
  icon: typeof Database;
  label: string;
  used: number;
  limit: number;
}) {
  const percentage = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const isNearLimit = percentage >= 80;

  return (
    <div className="min-w-0 py-1 sm:border-l sm:border-border sm:px-5 sm:first:border-l-0 sm:first:pl-0">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-medium text-foreground"><Icon className="size-4 text-primary" />{label}</span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">{used} / {limit}</span>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className={`h-full rounded-full transition-[width] duration-500 ${isNearLimit ? "bg-warning" : "bg-primary"}`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

function PlanDetails({ data, onRedeemed }: { data: PlanUsageDto; onRedeemed: () => void }) {
  const resets = getResetSummary();
  const isFree = data.plan.id === "free";
  const questionProgress = data.limits.questionsPerMonth > 0
    ? Math.min(100, Math.round((data.usage.questionsThisMonth / data.limits.questionsPerMonth) * 100))
    : 0;

  return (
    <div className="flex flex-col gap-8">
      <Card className="px-6 py-6 sm:px-7">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">{data.plan.displayName} plan</span>
              <span className="h-3 w-px bg-border" aria-hidden="true" />
              <span className="text-sm text-muted-foreground">{isFree ? "No payment method required" : "Pro features are active"}</span>
            </div>
            <div className="mt-6 flex items-baseline gap-3">
              <p className="font-syne text-5xl font-semibold leading-none tracking-[-0.055em] tabular-nums text-foreground sm:text-6xl">{data.remaining.questionsThisMonth}</p>
              <p className="text-base font-medium text-foreground">questions left this month</p>
            </div>
            <p className="mt-3 max-w-xl text-sm text-muted-foreground">{data.usage.questionsThisMonth} of {data.limits.questionsPerMonth} used · resets {resets.monthly}</p>
          </div>
          <div className="border-l-2 border-primary pl-4">
            <div className="flex items-center justify-between text-sm"><span className="flex items-center gap-2 font-medium text-foreground"><Gauge className="size-4 text-primary" />Today</span><span className="font-mono text-xs tabular-nums text-muted-foreground">{data.remaining.questionsToday} left</span></div>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true"><div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${questionProgress}%` }} /></div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{data.usage.questionsToday} of {data.limits.questionsPerDay} used · resets {resets.daily}</p>
          </div>
        </div>
      </Card>

      <section className="border-y border-border py-5" aria-labelledby="resources-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="resources-heading" className="font-syne text-xl font-semibold tracking-tight text-foreground">Workspace capacity</h2>
          <p className="text-xs text-muted-foreground">Usage updates automatically</p>
        </div>
        <div className="mt-5 grid gap-5 sm:grid-cols-3 sm:gap-0">
          <ResourceMeter icon={Database} label="Connections" used={data.usage.connectionsNonDemo} limit={data.limits.maxConnectionsNonDemo} />
          <ResourceMeter icon={LayoutDashboard} label="Dashboards" used={data.usage.dashboards} limit={data.limits.maxDashboards} />
          <ResourceMeter icon={Share2} label="Share links" used={data.usage.activeShareLinks} limit={data.limits.maxActiveShareLinks} />
        </div>
      </section>

      <RedeemCouponCard grants={data.activeGrants} onRedeemed={onRedeemed} />

      <section aria-labelledby="included-heading">
        <h2 id="included-heading" className="font-syne text-xl font-semibold tracking-tight text-foreground">Included with your plan</h2>
        <ul className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
          <IncludedFeature>{data.limits.maxConnectionsNonDemo} database connection{data.limits.maxConnectionsNonDemo === 1 ? "" : "s"}</IncludedFeature>
          <IncludedFeature>{data.limits.maxDashboards} dashboard{data.limits.maxDashboards === 1 ? "" : "s"}</IncludedFeature>
          <IncludedFeature>{data.limits.schemaRefreshesPerDay} schema refresh{data.limits.schemaRefreshesPerDay === 1 ? "" : "es"} each day</IncludedFeature>
          <IncludedFeature>{data.limits.allowPasswordShares ? "Password-protected sharing" : "Read-only public sharing"}</IncludedFeature>
          <IncludedFeature>Automatic charts and generated SQL visibility</IncludedFeature>
        </ul>
      </section>

      {data.plan.status === "disabled" ? (
        <Card className="flex items-start gap-3 border-destructive/30 bg-destructive/10 p-5 shadow-sm">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-destructive" />
          <div><h2 className="font-semibold text-foreground">Account disabled</h2><p className="mt-1 text-sm text-muted-foreground">You can still view and export your data. Contact support to restore account access.</p></div>
        </Card>
      ) : null}
    </div>
  );
}

function PlanUsageLoading() {
  return (
    <div className="flex flex-col gap-8" aria-label="Loading plan details" aria-busy="true">
      <Card className="px-6 py-6 sm:px-7">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-center">
          <div>
            <Skeleton className="h-3 w-44" />
            <div className="mt-6 flex items-baseline gap-3"><Skeleton className="h-14 w-24" /><Skeleton className="h-5 w-48" /></div>
            <Skeleton className="mt-4 h-4 w-full max-w-md" />
          </div>
          <div className="border-l-2 border-border pl-4"><Skeleton className="h-4 w-full" /><Skeleton className="mt-3 h-1 w-full" /><Skeleton className="mt-3 h-3 w-4/5" /></div>
        </div>
      </Card>

      <section className="border-y border-border py-5">
        <Skeleton className="h-5 w-44" />
        <div className="mt-5 grid gap-5 sm:grid-cols-3 sm:gap-0">
          {["connections", "dashboards", "shares"].map((key) => (
            <div key={key} className="py-1 sm:border-l sm:border-border sm:px-5 sm:first:border-l-0 sm:first:pl-0"><Skeleton className="h-4 w-full" /><Skeleton className="mt-3 h-1 w-full" /></div>
          ))}
        </div>
      </section>

      <Card className="p-5 sm:p-6"><Skeleton className="h-5 w-40" /><Skeleton className="mt-3 h-4 w-full max-w-sm" /><div className="mt-6 flex gap-2"><Skeleton className="h-10 flex-1" /><Skeleton className="h-10 w-32" /></div></Card>

      <section><Skeleton className="h-5 w-48" /><div className="mt-4 grid gap-3 sm:grid-cols-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /><Skeleton className="h-4 w-11/12" /><Skeleton className="h-4 w-4/5" /></div></section>
    </div>
  );
}

export function PlanUsageView() {
  const { data, loading, error, refresh } = usePlanUsage();

  return (
    <div className="p-4 sm:p-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <PageHeader
          eyebrow="Account"
          title="Your plan"
          description="Your question allowance and what is included."
          actions={<Button variant="ghost" size="sm" onClick={refresh} disabled={loading}><RefreshCw data-icon="inline-start" />Refresh</Button>}
        />
        {loading ? <PlanUsageLoading /> : null}
        {error ? <Card className="p-5 shadow-sm"><p className="font-medium text-foreground">Usage is temporarily unavailable.</p><p className="mt-1 text-sm text-muted-foreground">Please try again in a moment.</p></Card> : null}
        {data ? <PlanDetails data={data} onRedeemed={refresh} /> : null}
      </div>
    </div>
  );
}
