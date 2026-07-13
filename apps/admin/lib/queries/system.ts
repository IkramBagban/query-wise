import "server-only";

import { requireAdmin } from "@/lib/admin-auth";
import { adminDb } from "@/lib/db";
export interface SystemHealthData {
  jobs: {
    byStatus: Array<{ status: string; count: number }>;
    oldestQueuedAgeSeconds: number | null;
    recentFailures: Array<{
      id: string;
      type: string;
      lastErrorCode: string | null;
      updatedAt: Date;
      attempts: number;
    }>;
  };
  schemaSyncs7d: {
    queued: number;
    succeeded: number;
    failed: number;
    latestFailedSnapshots: Array<{
      id: string;
      connectionId: string;
      errorCode: string | null;
      updatedAt: Date;
    }>;
  };
  queryRunErrors7d: Array<{ errorCode: string; count: number }>;
  recoveryActivity7d: number;
}

export async function getSystemHealth(): Promise<SystemHealthData> {
  await requireAdmin();
  const db = adminDb();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    jobGroups,
    oldestQueued,
    recentFailures,
    schemaQueued,
    schemaSucceeded,
    schemaFailed,
    failedSnapshots,
    errorGroups,
    recoveryCount,
  ] = await Promise.all([
    db.durableJob.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    db.durableJob.findFirst({
      where: { status: "queued" },
      orderBy: { availableAt: "asc" },
      select: { availableAt: true },
    }),
    db.durableJob.findMany({
      where: {
        status: "dead",
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: {
        id: true,
        type: true,
        lastErrorCode: true,
        updatedAt: true,
        attempts: true,
      },
    }),
    db.metricEvent.count({
      where: {
        eventType: "schema.sync_queued",
        createdAt: { gte: sevenDaysAgo },
      },
    }),
    db.metricEvent.count({
      where: {
        eventType: "schema.sync_succeeded",
        createdAt: { gte: sevenDaysAgo },
      },
    }),
    db.metricEvent.count({
      where: {
        eventType: "schema.sync_failed",
        createdAt: { gte: sevenDaysAgo },
      },
    }),
    db.schemaSnapshot.findMany({
      where: {
        status: "failed",
        updatedAt: { gte: sevenDaysAgo },
      },
      orderBy: { updatedAt: "desc" },
      take: 15,
      select: {
        id: true,
        connectionId: true,
        errorCode: true,
        updatedAt: true,
      },
    }),
    db.queryRun.groupBy({
      by: ["errorCode"],
      where: {
        createdAt: { gte: sevenDaysAgo },
        errorCode: { not: null },
      },
      _count: { _all: true },
      orderBy: { _count: { errorCode: "desc" } },
      take: 30,
    }),
    // Recovery path marks runs via status index; count runs updated while not
    // terminal that sat in recovery window — approximate via recovery index usage:
    // runs that finished with recovery-related error codes or status churn.
    db.queryRun.count({
      where: {
        updatedAt: { gte: sevenDaysAgo },
        status: {
          in: [
            "accepted",
            "preparing",
            "generating",
            "validating",
            "executing",
            "persisting",
          ],
        },
      },
    }),
  ]);

  let oldestQueuedAgeSeconds: number | null = null;
  if (oldestQueued) {
    oldestQueuedAgeSeconds = Math.max(
      0,
      Math.floor((now.getTime() - oldestQueued.availableAt.getTime()) / 1000),
    );
  }

  return {
    jobs: {
      byStatus: jobGroups.map((g) => ({
        status: g.status,
        count: g._count._all,
      })),
      oldestQueuedAgeSeconds,
      recentFailures,
    },
    schemaSyncs7d: {
      queued: schemaQueued,
      succeeded: schemaSucceeded,
      failed: schemaFailed,
      latestFailedSnapshots: failedSnapshots,
    },
    queryRunErrors7d: errorGroups
      .filter((g) => g.errorCode)
      .map((g) => ({
        errorCode: g.errorCode as string,
        count: g._count._all,
      })),
    recoveryActivity7d: recoveryCount,
  };
}
