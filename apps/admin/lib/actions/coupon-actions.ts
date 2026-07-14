"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { createResourceId } from "@query-wise/shared/domain";
import { requireAdmin } from "@/lib/admin-auth";
import { writeAdminAudit } from "@/lib/audit";
import { generateCouponCode, normalizeCouponCode } from "@/lib/coupon-code";
import { adminTransaction } from "@/lib/db";
import type { ActionResult } from "@/lib/actions/admin-actions";

const DELTA_MIN = 0;
const DELTA_MAX = 10_000;
const DURATION_MIN = 1;
const DURATION_MAX = 3_650;

export interface CreateCouponInput {
  code?: string | null;
  label?: string | null;
  questionsPerDayDelta?: number | null;
  questionsPerMonthDelta?: number | null;
  maxConnectionsDelta?: number | null;
  maxDashboardsDelta?: number | null;
  grantsPro?: boolean;
  grantDurationDays: number;
  redeemableUntil?: string | null;
  maxRedemptions?: number | null;
}

function clampDelta(value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value)) return 0;
  return Math.min(DELTA_MAX, Math.max(DELTA_MIN, Math.trunc(value)));
}

/** Create a coupon (SPEC-12 §6.2). Validates + clamps server-side, audits, fail-closed. */
export async function createCouponAction(input: CreateCouponInput): Promise<ActionResult> {
  try {
    const { adminClerkUserId } = await requireAdmin();

    const deltas = {
      questionsPerDayDelta: clampDelta(input.questionsPerDayDelta),
      questionsPerMonthDelta: clampDelta(input.questionsPerMonthDelta),
      maxConnectionsDelta: clampDelta(input.maxConnectionsDelta),
      maxDashboardsDelta: clampDelta(input.maxDashboardsDelta),
    };
    const grantsPro = Boolean(input.grantsPro);

    const hasBenefit =
      grantsPro || Object.values(deltas).some((v) => v > 0);
    if (!hasBenefit) {
      return { ok: false, error: "A coupon must grant at least one benefit or Pro." };
    }

    const durationRaw = Math.trunc(Number(input.grantDurationDays));
    if (!Number.isFinite(durationRaw)) {
      return { ok: false, error: "Grant duration (days) is required." };
    }
    const grantDurationDays = Math.min(DURATION_MAX, Math.max(DURATION_MIN, durationRaw));

    let maxRedemptions: number | null = null;
    if (input.maxRedemptions !== null && input.maxRedemptions !== undefined) {
      const n = Math.trunc(Number(input.maxRedemptions));
      if (!Number.isFinite(n) || n < 1) {
        return { ok: false, error: "Max redemptions must be empty or at least 1." };
      }
      maxRedemptions = n;
    }

    let redeemableUntil: Date | null = null;
    if (input.redeemableUntil) {
      const parsed = new Date(input.redeemableUntil);
      if (Number.isNaN(parsed.getTime())) {
        return { ok: false, error: "Redeemable-until is not a valid date." };
      }
      if (parsed.getTime() <= Date.now()) {
        return { ok: false, error: "Redeemable-until must be in the future." };
      }
      redeemableUntil = parsed;
    }

    const suppliedCode = normalizeCouponCode(input.code ?? "");
    const code = suppliedCode || generateCouponCode();

    let createdCode = code;
    try {
      await adminTransaction(async (tx) => {
        const coupon = await tx.coupon.create({
          data: {
            id: createResourceId(),
            code,
            label: input.label?.trim() || null,
            createdByAdmin: adminClerkUserId,
            ...deltas,
            grantsPro,
            grantDurationDays,
            redeemableUntil,
            maxRedemptions,
          },
        });
        createdCode = coupon.code;

        await writeAdminAudit(
          {
            actorUserId: adminClerkUserId,
            action: "admin.coupon.created",
            resourceType: "coupon",
            resourceId: coupon.id,
            metadata: {
              code: coupon.code,
              label: coupon.label,
              benefits: { ...deltas, grantsPro },
              grantDurationDays,
              redeemableUntil: redeemableUntil?.toISOString() ?? null,
              maxRedemptions,
            },
          },
          tx,
        );
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return { ok: false, error: "Code already exists. Choose another." };
      }
      throw error;
    }

    revalidatePath("/coupons");
    return { ok: true, message: `Coupon ${createdCode} created.` };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Coupon creation failed.",
    };
  }
}

/** Enable/disable a coupon (SPEC-12 §6.2). Existing grants keep running (snapshot). */
export async function setCouponDisabledAction(input: {
  couponId: string;
  disabled: boolean;
}): Promise<ActionResult> {
  try {
    const { adminClerkUserId } = await requireAdmin();
    const couponId = input.couponId.trim();
    if (!couponId) return { ok: false, error: "Missing coupon id." };

    await adminTransaction(async (tx) => {
      const existing = await tx.coupon.findUnique({ where: { id: couponId } });
      if (!existing) throw new Error("Coupon not found.");

      await tx.coupon.update({
        where: { id: couponId },
        data: { disabledAt: input.disabled ? new Date() : null },
      });

      await writeAdminAudit(
        {
          actorUserId: adminClerkUserId,
          action: input.disabled ? "admin.coupon.disabled" : "admin.coupon.enabled",
          resourceType: "coupon",
          resourceId: couponId,
          metadata: { code: existing.code, wasDisabled: existing.disabledAt !== null },
        },
        tx,
      );
    });

    revalidatePath("/coupons");
    revalidatePath(`/coupons/${couponId}`);
    return {
      ok: true,
      message: input.disabled ? "Coupon disabled." : "Coupon enabled.",
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Coupon update failed.",
    };
  }
}
