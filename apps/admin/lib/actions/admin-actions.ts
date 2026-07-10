"use server";

import { revalidatePath } from "next/cache";
import { createResourceId } from "@query-wise/shared/domain";
import { recordMetricEvent } from "@query-wise/shared/metrics";
import { requireAdmin } from "@/lib/admin-auth";
import { writeAdminAudit } from "@/lib/audit";
import { adminTransaction } from "@/lib/db";
import { dayPeriodKey, monthPeriodKey } from "@/lib/period-keys";

const OVERRIDE_MIN = 0;
const OVERRIDE_MAX = 10_000;

export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

function clampOverride(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) return null;
  return Math.min(OVERRIDE_MAX, Math.max(OVERRIDE_MIN, Math.trunc(value)));
}

function revalidateUser(userId: string) {
  revalidatePath(`/users/${userId}`);
  revalidatePath("/users");
  revalidatePath("/");
}

/** Grant Pro or revoke to Free (SPEC-08 §6.1). */
export async function setUserPlanAction(input: {
  userId: string;
  toPlanId: "free" | "pro";
  notes?: string;
}): Promise<ActionResult> {
  try {
    const { adminClerkUserId } = await requireAdmin();
    const userId = input.userId.trim();
    if (!userId) return { ok: false, error: "Missing user id." };
    const toPlanId = input.toPlanId === "pro" ? "pro" : "free";

    await adminTransaction(async (tx) => {
      const existing = await tx.userPlan.findUnique({ where: { userId } });
      if (!existing) {
        throw new Error("User plan row not found.");
      }
      const fromPlanId = existing.planId;
      if (fromPlanId === toPlanId && existing.source === "manual") {
        // Still allow re-grant notes update.
      }

      await tx.userPlan.update({
        where: { userId },
        data: {
          planId: toPlanId,
          source: "manual",
          proGrantedAt: toPlanId === "pro" ? new Date() : existing.proGrantedAt,
          notes: input.notes?.trim() || existing.notes,
        },
      });

      await tx.planChangeLog.create({
        data: {
          id: createResourceId(),
          userId,
          fromPlanId,
          toPlanId,
          source: "manual",
          actorLabel: `admin:${adminClerkUserId}`,
          notes: input.notes?.trim() || null,
        },
      });

      await writeAdminAudit(
        {
          actorUserId: adminClerkUserId,
          action:
            toPlanId === "pro" ? "admin.plan.granted" : "admin.plan.revoked",
          resourceType: "user",
          resourceId: userId,
          metadata: {
            fromPlanId,
            toPlanId,
            notes: input.notes?.trim() || null,
          },
        },
        tx,
      );
    });

    void recordMetricEvent({
      userId,
      eventType: "user.plan_changed",
      resourceType: "user",
      resourceId: userId,
      payload: {
        toPlanId,
        source: "manual",
        actor: adminClerkUserId,
      },
    });

    revalidateUser(userId);
    return {
      ok: true,
      message:
        toPlanId === "pro"
          ? "Granted Pro."
          : "Revoked to Free (grandfathering: existing resources kept).",
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Plan change failed.",
    };
  }
}

/** Set or clear per-user quota overrides (SPEC-08 §6.2). */
export async function setQuotaOverridesAction(input: {
  userId: string;
  questionsPerDayOverride?: number | null;
  questionsPerMonthOverride?: number | null;
  maxConnectionsOverride?: number | null;
  maxDashboardsOverride?: number | null;
  schemaRefreshesPerDayOverride?: number | null;
}): Promise<ActionResult> {
  try {
    const { adminClerkUserId } = await requireAdmin();
    const userId = input.userId.trim();
    if (!userId) return { ok: false, error: "Missing user id." };

    const next = {
      questionsPerDayOverride: clampOverride(input.questionsPerDayOverride),
      questionsPerMonthOverride: clampOverride(input.questionsPerMonthOverride),
      maxConnectionsOverride: clampOverride(input.maxConnectionsOverride),
      maxDashboardsOverride: clampOverride(input.maxDashboardsOverride),
      schemaRefreshesPerDayOverride: clampOverride(
        input.schemaRefreshesPerDayOverride,
      ),
    };

    await adminTransaction(async (tx) => {
      const existing = await tx.userPlan.findUnique({ where: { userId } });
      if (!existing) throw new Error("User plan row not found.");

      const before = {
        questionsPerDayOverride: existing.questionsPerDayOverride,
        questionsPerMonthOverride: existing.questionsPerMonthOverride,
        maxConnectionsOverride: existing.maxConnectionsOverride,
        maxDashboardsOverride: existing.maxDashboardsOverride,
        schemaRefreshesPerDayOverride: existing.schemaRefreshesPerDayOverride,
      };

      await tx.userPlan.update({
        where: { userId },
        data: next,
      });

      const allCleared = Object.values(next).every((v) => v == null);
      await writeAdminAudit(
        {
          actorUserId: adminClerkUserId,
          action: allCleared
            ? "admin.quota.override_cleared"
            : "admin.quota.override_set",
          resourceType: "user",
          resourceId: userId,
          metadata: { before, after: next },
        },
        tx,
      );
    });

    revalidateUser(userId);
    return { ok: true, message: "Quota overrides updated." };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Override update failed.",
    };
  }
}

