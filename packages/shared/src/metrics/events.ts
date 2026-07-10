import { Prisma } from "@prisma/client";
import { getAppDb } from "../app-db";
import { createResourceId } from "../domain";
import { devLogError } from "../observability";

/** Canonical product-analytics event types. */
export type MetricEventType =
  | "user.signed_up"
  | "user.plan_changed"
  | "question.accepted"
  | "question.succeeded"
  | "question.failed"
  | "question.cancelled"
  | "question.quota_blocked"
  | "llm.call_completed"
  | "llm.embedding_completed"
  | "chart.generated"
  | "result.returned"
  | "connection.created"
  | "connection.deleted"
  | "connection.test"
  | "schema.sync_queued"
  | "schema.sync_succeeded"
  | "schema.sync_failed"
  | "schema.refresh_blocked"
  | "conversation.created"
  | "conversation.deleted"
  | "dashboard.created"
  | "dashboard.deleted"
  | "dashboard_widget.created"
  | "dashboard_widget.deleted"
  | "dashboard_widget.refresh"
  | "share.created"
  | "share.revoked"
  | "share.viewed"
  | "share.password_rejected_by_plan"
  | "export.requested"
  | "settings.model_changed";

export interface MetricEventInput {
  userId?: string | null;
  eventType: MetricEventType | string;
  resourceType?: string | null;
  resourceId?: string | null;
  queryRunId?: string | null;
  /** Small, safe JSON only: counts, enums, ids, booleans. Never secrets or row data. */
  payload?: Record<string, unknown>;
}

/**
 * Append one product-analytics event. Best-effort: never throws, so a metrics
 * failure cannot fail the user request whose primary work already succeeded.
 */
export async function recordMetricEvent(input: MetricEventInput): Promise<void> {
  try {
    await getAppDb().metricEvent.create({
      data: {
        id: createResourceId(),
        userId: input.userId ?? null,
        eventType: String(input.eventType),
        resourceType: input.resourceType ?? null,
        resourceId: input.resourceId ?? null,
        queryRunId: input.queryRunId ?? null,
        payload: (input.payload ?? {}) as Prisma.InputJsonObject,
      },
    });
  } catch (error) {
    devLogError("metrics.event.failed", "Failed to record metric event.", error, {
      eventType: String(input.eventType),
    });
  }
}
