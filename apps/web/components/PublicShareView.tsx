"use client";

import { FormEvent, useState } from "react";
import { AlertTriangle, LockKeyhole } from "lucide-react";

import { BrandMark } from "@/components/brand/BrandMark";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ResourceState";
import { V2Chart, previewToQueryResult } from "@/components/V2Chart";
import { resolveView } from "@/lib/charts/views";
import { useApiResource } from "@/hooks";
import { publicSharesApi, V2ApiError } from "@/lib/api-client";
import type { BoundedResultPreview, ChartConfig, PublicChartConfig, ViewTransform } from "@query-wise/shared/types";

/**
 * SPEC-09 §2.3: a shared widget re-applies its pinned transform client-side on the
 * shared preview — same rows, different arrangement, no new data exposure.
 */
function PublicWidgetChart({
  result,
  chartConfig,
  viewTransform,
}: {
  result: BoundedResultPreview;
  chartConfig: PublicChartConfig;
  viewTransform: ViewTransform | null;
}) {
  const resolved = viewTransform
    ? resolveView(previewToQueryResult(result), {
        id: "public",
        chartConfig: chartConfig as ChartConfig,
        transform: viewTransform,
      })
    : null;
  return (
    <V2Chart
      preview={result}
      config={(resolved?.config ?? chartConfig) as ChartConfig}
      resultOverride={resolved?.result}
    />
  );
}

function PublicWidgetSkeleton() {
  const barHeights = ["h-[44%]", "h-[66%]", "h-[52%]", "h-[80%]", "h-[59%]", "h-[72%]", "h-[48%]"];

  return (
    <Card className="flex min-h-72 flex-col overflow-hidden rounded-2xl border-border/70">
      <div className="flex items-center justify-between px-4 pb-2 pt-3"><Skeleton className="h-4 w-36" /><Skeleton className="size-5 rounded-md" /></div>
      <div className="relative mx-4 mb-4 min-h-52 flex-1 overflow-hidden rounded-lg" aria-hidden="true">
        <div className="absolute inset-x-0 top-3 space-y-8 opacity-75">{["grid-1", "grid-2", "grid-3", "grid-4"].map((key) => <div key={key} className="h-px bg-border" />)}</div>
        <div className="absolute inset-x-4 bottom-6 top-5 flex items-end justify-between gap-2">{barHeights.map((height, index) => <Skeleton key={index} className={`w-full max-w-10 rounded-t-sm rounded-b-none ${height}`} />)}</div>
        <div className="absolute inset-x-0 bottom-0 flex justify-between">{["axis-1", "axis-2", "axis-3", "axis-4"].map((key) => <Skeleton key={key} className="h-2 w-7" />)}</div>
      </div>
    </Card>
  );
}

function PublicShareSkeleton() {
  return (
    <main className="mx-auto max-w-7xl space-y-4 p-4 sm:p-8" aria-label="Loading shared dashboard" aria-busy="true">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
        <div className="flex items-center gap-3"><Skeleton className="size-9 rounded-xl" /><div><Skeleton className="h-3 w-32" /><Skeleton className="mt-2 h-7 w-56" /></div></div>
        <Skeleton className="h-4 w-20" />
      </header>
      <div className="grid auto-rows-[19rem] gap-4 lg:grid-cols-2">{Array.from({ length: 4 }).map((_, index) => <PublicWidgetSkeleton key={index} />)}</div>
    </main>
  );
}

export function PublicShareView({ token }: { token: string }) {
  const [password, setPassword] = useState(""); const [unlockError, setUnlockError] = useState<string | null>(null); const [unlocking, setUnlocking] = useState(false);
  const resource = useApiResource((signal) => publicSharesApi.get(token, signal), token);
  const apiError = resource.error instanceof V2ApiError ? resource.error : null;
  const passwordRequired = apiError?.requiresPassword || apiError?.code === "SHARE_PASSWORD_REQUIRED";
  async function unlock(event: FormEvent) { event.preventDefault(); setUnlocking(true); setUnlockError(null); try { await publicSharesApi.unlock(token, password); setPassword(""); await resource.refresh(); } catch (reason) { const error = reason instanceof V2ApiError && reason.code === "SHARE_PASSWORD_INVALID" ? new Error("Incorrect password") : reason; setUnlockError(error instanceof Error ? error.message : "Unable to unlock share"); } finally { setUnlocking(false); } }
  if (resource.loading) return <PublicShareSkeleton />;
  if (passwordRequired) return <main className="flex min-h-screen items-center justify-center p-5"><Card className="w-full max-w-md p-6"><LockKeyhole className="h-7 w-7 text-accent-strong" /><h1 className="mt-4 font-syne text-2xl font-semibold">Password required</h1><p className="mt-1 text-sm text-faint">Enter the password provided by the dashboard owner.</p><form onSubmit={unlock} className="mt-5 space-y-3"><Input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} label="Share password" />{unlockError ? <p className="text-sm text-danger">{unlockError}</p> : null}<Button className="w-full" type="submit" loading={unlocking}>Unlock dashboard</Button></form></Card></main>;
  if (resource.error || !resource.data) {
    const title = apiError?.code === "SHARE_EXPIRED" ? "This link has expired" : apiError?.code === "SHARE_REVOKED_OR_NOT_FOUND" ? "This link has been revoked" : "Shared dashboard unavailable";
    const message = apiError?.code === "SHARE_EXPIRED" ? "Ask the dashboard owner for a new share link." : apiError?.code === "SHARE_REVOKED_OR_NOT_FOUND" ? "This share link is no longer available." : (resource.error?.message ?? "Share not found");
    return <div className="mx-auto max-w-4xl p-6"><ErrorState title={title} error={new Error(message)} onRetry={() => void resource.refresh()} /></div>;
  }
  const data = resource.data;
  return (
    <main className="mx-auto max-w-7xl space-y-4 p-4 sm:p-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
        <div className="flex min-w-0 items-center gap-3">
          <BrandMark className="size-9 shrink-0 rounded-xl" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">Shared dashboard</p>
            <h1 className="mt-1 truncate font-syne text-2xl font-semibold tracking-tight text-text sm:text-3xl">{data.dashboard.name}</h1>
          </div>
        </div>
        <span className="text-xs font-medium text-muted">Read-only</span>
      </header>

      <div className="grid auto-rows-[19rem] gap-4 lg:grid-cols-2">
        {data.dashboard.widgets.map((widget) => (
          <Card key={widget.id} className="flex h-full flex-col overflow-hidden rounded-2xl border-border/70">
            <h2 className="px-4 pb-2 pt-3 font-syne text-sm font-semibold text-text">{widget.title}</h2>
            <div className="min-h-0 flex-1 overflow-hidden p-4">
              {widget.result ? (
                <div className="h-full w-full">
                  <PublicWidgetChart
                    result={widget.result}
                    chartConfig={widget.chartConfig}
                    viewTransform={widget.viewTransform ?? null}
                  />
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center rounded-lg border border-warning/30 bg-warning/10 p-5 text-center">
                  <AlertTriangle className="h-6 w-6 text-warning" />
                  <p className="mt-2 text-sm font-medium">Chart unavailable</p>
                  <p className="mt-1 max-w-md text-xs text-faint">{widget.error?.message ?? "This chart could not be refreshed."}</p>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>
    </main>
  );
}
