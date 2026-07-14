import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/copy-button";
import { CouponDisableButton } from "@/components/coupon-disable-button";
import { Badge, Card, DataTable, EmptyState, Mono } from "@/components/ui";
import { formatUtcDate } from "@/lib/format";
import { couponBenefitLabels, getCouponDetail } from "@/lib/queries/coupons";

export default async function CouponDetailPage({
  params,
}: {
  params: Promise<{ couponId: string }>;
}) {
  const { couponId } = await params;
  const data = await getCouponDetail(couponId);
  if (!data) notFound();

  const { coupon, redemptions } = data;
  const chips = couponBenefitLabels(coupon);
  const activeCount = redemptions.filter((r) => r.active).length;

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col gap-1 border-b border-border/50 pb-6">
        <Link href="/coupons" className="mb-2 text-xs text-muted-foreground hover:text-primary">
          ← Coupons
        </Link>
        <div className="flex flex-wrap items-start gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <Mono>{coupon.code}</Mono>
              <CopyButton value={coupon.code} />
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{coupon.label || "No label"}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge tone={coupon.disabledAt ? "danger" : "neutral"}>
              {coupon.disabledAt ? "disabled" : "active"}
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Coupon">
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted-foreground">Benefits</dt>
            <dd className="flex flex-wrap gap-1">
              {chips.length === 0 ? (
                "—"
              ) : (
                chips.map((chip) => (
                  <Badge key={chip} tone="accent">
                    {chip}
                  </Badge>
                ))
              )}
            </dd>
            <dt className="text-muted-foreground">Grant duration</dt>
            <dd>{coupon.grantDurationDays} days</dd>
            <dt className="text-muted-foreground">Redeemable until</dt>
            <dd>{coupon.redeemableUntil ? formatUtcDate(coupon.redeemableUntil) : "unlimited"}</dd>
            <dt className="text-muted-foreground">Redemptions</dt>
            <dd>
              {coupon.redemptionCount}
              {coupon.maxRedemptions != null ? ` / ${coupon.maxRedemptions}` : " (uncapped)"}
            </dd>
            <dt className="text-muted-foreground">Created by</dt>
            <dd className="font-mono text-[11px]">{coupon.createdByAdmin}</dd>
            <dt className="text-muted-foreground">Created</dt>
            <dd>{formatUtcDate(coupon.createdAt)}</dd>
            <dt className="text-muted-foreground">Disabled</dt>
            <dd>{coupon.disabledAt ? formatUtcDate(coupon.disabledAt) : "—"}</dd>
          </dl>
        </Card>

        <Card title="Admin actions">
          <p className="mb-3 text-xs text-muted-foreground">
            Disabling stops new redemptions. Existing grants keep running to their own
            expiry (benefits are snapshotted at redemption). Benefit amounts cannot be
            edited — disable and create a new coupon.
          </p>
          <CouponDisableButton couponId={coupon.id} disabled={coupon.disabledAt !== null} />
        </Card>
      </div>

      <Card title={`Redemptions (${activeCount} active / ${redemptions.length} total)`}>
        {redemptions.length === 0 ? (
          <EmptyState>No redemptions yet.</EmptyState>
        ) : (
          <DataTable headers={["User", "Redeemed", "Grant expires", "State"]}>
            {redemptions.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-1.5">
                  <Link
                    href={`/users/${encodeURIComponent(r.userId)}`}
                    className="text-primary hover:underline"
                  >
                    {r.displayLabel}
                  </Link>
                </td>
                <td className="px-3 py-1.5 text-xs text-muted-foreground">
                  {formatUtcDate(r.redeemedAt)}
                </td>
                <td className="px-3 py-1.5 text-xs text-muted-foreground">
                  {formatUtcDate(r.grantExpiresAt)}
                </td>
                <td className="px-3 py-1.5">
                  <Badge tone={r.active ? "accent" : "neutral"}>
                    {r.active ? "active" : "expired"}
                  </Badge>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>
    </div>
  );
}
