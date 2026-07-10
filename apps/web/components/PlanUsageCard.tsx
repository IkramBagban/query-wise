"use client";

import { Gauge, Sparkles } from "lucide-react";

import { Card } from "@/components/ui/card";
import { usePlanUsage } from "@/lib/plans/use-plan-usage";

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const atCap = used >= limit;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">{label}</span>
        <span className={atCap ? "font-medium text-accent-strong" : "text-faint"}>
          {used} / {limit}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className={`h-full rounded-full ${atCap ? "bg-accent-strong" : "bg-accent"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Plan badge + usage meters for the settings page. Reads the read-only plan/usage
 * endpoint. The Pro upgrade control is intentionally disabled (coming soon).
 */
export function PlanUsageCard() {
  const { data, loading, error } = usePlanUsage();

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-syne text-lg font-semibold">
          <Gauge className="h-5 w-5 text-accent-strong" />
          Plan &amp; usage
        </h2>
        {data ? (
          <span className="rounded-full border border-border bg-surface-2 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted">
            {data.plan.displayName}
          </span>
        ) : null}
      </div>

      {loading ? (
        <p className="mt-3 text-sm text-faint">Loading usage…</p>
      ) : error ? (
        <p className="mt-3 text-sm text-faint">Usage is temporarily unavailable.</p>
      ) : data ? (
        <div className="mt-4 space-y-4">
          {data.plan.status === "disabled" ? (
            <p className="rounded-lg border border-border bg-surface-2 p-3 text-sm text-accent-strong">
              This account is disabled. You can still view and export your data. Contact support.
            </p>
          ) : null}
          <div className="space-y-3">
            <Meter label="Questions today" used={data.usage.questionsToday} limit={data.limits.questionsPerDay} />
            <Meter label="Questions this month" used={data.usage.questionsThisMonth} limit={data.limits.questionsPerMonth} />
            <Meter label="Connections" used={data.usage.connectionsNonDemo} limit={data.limits.maxConnectionsNonDemo} />
            <Meter label="Dashboards" used={data.usage.dashboards} limit={data.limits.maxDashboards} />
            <Meter label="Active public shares" used={data.usage.activeShareLinks} limit={data.limits.maxActiveShareLinks} />
          </div>
          <p className="text-xs text-faint">Limits reset daily / monthly (UTC).</p>
          {data.plan.id === "free" ? (
            <button
              type="button"
              disabled
              className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-accent-line bg-accent-soft px-4 py-2.5 text-sm font-semibold text-accent-strong opacity-90"
            >
              <Sparkles className="h-4 w-4" />
              Upgrade to Pro — coming soon
            </button>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
