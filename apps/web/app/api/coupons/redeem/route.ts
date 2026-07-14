import { z } from "zod";
import { AppError } from "@query-wise/shared/dal/core";
import { recordMetricEvent } from "@query-wise/shared/metrics";
import { requireUser } from "@/lib/auth/require-user";
import { consumeCouponRedemptionAttempt } from "@/lib/coupons/rate-limit";
import { redeemCoupon } from "@/lib/coupons/service";
import { apiError, privateNoStoreHeaders } from "@/lib/query/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({ code: z.string().min(1).max(64) });

/** Terminal reasons worth surfacing in the admin events feed. */
const BLOCKED_CODES = new Set([
  "COUPON_NOT_FOUND",
  "COUPON_INACTIVE",
  "COUPON_EXPIRED",
  "COUPON_FULLY_REDEEMED",
  "COUPON_ALREADY_REDEEMED",
  "ACCOUNT_DISABLED",
]);

/**
 * SPEC-12 §5.1: self-serve coupon redemption. Gate order: authenticate → rate
 * limit → redeem service (which runs the account check, coupon validity, and the
 * atomic tx). Read-only endpoints elsewhere already reflect the new grant because
 * the resolver folds active grants at read time.
 */
export async function POST(request: Request) {
  let userId: string | null = null;
  try {
    const auth = await requireUser();
    userId = auth.userId;

    const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    await consumeCouponRedemptionAttempt(userId, forwardedFor || "unknown-client");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AppError("VALIDATION_FAILED", "A valid JSON body with a coupon code is required.");
    }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("COUPON_NOT_FOUND", "Enter a coupon code.");
    }

    const result = await redeemCoupon(userId, parsed.data.code);
    return Response.json(
      {
        contractVersion: "querywise.v2",
        data: {
          grantExpiresAt: result.grantExpiresAt.toISOString(),
          benefits: result.benefits,
        },
      },
      { headers: privateNoStoreHeaders },
    );
  } catch (error) {
    if (error instanceof AppError && BLOCKED_CODES.has(error.code)) {
      void recordMetricEvent({
        userId,
        eventType: "coupon.redemption_blocked",
        resourceType: "coupon",
        payload: { reason: error.code },
      });
    }
    return apiError(error);
  }
}
