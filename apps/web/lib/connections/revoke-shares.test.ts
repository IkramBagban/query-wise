/**
 * SPEC-13 §3: live-share revocation scoping. A fake tx models the widget→dashboard
 * denormalization and a set of share links; we assert the revocation touches ONLY
 * live, non-revoked links on dashboards that actually surface the deleted
 * connection — snapshot links and unrelated dashboards are left alone. No real DB.
 */
import assert from "node:assert";
import type { Prisma } from "@prisma/client";
import { revokeLiveSharesForDeletedConnection } from "./revoke-shares";

interface FakeLink {
  id: string;
  dashboardId: string;
  mode: "live" | "snapshot";
  revokedAt: Date | null;
  version: number;
}

function fakeTx(
  widgetsByConnection: Record<string, string[]>,
  links: FakeLink[],
) {
  return {
    links,
    dashboardWidget: {
      async findMany({ where }: { where: { connectionId: string } }) {
        const dashboardIds = widgetsByConnection[where.connectionId] ?? [];
        return [...new Set(dashboardIds)].map((dashboardId) => ({ dashboardId }));
      },
    },
    dashboardShareLink: {
      async updateMany({
        where,
        data,
      }: {
        where: { dashboardId: { in: string[] }; revokedAt: null; mode: "live" };
        data: { revokedAt: Date; version: { increment: number } };
      }) {
        const targets = new Set(where.dashboardId.in);
        let count = 0;
        for (const link of links) {
          if (
            targets.has(link.dashboardId) &&
            link.revokedAt === null &&
            link.mode === where.mode
          ) {
            link.revokedAt = data.revokedAt;
            link.version += data.version.increment;
            count += 1;
          }
        }
        return { count };
      },
    },
  };
}

async function runTests() {
  console.log("Running live-share revocation scoping tests...");
  const now = new Date("2026-07-14T00:00:00Z");

  // dashA & dashB both surface the deleted connection; dashC does not.
  {
    const links: FakeLink[] = [
      { id: "L1", dashboardId: "dashA", mode: "live", revokedAt: null, version: 1 },
      { id: "L2", dashboardId: "dashA", mode: "snapshot", revokedAt: null, version: 1 },
      { id: "L3", dashboardId: "dashB", mode: "live", revokedAt: null, version: 3 },
      { id: "L4", dashboardId: "dashB", mode: "live", revokedAt: new Date("2020-01-01"), version: 5 },
      { id: "L5", dashboardId: "dashC", mode: "live", revokedAt: null, version: 1 },
    ];
    const tx = fakeTx({ conn_1: ["dashA", "dashB", "dashA"] }, links);
    const count = await revokeLiveSharesForDeletedConnection(
      tx as unknown as Prisma.TransactionClient,
      "conn_1",
      now,
    );
    // Only L1 (dashA live) and L3 (dashB live) revoked.
    assert.strictEqual(count, 2, "exactly two live links revoked");
    const byId = new Map(links.map((l) => [l.id, l]));
    assert.strictEqual(byId.get("L1")!.revokedAt, now, "L1 live revoked");
    assert.strictEqual(byId.get("L2")!.revokedAt, null, "L2 snapshot untouched");
    assert.strictEqual(byId.get("L3")!.revokedAt, now, "L3 live revoked");
    assert.strictEqual(byId.get("L3")!.version, 4, "L3 version bumped");
    assert.strictEqual(byId.get("L4")!.version, 5, "L4 already-revoked untouched");
    assert.strictEqual(byId.get("L5")!.revokedAt, null, "L5 unrelated dashboard untouched");
  }

  // No widgets reference the connection → nothing revoked, no updateMany needed.
  {
    const links: FakeLink[] = [
      { id: "L1", dashboardId: "dashX", mode: "live", revokedAt: null, version: 1 },
    ];
    const tx = fakeTx({}, links);
    const count = await revokeLiveSharesForDeletedConnection(
      tx as unknown as Prisma.TransactionClient,
      "conn_missing",
      now,
    );
    assert.strictEqual(count, 0, "no affected dashboards → zero revoked");
    assert.strictEqual(links[0].revokedAt, null, "unrelated link untouched");
  }

  console.log("✓ live-share revocation scoping tests passed");
}

void runTests();
