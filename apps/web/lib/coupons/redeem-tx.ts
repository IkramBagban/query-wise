import { Prisma } from "@prisma/client";
import { AppError } from "@query-wise/shared/dal/core";
import { createResourceId } from "@query-wise/shared/domain";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The additive benefits a redemption granted (snapshot). */
export interface RedeemedBenefits {
  questionsPerDayDelta: number;
  questionsPerMonthDelta: number;
  maxConnectionsDelta: number;
  maxDashboardsDelta: number;
  grantsPro: boolean;
}

export interface RedeemCouponResult {
  couponId: string;
  code: string;
  grantExpiresAt: Date;
  benefits: RedeemedBenefits;
}

/** The coupon fields the redemption tx needs (subset of the Prisma row). */
export interface RedeemableCoupon extends RedeemedBenefits {
  id: string;
  code: string;
  grantDurationDays: number;
  maxRedemptions: number | null;
}

/** Minimal transaction surface used by {@link applyRedemption} (keeps it unit-testable). */
export interface RedeemTx {
  couponRedemption: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
  coupon: {
    updateMany(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

/**
 * SPEC-12 §5.2 steps 6–7: the race-proof core of a redemption, kept pure so the
 * ordering can be exercised without a real DB. Must run inside the caller's
 * transaction.
 *
 * 1. Create the redemption first — the `@@unique(couponId,userId)` constraint is
 *    the double-redeem guard → `COUPON_ALREADY_REDEEMED`.
 * 2. Conditionally increment `redemptionCount` gated on the cap; 0 rows updated
 *    ⇒ cap reached ⇒ throw `COUPON_FULLY_REDEEMED` so the redemption row above is
 *    rolled back too (no orphan grant, no over-issue under concurrency).
 */
export async function applyRedemption(
  tx: RedeemTx,
  coupon: RedeemableCoupon,
  userId: string,
  now: Date,
): Promise<RedeemCouponResult> {
  const grantExpiresAt = new Date(now.getTime() + coupon.grantDurationDays * DAY_MS);
  const benefits: RedeemedBenefits = {
    questionsPerDayDelta: coupon.questionsPerDayDelta,
    questionsPerMonthDelta: coupon.questionsPerMonthDelta,
    maxConnectionsDelta: coupon.maxConnectionsDelta,
    maxDashboardsDelta: coupon.maxDashboardsDelta,
    grantsPro: coupon.grantsPro,
  };

  try {
    await tx.couponRedemption.create({
      data: {
        id: createResourceId(),
        couponId: coupon.id,
        userId,
        grantExpiresAt,
        ...benefits,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(
        "COUPON_ALREADY_REDEEMED",
        "You have already redeemed this coupon.",
      );
    }
    throw error;
  }

  const bumped = await tx.coupon.updateMany({
    where: {
      id: coupon.id,
      OR: [
        { maxRedemptions: null },
        { redemptionCount: { lt: coupon.maxRedemptions ?? 0 } },
      ],
    },
    data: { redemptionCount: { increment: 1 } },
  });
  if (bumped.count === 0) {
    throw new AppError(
      "COUPON_FULLY_REDEEMED",
      "This coupon has reached its redemption limit.",
    );
  }

  return { couponId: coupon.id, code: coupon.code, grantExpiresAt, benefits };
}
