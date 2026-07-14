/**
 * SPEC-12 §11.2: the race-proof redemption core (create-first, conditional
 * increment). Exercised with an in-memory fake tx that models the
 * (couponId,userId) unique constraint and the atomic cap — no real DB.
 */
import assert from "node:assert";
import { Prisma } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { AppError } from "@query-wise/shared/dal/core";
import { applyRedemption, type RedeemableCoupon } from "./redeem-tx";

function uniqueViolation(): PrismaClientKnownRequestError {
  return new PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
  });
}

/** Fake tx modeling the unique redemption key and the conditional cap increment. */
function fakeTx(initialCount = 0, maxRedemptions: number | null = null) {
  const redemptions = new Set<string>(); // `${couponId}|${userId}`
  const state = { redemptionCount: initialCount, maxRedemptions };
  return {
    redemptions,
    state,
    couponRedemption: {
      async create({ data }: { data: Record<string, unknown> }) {
        const key = `${String(data.couponId)}|${String(data.userId)}`;
        if (redemptions.has(key)) throw uniqueViolation();
        redemptions.add(key);
        return data;
      },
    },
    coupon: {
      async updateMany({ where }: { where: Record<string, unknown>; data: Record<string, unknown> }) {
        // Emulate WHERE id AND (maxRedemptions IS NULL OR redemptionCount < max)
        // against this row's own columns.
        const or = where.OR as Array<Record<string, unknown>>;
        const matchesNull =
          or.some((c) => c.maxRedemptions === null) && state.maxRedemptions === null;
        const capClause = or.find((c) => "redemptionCount" in c) as
          | { redemptionCount: { lt: number } }
          | undefined;
        const matchesCap =
          capClause !== undefined && state.redemptionCount < capClause.redemptionCount.lt;
        if (matchesNull || matchesCap) {
          state.redemptionCount += 1;
          return { count: 1 };
        }
        return { count: 0 };
      },
    },
  };
}

function coupon(over: Partial<RedeemableCoupon> = {}): RedeemableCoupon {
  return {
    id: "coupon_1",
    code: "LAUNCH",
    grantDurationDays: 14,
    questionsPerDayDelta: 50,
    questionsPerMonthDelta: 0,
    maxConnectionsDelta: 0,
    maxDashboardsDelta: 0,
    grantsPro: false,
    maxRedemptions: null,
    ...over,
  };
}

async function expectCode(fn: () => Promise<unknown>, code: string) {
  try {
    await fn();
  } catch (error) {
    assert.ok(error instanceof AppError, `expected AppError, got ${error}`);
    assert.strictEqual((error as AppError).code, code);
    return;
  }
  assert.fail(`expected throw ${code}`);
}

async function runTests() {
  console.log("Running redemption tx tests...");
  const now = new Date("2026-07-14T00:00:00Z");

  // Happy path: uncapped coupon → grant created, count incremented, snapshot returned.
  {
    const tx = fakeTx(0);
    const result = await applyRedemption(tx, coupon(), "user_1", now);
    assert.strictEqual(result.benefits.questionsPerDayDelta, 50);
    assert.strictEqual(tx.state.redemptionCount, 1);
    // grantExpiresAt = now + 14d.
    assert.strictEqual(
      result.grantExpiresAt.toISOString(),
      new Date("2026-07-28T00:00:00Z").toISOString(),
    );
  }

  // Double-redeem by same user → COUPON_ALREADY_REDEEMED (unique guard).
  {
    const tx = fakeTx(0);
    await applyRedemption(tx, coupon(), "user_1", now);
    await expectCode(() => applyRedemption(tx, coupon(), "user_1", now), "COUPON_ALREADY_REDEEMED");
    // Count only moved once.
    assert.strictEqual(tx.state.redemptionCount, 1);
  }

  // Cap reached: maxRedemptions=1, two different users → exactly one succeeds,
  // second throws COUPON_FULLY_REDEEMED and does not over-issue.
  {
    const tx = fakeTx(0, 1);
    const capped = coupon({ maxRedemptions: 1 });
    await applyRedemption(tx, capped, "user_1", now);
    assert.strictEqual(tx.state.redemptionCount, 1);
    await expectCode(() => applyRedemption(tx, capped, "user_2", now), "COUPON_FULLY_REDEEMED");
    assert.strictEqual(tx.state.redemptionCount, 1, "cap not exceeded");
  }

  console.log("✓ redemption tx tests passed");
}

void runTests();
