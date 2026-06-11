"use client";

import { FormEvent, useState } from "react";
import { LockKeyhole, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ErrorState, LoadingState } from "@/components/v2/ResourceState";
import { V2Chart } from "@/components/v2/V2Chart";
import { useApiResource } from "@/hooks/v2";
import { publicSharesApi, V2ApiError } from "@/lib/v2/api-client";

export function PublicShareView({ token }: { token: string }) {
  const [password, setPassword] = useState(""); const [unlockError, setUnlockError] = useState<string | null>(null); const [unlocking, setUnlocking] = useState(false);
  const resource = useApiResource(() => publicSharesApi.get(token), [token]);
  const passwordRequired = resource.error instanceof V2ApiError && resource.error.code === "SHARE_PASSWORD_REQUIRED";
  async function unlock(event: FormEvent) { event.preventDefault(); setUnlocking(true); setUnlockError(null); try { await publicSharesApi.unlock(token, password); setPassword(""); await resource.refresh(); } catch (reason) { setUnlockError(reason instanceof Error ? reason.message : "Unable to unlock share"); } finally { setUnlocking(false); } }
  if (resource.loading) return <div className="mx-auto max-w-6xl p-6"><LoadingState label="Loading shared dashboard" /></div>;
  if (passwordRequired) return <main className="flex min-h-screen items-center justify-center p-5"><Card className="w-full max-w-md p-6"><LockKeyhole className="h-7 w-7 text-accent-2" /><h1 className="mt-4 font-syne text-2xl font-semibold">Password required</h1><p className="mt-1 text-sm text-text-3">Enter the password provided by the dashboard owner.</p><form onSubmit={unlock} className="mt-5 space-y-3"><Input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} label="Share password" />{unlockError ? <p className="text-sm text-danger">{unlockError}</p> : null}<Button className="w-full" type="submit" loading={unlocking}>Unlock dashboard</Button></form></Card></main>;
  if (resource.error || !resource.data) return <div className="mx-auto max-w-4xl p-6"><ErrorState title="Shared dashboard unavailable" error={resource.error ?? new Error("Share not found")} onRetry={() => void resource.refresh()} /></div>;
  const data = resource.data;
  return <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8"><header className="flex items-start gap-3"><span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent"><Sparkles className="h-5 w-5" /></span><div><p className="text-xs uppercase tracking-[0.18em] text-text-3">Shared QueryWise dashboard</p><h1 className="font-syne text-3xl font-semibold">{data.dashboard.name}</h1><p className="text-xs text-text-3">Updated {new Date(data.dashboard.updatedAt).toLocaleString()}</p></div></header><div className="grid gap-4 lg:grid-cols-2">{data.dashboard.widgets.map((widget) => <Card key={widget.id} className="overflow-hidden"><h2 className="border-b border-border px-4 py-3 font-medium">{widget.title}</h2><div className="min-h-64 p-3"><V2Chart preview={widget.result} config={widget.chartConfig} /></div></Card>)}</div></main>;
}