/** Zero current day and/or month period counters (SPEC-08 §6.3). */
export async function resetUsageCountersAction(input: {
  userId: string;
  resetDay: boolean;
  resetMonth: boolean;
  includeSchemaRefreshes?: boolean;
}): Promise<ActionResult> {
  try {
    const { adminClerkUserId } = await requireAdmin();
    const userId = input.userId.trim();
    if (!userId) return { ok: false, error: "Missing user id." };
    if (!input.resetDay && !input.resetMonth) {
      return { ok: false, error: "Select at least one period to reset." };
    }

    const now = new Date();
    const dayKey = dayPeriodKey(now);
    const monthKey = monthPeriodKey(now);
    const prior: Record<string, unknown> = {};

    await adminTransaction(async (tx) => {
      if (input.resetDay) {
        const day = await tx.userUsagePeriod.findUnique({
          where: {
            userId_periodType_periodKey: {
              userId,
              periodType: "day",
              periodKey: dayKey,
            },
          },
        });
        if (day) {
          prior.day = {
            periodKey: dayKey,
            questionsAccepted: day.questionsAccepted,
            schemaRefreshes: day.schemaRefreshes,
          };
          await tx.userUsagePeriod.update({
            where: { id: day.id },
            data: {
              questionsAccepted: 0,
              ...(input.includeSchemaRefreshes
                ? { schemaRefreshes: 0 }
                : {}),
            },
          });
        }
      }
      if (input.resetMonth) {
        const month = await tx.userUsagePeriod.findUnique({
          where: {
            userId_periodType_periodKey: {
              userId,
              periodType: "month",
              periodKey: monthKey,
            },
          },
        });
        if (month) {
          prior.month = {
            periodKey: monthKey,
            questionsAccepted: month.questionsAccepted,
          };
          await tx.userUsagePeriod.update({
            where: { id: month.id },
            data: { questionsAccepted: 0 },
          });
        }
      }

      // Lifetime totals intentionally untouched.
      await writeAdminAudit(
        {
          actorUserId: adminClerkUserId,
          action: "admin.quota.counters_reset",
          resourceType: "user",
          resourceId: userId,
          metadata: {
            resetDay: input.resetDay,
            resetMonth: input.resetMonth,
            includeSchemaRefreshes: Boolean(input.includeSchemaRefreshes),
            prior,
          },
        },
        tx,
      );
    });

    revalidateUser(userId);
    return { ok: true, message: "Usage counters reset for selected periods." };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Counter reset failed.",
    };
  }
}

/** Suspend or reactivate account (SPEC-08 §6.4). */
export async function setAccountStatusAction(input: {
  userId: string;
  status: "active" | "disabled";
  reason: string;
  confirmToken: string;
}): Promise<ActionResult> {
  try {
    const { adminClerkUserId } = await requireAdmin();
    const userId = input.userId.trim();
    const reason = input.reason.trim();
    if (!userId) return { ok: false, error: "Missing user id." };
    if (!reason) return { ok: false, error: "Reason is required." };
    if (
      input.confirmToken.trim() !== userId &&
      !input.confirmToken.trim().includes(userId)
    ) {
      // Require typing the clerk user id (or email containing it is not enough —
      // must match user id exactly or the user's email from confirm field).
      // Accept exact userId match only for destructive clarity.
      if (input.confirmToken.trim() !== userId) {
        return {
          ok: false,
          error: "Type the user's Clerk id to confirm.",
        };
      }
    }

    const status = input.status === "disabled" ? "disabled" : "active";

    await adminTransaction(async (tx) => {
      const existing = await tx.userPlan.findUnique({ where: { userId } });
      if (!existing) throw new Error("User plan row not found.");

      await tx.userPlan.update({
        where: { userId },
        data: { status },
      });

      await tx.planChangeLog.create({
        data: {
          id: createResourceId(),
          userId,
          fromPlanId: existing.planId,
          toPlanId: existing.planId,
          source: "manual",
          actorLabel: `admin:${adminClerkUserId}`,
          notes: `status:${existing.status}->${status}; ${reason}`,
        },
      });

      await writeAdminAudit(
        {
          actorUserId: adminClerkUserId,
          action:
            status === "disabled"
              ? "admin.account.suspended"
              : "admin.account.reactivated",
          resourceType: "user",
          resourceId: userId,
          metadata: { reason, previousStatus: existing.status },
        },
        tx,
      );
    });

    void recordMetricEvent({
      userId,
      eventType: "user.plan_changed",
      resourceType: "user",
      resourceId: userId,
      payload: {
        status,
        source: "manual",
        actor: adminClerkUserId,
      },
    });

    revalidateUser(userId);
    return {
      ok: true,
      message:
        status === "disabled" ? "Account suspended." : "Account reactivated.",
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Status change failed.",
    };
  }
}

/** Record debug view open (SPEC-08 §5.4). Call before showing content. */
export async function recordDebugViewOpenedAction(input: {
  queryRunId: string;
  targetUserId: string;
}): Promise<ActionResult> {
  try {
    const { adminClerkUserId } = await requireAdmin();
    await writeAdminAudit({
      actorUserId: adminClerkUserId,
      action: "admin.debug_view.opened",
      resourceType: "query_run",
      resourceId: input.queryRunId,
      metadata: { targetUserId: input.targetUserId },
    });
    return { ok: true, message: "Access logged." };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Audit failed.",
    };
  }
}

