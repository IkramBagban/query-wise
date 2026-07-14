import "server-only";

import { withAppDbTransaction } from "@query-wise/shared/app-db";
import { AppError } from "@query-wise/shared/dal/core";
import { recordMetricEvent } from "@query-wise/shared/metrics";
import { getUserPlan } from "@query-wise/shared/plans";
import { assertAccountActive } from "@/lib/plans/service";
import { applyRedemption, type RedeemCouponResult } from "./redeem-tx";

export type { RedeemCouponResult, RedeemedBenefits } from "./redeem-tx";

/** Canonical form: trim surrounding whitespace, uppercase. Stored/compared canonical. */
export function normalizeCouponCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/**
 * SPEC-12 §5.2: redeem a coupon for one user. Fail-closed; everything below the
 * account check runs in ONE transaction so a cap failure discards the redemption
 * row (no orphan grants, no over-issue under concurrency). The race-proof
 * create-then-increment core lives in {@link applyRedemption}.
 */
export async function redeemCoupon(
  userId: string,
  rawCode: string,
): Promise<RedeemCouponResult> {
  const code = normalizeCouponCode(rawCode);
  if (!code) {
    throw new AppError("COUPON_NOT_FOUND", "Enter a coupon code.");
  }

  const result = await withAppDbTransaction(async (tx) => {
    const now = new Date();

    // Suspended users cannot redeem. getUserPlan also lazily creates the
    // UserPlan row so overrides/plan exist for later reads (SPEC-12 §5.2.8).
    const plan = await getUserPlan(userId, tx);
    assertAccountActive(plan);

    const coupon = await tx.coupon.findUnique({ where: { code } });
    if (!coupon) throw new AppError("COUPON_NOT_FOUND", "That coupon code is not valid.");
    if (coupon.disabledAt) {
      throw new AppError("COUPON_INACTIVE", "This coupon is no longer available.");
    }
    if (coupon.redeemableUntil && now > coupon.redeemableUntil) {
      throw new AppError("COUPON_EXPIRED", "This coupon has expired.");
    }

    return applyRedemption(tx, coupon, userId, now);
  });

  // Best-effort, outside the tx.
  void recordMetricEvent({
    userId,
    eventType: "coupon.redeemed",
    resourceType: "coupon",
    resourceId: result.couponId,
    payload: {
      code: result.code,
      grantExpiresAt: result.grantExpiresAt.toISOString(),
      grantsPro: result.benefits.grantsPro,
      questionsPerDayDelta: result.benefits.questionsPerDayDelta,
      questionsPerMonthDelta: result.benefits.questionsPerMonthDelta,
      maxConnectionsDelta: result.benefits.maxConnectionsDelta,
      maxDashboardsDelta: result.benefits.maxDashboardsDelta,
    },
  });

  return result;
}
