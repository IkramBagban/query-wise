"use client";

import { useState } from "react";
import { Check, Gift, Sparkles, Ticket } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ActiveGrantDto } from "@/lib/plans/dto";

const FRIENDLY_ERROR: Record<string, string> = {
  COUPON_NOT_FOUND: "That code is not valid. Check for typos and try again.",
  COUPON_INACTIVE: "This coupon is no longer available.",
  COUPON_EXPIRED: "This coupon has expired.",
  COUPON_FULLY_REDEEMED: "This coupon has reached its redemption limit.",
  COUPON_ALREADY_REDEEMED: "You have already redeemed this coupon.",
  ACCOUNT_DISABLED: "Your account is disabled. Contact support to redeem.",
  RATE_LIMITED: "Too many attempts. Please wait a minute and try again.",
};

function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

function formatExpiry(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

function benefitLabels(grant: ActiveGrantDto): string[] {
  const parts: string[] = [];
  if (grant.grantsPro) parts.push("Pro features");
  if (grant.questionsPerDayDelta) parts.push(`+${grant.questionsPerDayDelta} questions/day`);
  if (grant.questionsPerMonthDelta) parts.push(`+${grant.questionsPerMonthDelta} questions/month`);
  if (grant.maxConnectionsDelta) parts.push(`+${grant.maxConnectionsDelta} connections`);
  if (grant.maxDashboardsDelta) parts.push(`+${grant.maxDashboardsDelta} dashboards`);
  return parts;
}

function ActiveBoosts({ grants }: { grants: ActiveGrantDto[] }) {
  if (grants.length === 0) return null;
  return (
    <section className="border-t border-border pt-5" aria-labelledby="active-boosts-heading">
      <div className="flex items-center justify-between gap-3">
        <h3 id="active-boosts-heading" className="flex items-center gap-2 text-sm font-semibold text-foreground">
          Active boosts
        </h3>
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">{grants.length} active</span>
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {grants.map((grant, index) => {
          const labels = benefitLabels(grant);
          const days = daysUntil(grant.grantExpiresAt);
          return (
            <li
              key={`${grant.couponCode}-${index}`}
              className="rounded-lg border border-border bg-background/50 px-3.5 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                <span className="font-mono text-xs font-semibold uppercase tracking-wide text-foreground">{grant.couponCode}</span>
                <span className="text-xs text-muted-foreground">{days > 0 ? `${days} day${days === 1 ? "" : "s"} remaining` : "expires today"}</span>
              </div>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">{labels.join(" · ") || "Entitlement boost"}</p>
              <p className="mt-2 text-xs text-faint">Active through {formatExpiry(grant.grantExpiresAt)}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function RedeemCouponCard({
  grants,
  onRedeemed,
}: {
  grants: ActiveGrantDto[];
  onRedeemed: () => void;
}) {
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const trimmed = code.trim();
    if (!trimmed || pending) return;
    setPending(true);
    setSuccess(null);
    setError(null);
    try {
      const response = await fetch("/api/coupons/redeem", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ code: trimmed }),
      });
      const json = (await response.json().catch(() => null)) as
        | { data?: { grantExpiresAt: string }; error?: { code?: string; message?: string } }
        | null;
      if (!response.ok || !json?.data) {
        const errCode = json?.error?.code ?? "";
        setError(FRIENDLY_ERROR[errCode] ?? json?.error?.message ?? "Could not redeem this code.");
        return;
      }
      setCode("");
      setSuccess(`Coupon redeemed. Your boost is active until ${formatExpiry(json.data.grantExpiresAt)}.`);
      onRedeemed();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="relative overflow-hidden p-5 shadow-[0_20px_44px_-38px_var(--shadow)] sm:p-6">
      <div className="absolute -right-12 -top-12 size-40 rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />
      <div className="relative flex flex-col gap-5">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Ticket className="size-[18px]" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">Account benefit</p>
            <h2 className="mt-1 font-syne text-xl font-semibold tracking-tight text-foreground">Redeem a code</h2>
            <p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">Enter a code to apply its temporary benefits to this workspace.</p>
          </div>
        </div>

        <div>
          <label htmlFor="coupon-code" className="mb-2 block text-xs font-medium text-muted-foreground">Redemption code</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="coupon-code"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              onKeyDown={(event) => {
                if (event.key === "Enter") void submit();
              }}
              placeholder="Enter your redemption code"
              spellCheck={false}
              autoCapitalize="characters"
              className="h-10 w-full rounded-md border border-border bg-background px-3 font-mono text-sm uppercase tracking-[0.12em] text-foreground outline-none transition-colors placeholder:normal-case placeholder:tracking-normal placeholder:text-faint focus:border-primary focus:ring-2 focus:ring-primary/15"
              disabled={pending}
              aria-describedby={error ? "coupon-error" : success ? "coupon-success" : undefined}
            />
            <Button onClick={() => void submit()} disabled={pending || !code.trim()} loading={pending} className="shrink-0">
              <Gift data-icon="inline-start" />
              Redeem code
            </Button>
          </div>
        </div>

        {success ? (
          <div id="coupon-success" role="status" className="rounded-lg border border-primary/25 bg-primary/10 px-3.5 py-3">
            <div className="flex gap-2.5"><span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-accent-foreground"><Check className="size-3" strokeWidth={3} /></span><div><p className="text-sm font-semibold text-foreground">Boost applied</p><p className="mt-0.5 text-sm leading-5 text-muted-foreground">{success.replace("Coupon redeemed. ", "")}</p></div></div>
          </div>
        ) : null}
        {error ? (
          <p id="coupon-error" role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-sm leading-5 text-destructive">
            {error}
          </p>
        ) : null}

        <ActiveBoosts grants={grants} />
      </div>
    </Card>
  );
}
