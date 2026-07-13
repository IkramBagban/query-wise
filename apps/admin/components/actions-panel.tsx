"use client";

import { useState, useTransition } from "react";
import {
  resetUsageCountersAction,
  setAccountStatusAction,
  setQuotaOverridesAction,
  setUserPlanAction,
} from "@/lib/actions/admin-actions";

export function ActionsPanel({
  userId,
  planId,
  status,
  questionsToday,
  questionsMonth,
  schemaRefreshesToday,
  overrides,
}: {
  userId: string;
  planId: "free" | "pro";
  status: "active" | "disabled";
  questionsToday: number;
  questionsMonth: number;
  schemaRefreshesToday: number;
  overrides: {
    questionsPerDayOverride: number | null;
    questionsPerMonthOverride: number | null;
    maxConnectionsOverride: number | null;
    maxDashboardsOverride: number | null;
    schemaRefreshesPerDayOverride: number | null;
  };
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [planNotes, setPlanNotes] = useState("");
  const [dayOvr, setDayOvr] = useState(
    overrides.questionsPerDayOverride?.toString() ?? "",
  );
  const [monthOvr, setMonthOvr] = useState(
    overrides.questionsPerMonthOverride?.toString() ?? "",
  );
  const [connOvr, setConnOvr] = useState(
    overrides.maxConnectionsOverride?.toString() ?? "",
  );
  const [dashOvr, setDashOvr] = useState(
    overrides.maxDashboardsOverride?.toString() ?? "",
  );
  const [schemaOvr, setSchemaOvr] = useState(
    overrides.schemaRefreshesPerDayOverride?.toString() ?? "",
  );
  const [resetDay, setResetDay] = useState(true);
  const [resetMonth, setResetMonth] = useState(false);
  const [resetSchema, setResetSchema] = useState(false);
  const [suspendReason, setSuspendReason] = useState("");
  const [confirmId, setConfirmId] = useState("");

  function run(fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.ok) setMessage(result.message ?? "Done.");
      else setError(result.error ?? "Failed.");
    });
  }

  function parseOpt(v: string): number | null {
    const t = v.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

  return (
    <div className="space-y-6">
      {message ? (
        <p className="rounded-md border border-accent/30 bg-primary/10 px-3 py-2 text-sm text-primary">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Grant / revoke plan</h3>
        <p className="text-xs text-muted-foreground">
          Current: <strong>{planId}</strong>. Revoking to Free keeps existing
          resources (grandfathering) but blocks new creates above Free caps.
        </p>
        <input
          className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
          placeholder="Ops notes (optional)"
          value={planNotes}
          onChange={(e) => setPlanNotes(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending || planId === "pro"}
            className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            onClick={() =>
              run(() =>
                setUserPlanAction({
                  userId,
                  toPlanId: "pro",
                  notes: planNotes,
                }),
              )
            }
          >
            Grant Pro
          </button>
          <button
            type="button"
            disabled={pending || planId === "free"}
            className="rounded border border-border px-3 py-1.5 text-sm disabled:opacity-40"
            onClick={() => {
              if (
                !confirm(
                  "Revoke to Free? User keeps existing dashboards/connections but cannot create more until under Free caps.",
                )
              ) {
                return;
              }
              run(() =>
                setUserPlanAction({
                  userId,
                  toPlanId: "free",
                  notes: planNotes,
                }),
              );
            }}
          >
            Revoke to Free
          </button>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Quota overrides</h3>
        <p className="text-xs text-muted-foreground">
          Empty = catalog default. Values clamped 0–10,000. Product resolves{" "}
          <code className="text-muted-foreground">override ?? catalog</code>.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["Questions / day", dayOvr, setDayOvr],
              ["Questions / month", monthOvr, setMonthOvr],
              ["Max connections", connOvr, setConnOvr],
              ["Max dashboards", dashOvr, setDashOvr],
              ["Schema refreshes / day", schemaOvr, setSchemaOvr],
            ] as const
          ).map(([label, val, set]) => (
            <label key={label} className="block text-xs text-muted-foreground">
              {label}
              <input
                className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                value={val}
                onChange={(e) => set(e.target.value)}
                inputMode="numeric"
              />
            </label>
          ))}
        </div>
        <button
          type="button"
          disabled={pending}
          className="rounded bg-muted px-3 py-1.5 text-sm"
          onClick={() =>
            run(() =>
              setQuotaOverridesAction({
                userId,
                questionsPerDayOverride: parseOpt(dayOvr),
                questionsPerMonthOverride: parseOpt(monthOvr),
                maxConnectionsOverride: parseOpt(connOvr),
                maxDashboardsOverride: parseOpt(dashOvr),
                schemaRefreshesPerDayOverride: parseOpt(schemaOvr),
              }),
            )
          }
        >
          Save overrides
        </button>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Reset usage counters</h3>
        <p className="text-xs text-muted-foreground">
          Today: {questionsToday} questions, {schemaRefreshesToday} schema
          refreshes · This month: {questionsMonth} questions. Lifetime totals
          and event history are never touched.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={resetDay}
            onChange={(e) => setResetDay(e.target.checked)}
          />
          Reset today&apos;s day period
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={resetMonth}
            onChange={(e) => setResetMonth(e.target.checked)}
          />
          Reset this month&apos;s period
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={resetSchema}
            onChange={(e) => setResetSchema(e.target.checked)}
          />
          Also zero schema refreshes (day only)
        </label>
        <button
          type="button"
          disabled={pending}
          className="rounded border border-border px-3 py-1.5 text-sm"
          onClick={() =>
            run(() =>
              resetUsageCountersAction({
                userId,
                resetDay,
                resetMonth,
                includeSchemaRefreshes: resetSchema,
              }),
            )
          }
        >
          Reset counters
        </button>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">
          {status === "disabled" ? "Reactivate account" : "Suspend account"}
        </h3>
        <p className="text-xs text-muted-foreground">
          Suspended accounts get <code className="text-muted-foreground">ACCOUNT_DISABLED</code>{" "}
          on mutations; reads still work.
        </p>
        <textarea
          className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
          rows={2}
          placeholder="Reason (required)"
          value={suspendReason}
          onChange={(e) => setSuspendReason(e.target.value)}
        />
        <input
          className="w-full rounded border border-border bg-background px-2 py-1.5 font-mono text-sm"
          placeholder="Type Clerk user id to confirm"
          value={confirmId}
          onChange={(e) => setConfirmId(e.target.value)}
        />
        <button
          type="button"
          disabled={pending}
          className={
            status === "disabled"
              ? "rounded bg-primary px-3 py-1.5 text-sm font-medium text-white"
              : "rounded bg-danger/90 px-3 py-1.5 text-sm font-medium text-white"
          }
          onClick={() =>
            run(() =>
              setAccountStatusAction({
                userId,
                status: status === "disabled" ? "active" : "disabled",
                reason: suspendReason,
                confirmToken: confirmId,
              }),
            )
          }
        >
          {status === "disabled" ? "Reactivate" : "Suspend"}
        </button>
      </section>
    </div>
  );
}
