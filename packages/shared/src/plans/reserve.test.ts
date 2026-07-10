import assert from "node:assert";
import { reserveQuestionQuota, reserveSchemaRefresh } from "./usage";
import { AppError } from "../dal/core";

/**
 * In-memory stand-in for the Prisma transaction client. Models only the two
 * UserUsagePeriod methods the reservation helpers call, so the conditional
 * increment (increment where current < limit) can be exercised without a DB.
 */
function fakeTx() {
  const rows = new Map<string, { questionsAccepted: number; schemaRefreshes: number }>();
  const keyOf = (userId: string, periodType: string, periodKey: string) => `${userId}|${periodType}|${periodKey}`;
  return {
    rows,
    userUsagePeriod: {
      async upsert({ where }: { where: { userId_periodType_periodKey: { userId: string; periodType: string; periodKey: string } } }) {
        const { userId, periodType, periodKey } = where.userId_periodType_periodKey;
        const k = keyOf(userId, periodType, periodKey);
        if (!rows.has(k)) rows.set(k, { questionsAccepted: 0, schemaRefreshes: 0 });
      },
      async updateMany({ where, data }: { where: Record<string, unknown>; data: Record<string, { increment: number }> }) {
        const k = keyOf(where.userId as string, where.periodType as string, where.periodKey as string);
        const row = rows.get(k);
        if (!row) return { count: 0 };
        const field = "questionsAccepted" in data ? "questionsAccepted" : "schemaRefreshes";
        const limitClause = (where[field] as { lt: number } | undefined)?.lt;
        if (limitClause !== undefined && row[field] >= limitClause) return { count: 0 };
        row[field] += data[field].increment;
        return { count: 1 };
      },
    },
  };
}

async function expectThrows(fn: () => Promise<unknown>, code: string) {
  try {
    await fn();
  } catch (error) {
    assert.ok(error instanceof AppError, "expected AppError");
    assert.strictEqual((error as AppError).code, code);
    return;
  }
  assert.fail(`expected ${code} to be thrown`);
}

async function runTests() {
  console.log("Running reserve tests...");
  const now = new Date("2026-07-09T10:00:00.000Z");

  // Daily cap: 5 succeed, the 6th is blocked.
  const tx = fakeTx();
  for (let i = 0; i < 5; i += 1) {
    await reserveQuestionQuota(tx as never, { userId: "u1", questionsPerDay: 5, questionsPerMonth: 25, now });
  }
  await expectThrows(
    () => reserveQuestionQuota(tx as never, { userId: "u1", questionsPerDay: 5, questionsPerMonth: 25, now }),
    "QUOTA_EXCEEDED_DAILY",
  );

  // Monthly cap: with a generous daily allowance, hitting the month limit blocks.
  const tx2 = fakeTx();
  for (let i = 0; i < 25; i += 1) {
    await reserveQuestionQuota(tx2 as never, { userId: "u2", questionsPerDay: 1000, questionsPerMonth: 25, now });
  }
  await expectThrows(
    () => reserveQuestionQuota(tx2 as never, { userId: "u2", questionsPerDay: 1000, questionsPerMonth: 25, now }),
    "QUOTA_EXCEEDED_MONTHLY",
  );

  // Separate users do not share counters.
  const tx3 = fakeTx();
  await reserveQuestionQuota(tx3 as never, { userId: "a", questionsPerDay: 1, questionsPerMonth: 25, now });
  await reserveQuestionQuota(tx3 as never, { userId: "b", questionsPerDay: 1, questionsPerMonth: 25, now });
  await expectThrows(
    () => reserveQuestionQuota(tx3 as never, { userId: "a", questionsPerDay: 1, questionsPerMonth: 25, now }),
    "QUOTA_EXCEEDED_DAILY",
  );

  // Schema refresh cap: 1/day for Free.
  const tx4 = fakeTx();
  await reserveSchemaRefresh(tx4 as never, { userId: "u3", schemaRefreshesPerDay: 1, now });
  await expectThrows(
    () => reserveSchemaRefresh(tx4 as never, { userId: "u3", schemaRefreshesPerDay: 1, now }),
    "QUOTA_EXCEEDED_SCHEMA_REFRESH",
  );

  console.log("✓ reserve tests passed");
}

runTests();
