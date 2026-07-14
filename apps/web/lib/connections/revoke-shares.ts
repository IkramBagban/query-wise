import type { Prisma } from "@prisma/client";

/**
 * SPEC-13 §3: revoke live share links belonging to dashboards that surface a
 * (now soft-deleted) connection. Snapshot links are deliberately untouched — they
 * serve frozen data and never reach the database. Not `server-only` so it stays
 * unit-testable with a fake tx; production callers already run in a server context.
 *
 * Scoping guarantees (each enforced by the queries below):
 * - only dashboards with ≥1 widget denormalized to this connectionId,
 * - only links with `mode = "live"`,
 * - only links that are not already revoked (`revokedAt IS NULL`).
 *
 * Returns the number of links revoked (for the audit log).
 */
export async function revokeLiveSharesForDeletedConnection(
  tx: Prisma.TransactionClient,
  connectionId: string,
  now: Date = new Date(),
): Promise<number> {
  const affectedDashboards = await tx.dashboardWidget.findMany({
    where: { connectionId },
    select: { dashboardId: true },
    distinct: ["dashboardId"],
  });
  const dashboardIds = [...new Set(affectedDashboards.map((row) => row.dashboardId))];
  if (dashboardIds.length === 0) return 0;
  const revoked = await tx.dashboardShareLink.updateMany({
    where: { dashboardId: { in: dashboardIds }, revokedAt: null, mode: "live" },
    data: { revokedAt: now, version: { increment: 1 } },
  });
  return revoked.count;
}
