import "server-only";

import { requireAdmin } from "@/lib/admin-auth";
import { displayName, resolveClerkUsers } from "@/lib/clerk";
import { adminDb } from "@/lib/db";
import { PAGE_SIZE } from "@/lib/format";

export type CouponsSort = "created" | "usage";

/** Human-readable benefit chips for a coupon (shared by list + detail). */
export function couponBenefitLabels(benefits: {
  questionsPerDayDelta: number;
  questionsPerMonthDelta: number;
  maxConnectionsDelta: number;
  maxDashboardsDelta: number;
  grantsPro: boolean;
}): string[] {
  const chips: string[] = [];
  if (benefits.grantsPro) chips.push("Pro");
  if (benefits.questionsPerDayDelta) chips.push(`+${benefits.questionsPerDayDelta} q/day`);
  if (benefits.questionsPerMonthDelta) chips.push(`+${benefits.questionsPerMonthDelta} q/mo`);
  if (benefits.maxConnectionsDelta) chips.push(`+${benefits.maxConnectionsDelta} conn`);
  if (benefits.maxDashboardsDelta) chips.push(`+${benefits.maxDashboardsDelta} dash`);
  return chips;
}

export interface CouponBenefits {
  questionsPerDayDelta: number;
  questionsPerMonthDelta: number;
  maxConnectionsDelta: number;
  maxDashboardsDelta: number;
  grantsPro: boolean;
}

export interface CouponListRow extends CouponBenefits {
  id: string;
  code: string;
  label: string | null;
  grantDurationDays: number;
  redeemableUntil: Date | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  disabledAt: Date | null;
  createdByAdmin: string;
  createdAt: Date;
}

export interface CouponsListResult {
  rows: CouponListRow[];
  total: number;
  page: number;
  pageSize: number;
}

/** List coupons for the admin table (SPEC-12 §6.1). */
export async function listCoupons(
  sort: CouponsSort = "created",
  page = 1,
): Promise<CouponsListResult> {
  await requireAdmin();
  const db = adminDb();
  const take = PAGE_SIZE;
  const skip = (Math.max(1, page) - 1) * take;

  const orderBy =
    sort === "usage"
      ? [{ redemptionCount: "desc" as const }, { createdAt: "desc" as const }]
      : [{ createdAt: "desc" as const }];

  const [rows, total] = await Promise.all([
    db.coupon.findMany({ orderBy, skip, take }),
    db.coupon.count(),
  ]);

  return { rows, total, page: Math.max(1, page), pageSize: take };
}

export interface CouponRedemptionRow {
  id: string;
  userId: string;
  displayLabel: string;
  redeemedAt: Date;
  grantExpiresAt: Date;
  active: boolean;
}

export interface CouponDetail {
  coupon: CouponListRow;
  redemptions: CouponRedemptionRow[];
}

/** Coupon detail + its redemptions with resolved identities (SPEC-12 §6.1). Metadata only. */
export async function getCouponDetail(couponId: string): Promise<CouponDetail | null> {
  await requireAdmin();
  const db = adminDb();

  const coupon = await db.coupon.findUnique({ where: { id: couponId } });
  if (!coupon) return null;

  const redemptions = await db.couponRedemption.findMany({
    where: { couponId },
    orderBy: { redeemedAt: "desc" },
    take: 500,
  });

  const identities = await resolveClerkUsers(redemptions.map((r) => r.userId));
  const now = Date.now();

  return {
    coupon,
    redemptions: redemptions.map((r) => ({
      id: r.id,
      userId: r.userId,
      displayLabel: displayName(identities.get(r.userId), r.userId),
      redeemedAt: r.redeemedAt,
      grantExpiresAt: r.grantExpiresAt,
      active: r.grantExpiresAt.getTime() > now,
    })),
  };
}
