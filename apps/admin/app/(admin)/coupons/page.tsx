import Link from "next/link";
import { Badge, DataTable, EmptyState, Mono } from "@/components/ui";
import { formatInt, formatUtcDate } from "@/lib/format";
import {
  couponBenefitLabels,
  listCoupons,
  type CouponsSort,
} from "@/lib/queries/coupons";

export default async function CouponsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const sort: CouponsSort = sp.sort === "usage" ? "usage" : "created";
  const page = Math.max(1, Number(sp.page) || 1);

  const result = await listCoupons(sort, page);
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  function sortHref(next: CouponsSort) {
    return next === "created" ? "/coupons" : `/coupons?sort=${next}`;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Coupons</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Redeemable codes that grant time-boxed entitlement boosts. Disable to
            stop new redemptions; existing grants run to their own expiry.
          </p>
        </div>
        <Link
          href="/coupons/new"
          className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-white"
        >
          New coupon
        </Link>
      </div>

      <div className="flex gap-3 text-xs">
        <Link
          href={sortHref("created")}
          className={sort === "created" ? "font-semibold text-primary" : "text-muted-foreground hover:text-primary"}
        >
          Newest
        </Link>
        <Link
          href={sortHref("usage")}
          className={sort === "usage" ? "font-semibold text-primary" : "text-muted-foreground hover:text-primary"}
        >
          Most redeemed
        </Link>
      </div>

      {result.rows.length === 0 ? (
        <EmptyState>No coupons yet. Create one to get started.</EmptyState>
      ) : (
        <DataTable
          headers={["Code", "Benefits", "Duration", "Window", "Redeemed", "Status", "Created"]}
        >
          {result.rows.map((c) => {
            const chips = couponBenefitLabels(c);
            const windowLabel =
              c.redeemableUntil || c.maxRedemptions != null
                ? [
                    c.redeemableUntil ? `until ${formatUtcDate(c.redeemableUntil)}` : null,
                    c.maxRedemptions != null ? `max ${c.maxRedemptions}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : "unlimited";
            return (
              <tr key={c.id}>
                <td className="px-3 py-1.5">
                  <Link href={`/coupons/${c.id}`} className="text-primary hover:underline">
                    <Mono>{c.code}</Mono>
                  </Link>
                  {c.label ? (
                    <div className="mt-0.5 text-xs text-muted-foreground">{c.label}</div>
                  ) : null}
                </td>
                <td className="px-3 py-1.5">
                  <div className="flex flex-wrap gap-1">
                    {chips.map((chip) => (
                      <Badge key={chip} tone="accent">
                        {chip}
                      </Badge>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-1.5 text-xs">{c.grantDurationDays}d</td>
                <td className="px-3 py-1.5 text-xs text-muted-foreground">{windowLabel}</td>
                <td className="px-3 py-1.5 tabular-nums">
                  {c.redemptionCount}
                  {c.maxRedemptions != null ? `/${c.maxRedemptions}` : ""}
                </td>
                <td className="px-3 py-1.5">
                  <Badge tone={c.disabledAt ? "danger" : "neutral"}>
                    {c.disabledAt ? "disabled" : "active"}
                  </Badge>
                </td>
                <td className="px-3 py-1.5 text-xs text-muted-foreground">
                  {formatUtcDate(c.createdAt)}
                </td>
              </tr>
            );
          })}
        </DataTable>
      )}

      <div className="flex justify-between text-xs text-muted-foreground">
        <span>
          {formatInt(result.total)} coupons · page {result.page}/{totalPages}
        </span>
        <div className="flex gap-2">
          {result.page > 1 ? (
            <Link href={`/coupons?sort=${sort}&page=${result.page - 1}`} className="text-primary">
              Previous
            </Link>
          ) : null}
          {result.page < totalPages ? (
            <Link href={`/coupons?sort=${sort}&page=${result.page + 1}`} className="text-primary">
              Next
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
