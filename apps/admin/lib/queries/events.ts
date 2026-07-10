import "server-only";

import { requireAdmin } from "@/lib/admin-auth";
import { adminDb } from "@/lib/db";
import { PAGE_SIZE } from "@/lib/format";

/** Canonical metric event types (SPEC-07 §4.2 / shared metrics module). */
export const METRIC_EVENT_TYPES = [
  "user.signed_up",
  "user.plan_changed",
  "question.accepted",
  "question.succeeded",
  "question.failed",
  "question.cancelled",
  "question.quota_blocked",
  "llm.call_completed",
  "llm.embedding_completed",
  "chart.generated",
  "result.returned",
  "connection.created",
  "connection.deleted",
  "connection.test",
  "schema.sync_queued",
  "schema.sync_succeeded",
  "schema.sync_failed",
  "schema.refresh_blocked",
  "conversation.created",
  "conversation.deleted",
  "dashboard.created",
  "dashboard.deleted",
  "dashboard_widget.created",
  "dashboard_widget.deleted",
  "dashboard_widget.refresh",
  "share.created",
  "share.revoked",
  "share.viewed",
  "share.password_rejected_by_plan",
  "export.requested",
  "settings.model_changed",
] as const;

export interface EventsFilters {
  eventTypes?: string[];
  userId?: string;
  from?: string;
  to?: string;
  /** Cursor: ISO createdAt of last item, then id. */
  cursorCreatedAt?: string;
  cursorId?: string;
  limit?: number;
}

export interface MetricEventRow {
  id: string;
  userId: string | null;
  eventType: string;
  resourceType: string | null;
  resourceId: string | null;
  queryRunId: string | null;
  payload: unknown;
  createdAt: Date;
}

export interface EventsFeedResult {
  rows: MetricEventRow[];
  nextCursor: { createdAt: string; id: string } | null;
}

export async function listMetricEvents(
  filters: EventsFilters = {},
): Promise<EventsFeedResult> {
  await requireAdmin();
  const db = adminDb();
  const limit = Math.min(PAGE_SIZE, Math.max(1, filters.limit ?? PAGE_SIZE));

  const where: {
    eventType?: { in: string[] };
    userId?: string;
    createdAt?: { gte?: Date; lte?: Date; lt?: Date };
    AND?: Array<Record<string, unknown>>;
  } = {};

  if (filters.eventTypes && filters.eventTypes.length > 0) {
    where.eventType = { in: filters.eventTypes };
  }
  if (filters.userId) where.userId = filters.userId;

  const createdAt: { gte?: Date; lte?: Date; lt?: Date } = {};
  if (filters.from) createdAt.gte = new Date(filters.from);
  if (filters.to) createdAt.lte = new Date(filters.to);

  if (filters.cursorCreatedAt && filters.cursorId) {
    const cursorDate = new Date(filters.cursorCreatedAt);
    where.AND = [
      {
        OR: [
          { createdAt: { lt: cursorDate } },
          {
            AND: [
              { createdAt: cursorDate },
              { id: { lt: filters.cursorId } },
            ],
          },
        ],
      },
    ];
  }

  if (Object.keys(createdAt).length > 0) {
    where.createdAt = { ...where.createdAt, ...createdAt };
  }

  const rows = await db.metricEvent.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? { createdAt: last.createdAt.toISOString(), id: last.id }
      : null;

  return {
    rows: page.map((r) => ({
      id: r.id,
      userId: r.userId,
      eventType: r.eventType,
      resourceType: r.resourceType,
      resourceId: r.resourceId,
      queryRunId: r.queryRunId,
      payload: r.payload,
      createdAt: r.createdAt,
    })),
    nextCursor,
  };
}
