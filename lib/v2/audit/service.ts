import "server-only";

import type { Prisma } from "@prisma/client";
import { getAppDb, type AppDbTransaction } from "@/lib/v2/app-db";
import { createResourceId } from "@/lib/v2/domain/ids";
import { devLogError } from "@/lib/v2/observability";
import { redactSensitive } from "@/lib/v2/security/redaction";

const MAX_AUDIT_METADATA_BYTES = 8 * 1024;

export interface AuditEvent {
  actorUserId: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  outcome: "succeeded" | "failed" | "denied" | "cancelled";
  metadata?: Record<string, unknown>;
}

function safeMetadata(metadata: Record<string, unknown> | undefined): Prisma.InputJsonObject {
  if (!metadata) return {};
  const redacted = redactSensitive(metadata);
  const serialized = JSON.stringify(
    redacted,
    (_key, value) => typeof value === "bigint" ? value.toString() : value,
  );
  if (Buffer.byteLength(serialized, "utf8") <= MAX_AUDIT_METADATA_BYTES) {
    return JSON.parse(serialized) as Prisma.InputJsonObject;
  }
  return { truncated: true, originalBytes: Buffer.byteLength(serialized, "utf8") };
}

/**
 * Strict audit writes are part of the caller's transaction when `tx` is supplied.
 * Without a transaction, a failed write rejects so retryable operations can be retried.
 */
export async function writeAuditLog(
  event: AuditEvent,
  tx: AppDbTransaction | ReturnType<typeof getAppDb> = getAppDb(),
): Promise<void> {
  await tx.auditLog.create({
    data: {
      id: createResourceId(),
      actorUserId: event.actorUserId,
      action: event.action.slice(0, 100),
      resourceType: event.resourceType.slice(0, 100),
      resourceId: event.resourceId?.slice(0, 200) ?? null,
      outcome: event.outcome,
      metadata: safeMetadata(event.metadata),
    },
  });
}

/** Authentication/authorization failures must preserve the original response even if auditing is unavailable. */
export async function writeAuditLogBestEffort(event: AuditEvent): Promise<void> {
  try {
    await writeAuditLog(event);
  } catch (error) {
    devLogError("audit.write.failed", "Best-effort audit write failed.", error, {
      action: event.action,
      resourceType: event.resourceType,
      outcome: event.outcome,
    });
  }
}
