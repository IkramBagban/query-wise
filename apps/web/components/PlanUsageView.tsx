"use client";

import { Check, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
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

function PlanDetails({ data }: { data: PlanUsageDto }) {
  const resets = getResetSummary();
  const isFree = data.plan.id === "free";
  const questionProgress = data.limits.questionsPerMonth > 0
    ? Math.min(100, Math.round((data.usage.questionsThisMonth / data.limits.questionsPerMonth) * 100))
    : 0;

  return (
    <div className="flex flex-col gap-8">
      <Card className="relative overflow-hidden px-6 py-7 sm:px-8 sm:py-9">
        <div className="absolute -right-12 -top-16 size-56 rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />
        <div className="relative flex flex-col gap-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="rounded-full bg-primary/10 px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-primary">{data.plan.displayName} plan</span>
            {isFree ? <span className="text-sm text-muted-foreground">No payment method required</span> : <span className="text-sm text-muted-foreground">Pro features are active</span>}
          </div>
          <div className="max-w-2xl">
            <p className="font-syne text-5xl font-semibold tracking-tight sm:text-6xl text-foreground">{data.remaining.questionsThisMonth}</p>
            <h2 className="mt-1 font-syne text-2xl font-semibold sm:text-3xl text-foreground">AI questions left this month</h2>
            <p className="mt-2 text-sm text-muted-foreground">{data.usage.questionsThisMonth} of {data.limits.questionsPerMonth} used. Your monthly allowance resets {resets.monthly}.</p>
          </div>
          <div className="max-w-2xl">
            <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${questionProgress}%` }} /></div>
            <p className="mt-3 text-sm text-muted-foreground"><span className="font-medium text-foreground">Today:</span> {data.remaining.questionsToday} of {data.limits.questionsPerDay} questions remaining. Resets {resets.daily}.</p>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section>
          <h2 className="font-syne text-2xl font-semibold tracking-tight text-foreground">What your plan includes</h2>
          <p className="mt-1 text-sm text-muted-foreground">Your limits are applied automatically when you create something new.</p>
          <ul className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">
            <IncludedFeature>{data.limits.maxConnectionsNonDemo} database connection{data.limits.maxConnectionsNonDemo === 1 ? "" : "s"}, plus the demo database</IncludedFeature>
            <IncludedFeature>{data.limits.maxDashboards} dashboard{data.limits.maxDashboards === 1 ? "" : "s"}</IncludedFeature>
            <IncludedFeature>{data.limits.maxActiveShareLinks} active public share{data.limits.maxActiveShareLinks === 1 ? "" : "s"}</IncludedFeature>
            <IncludedFeature>{data.limits.schemaRefreshesPerDay} schema refresh{data.limits.schemaRefreshesPerDay === 1 ? "" : "es"} each day</IncludedFeature>
            <IncludedFeature>Automatic charts and generated SQL visibility</IncludedFeature>
            <IncludedFeature>{data.limits.allowPasswordShares ? "Password-protected sharing" : "Read-only public sharing"}</IncludedFeature>
          </ul>
        </section>

        {isFree ? (
          <Card className="flex flex-col gap-4 p-5 shadow-sm">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Sparkles className="size-4" /></div>
            <div><h2 className="font-syne text-lg font-semibold text-foreground">Need more room?</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Pro will add higher limits and password-protected sharing. Checkout is not available yet.</p></div>
            <Button disabled className="w-full"><Sparkles data-icon="inline-start" />Coming soon</Button>
          </Card>
        ) : null}
      </div>

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
  return <div className="flex flex-col gap-6"><Skeleton className="h-80 rounded-2xl" /><div className="grid gap-4 sm:grid-cols-2"><Skeleton className="h-32" /><Skeleton className="h-32" /></div></div>;
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
        {data ? <PlanDetails data={data} /> : null}
      </div>
    </div>
  );
}
