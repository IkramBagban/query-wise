import "server-only";

import type { Prisma } from "@prisma/client";
import { createResourceId } from "@query-wise/shared/domain";
import { devLog, devLogError } from "@query-wise/shared/observability";
import type { AppDbTransaction } from "@/lib/db";
import { adminDb } from "@/lib/db";

export type AdminAuditAction =
  | "admin.plan.granted"
  | "admin.plan.revoked"
  | "admin.quota.override_set"
  | "admin.quota.override_cleared"
  | "admin.quota.counters_reset"
  | "admin.account.suspended"
  | "admin.account.reactivated"
  | "admin.debug_view.opened"
  | "admin.coupon.created"
  | "admin.coupon.disabled"
  | "admin.coupon.enabled";

export interface AdminAuditEvent {
  actorUserId: string;
  action: AdminAuditAction;
  resourceType: "user" | "query_run" | "coupon";
  resourceId: string;
  outcome?: "success" | "failed" | "denied";
  metadata?: Record<string, unknown>;
}

function safeMetadata(
  metadata: Record<string, unknown> | undefined,
): any {
  if (!metadata) return {};
  try {
    const serialized = JSON.stringify(metadata, (_k, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
    return JSON.parse(serialized);
  } catch {
    return { truncated: true };
  }
}

/** Write an admin audit row (same transaction when `tx` is provided). */
export async function writeAdminAudit(
  event: AdminAuditEvent,
  tx: AppDbTransaction | ReturnType<typeof adminDb> = adminDb(),
): Promise<void> {
  await tx.auditLog.create({
    data: {
      id: createResourceId(),
      actorUserId: event.actorUserId,
      action: event.action,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      // AuditLog.outcome is free-text; product uses succeeded/failed/denied —
      // admin uses "success" per SPEC-08 §5.4.
      outcome: event.outcome ?? "success",
      metadata: safeMetadata(event.metadata),
    },
  });
  devLog("info", "admin.audit", event.action, {
    actorUserId: event.actorUserId,
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    outcome: event.outcome ?? "success",
  });
}

export async function writeAdminAuditBestEffort(
  event: AdminAuditEvent,
): Promise<void> {
  try {
    await writeAdminAudit(event);
  } catch (error) {
    devLogError("admin.audit.failed", "Admin audit write failed.", error, {
      action: event.action,
    });
  }
}
