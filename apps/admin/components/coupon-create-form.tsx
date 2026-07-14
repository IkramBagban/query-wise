"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createCouponAction } from "@/lib/actions/coupon-actions";

const DELTA_FIELDS = [
  ["questionsPerDayDelta", "Questions / day"],
  ["questionsPerMonthDelta", "Questions / month"],
  ["maxConnectionsDelta", "Max connections"],
  ["maxDashboardsDelta", "Max dashboards"],
] as const;

type DeltaKey = (typeof DELTA_FIELDS)[number][0];

export function CouponCreateForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [deltas, setDeltas] = useState<Record<DeltaKey, string>>({
    questionsPerDayDelta: "",
    questionsPerMonthDelta: "",
    maxConnectionsDelta: "",
    maxDashboardsDelta: "",
  });
  const [grantsPro, setGrantsPro] = useState(false);
  const [grantDurationDays, setGrantDurationDays] = useState("14");
  const [redeemableUntil, setRedeemableUntil] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState("");

  function parseOptInt(value: string): number | null {
    const t = value.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  }

  function submit() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result: { ok: boolean; message?: string; error?: string } =
        await createCouponAction({
          code: code.trim() || null,
          label: label.trim() || null,
          questionsPerDayDelta: parseOptInt(deltas.questionsPerDayDelta) ?? 0,
          questionsPerMonthDelta: parseOptInt(deltas.questionsPerMonthDelta) ?? 0,
          maxConnectionsDelta: parseOptInt(deltas.maxConnectionsDelta) ?? 0,
          maxDashboardsDelta: parseOptInt(deltas.maxDashboardsDelta) ?? 0,
          grantsPro,
          grantDurationDays: Number(grantDurationDays) || 0,
          redeemableUntil: redeemableUntil ? new Date(redeemableUntil).toISOString() : null,
          maxRedemptions: parseOptInt(maxRedemptions),
        });
      if (result.ok) {
        setMessage(result.message ?? "Coupon created.");
        router.push("/coupons");
      } else {
        setError(result.error ?? "Coupon creation failed.");
      }
    });
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
        <h3 className="text-sm font-semibold text-foreground">Identity</h3>
        <label className="block text-xs text-muted-foreground">
          Code (blank = auto-generate an 8-char code)
          <input
            className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1.5 font-mono text-sm uppercase text-foreground"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="LAUNCH50"
          />
        </label>
        <p className="text-xs text-muted-foreground">
          Vanity codes are guessable — prefer auto-generated codes for wide distribution.
        </p>
        <label className="block text-xs text-muted-foreground">
          Label (admin-facing, optional)
          <input
            className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Launch week"
          />
        </label>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Benefit bundle</h3>
        <p className="text-xs text-muted-foreground">
          Additive deltas, clamped 0–10,000. At least one benefit (or Pro) is required.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {DELTA_FIELDS.map(([key, labelText]) => (
            <label key={key} className="block text-xs text-muted-foreground">
              {labelText}
              <input
                className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                value={deltas[key]}
                onChange={(e) => setDeltas((prev) => ({ ...prev, [key]: e.target.value }))}
                inputMode="numeric"
                placeholder="0"
              />
            </label>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={grantsPro} onChange={(e) => setGrantsPro(e.target.checked)} />
          Grant Pro features for the window
        </label>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Grant duration</h3>
        <label className="block text-xs text-muted-foreground">
          Days the benefit lasts after redemption (1–3,650)
          <input
            className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground"
            value={grantDurationDays}
            onChange={(e) => setGrantDurationDays(e.target.value)}
            inputMode="numeric"
          />
        </label>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Redemption window (optional)</h3>
        <p className="text-xs text-muted-foreground">Both blank = unlimited. Independent constraints.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block text-xs text-muted-foreground">
            Redeemable until (UTC)
            <input
              type="datetime-local"
              className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground"
              value={redeemableUntil}
              onChange={(e) => setRedeemableUntil(e.target.value)}
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            Max redemptions
            <input
              className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground"
              value={maxRedemptions}
              onChange={(e) => setMaxRedemptions(e.target.value)}
              inputMode="numeric"
              placeholder="unlimited"
            />
          </label>
        </div>
      </section>

      <button
        type="button"
        disabled={pending}
        className="rounded bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        onClick={submit}
      >
        {pending ? "Creating…" : "Create coupon"}
      </button>
    </div>
  );
}
