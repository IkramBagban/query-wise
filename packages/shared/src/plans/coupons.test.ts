import assert from "node:assert";
import { applyCouponGrants, resolveEffectiveLimits, type ActiveGrantDeltas } from "./catalog";
import { foldUserPlan } from "./get-user-plan";

function delta(over: Partial<ActiveGrantDeltas> = {}): ActiveGrantDeltas {
  return {
    questionsPerDayDelta: 0,
    questionsPerMonthDelta: 0,
    maxConnectionsDelta: 0,
    maxDashboardsDelta: 0,
    ...over,
  };
}

function planRow(over: Partial<Parameters<typeof foldUserPlan>[0]> = {}) {
  return {
    userId: "user_1",
    planId: "free",
    status: "active",
    source: "default",
    proGrantedAt: null,
    questionsPerDayOverride: null,
    questionsPerMonthOverride: null,
    maxConnectionsOverride: null,
    maxDashboardsOverride: null,
    schemaRefreshesPerDayOverride: null,
    ...over,
  };
}

function grant(over: Record<string, unknown> = {}) {
  return {
    couponId: "c1",
    grantExpiresAt: new Date("2999-01-01T00:00:00Z"),
    questionsPerDayDelta: 0,
    questionsPerMonthDelta: 0,
    maxConnectionsDelta: 0,
    maxDashboardsDelta: 0,
    grantsPro: false,
    coupon: { code: "LAUNCH" },
    ...over,
  };
}

function runTests() {
  console.log("Running coupon grant tests...");

  // ── applyCouponGrants (pure) ───────────────────────────────────────
  const base = resolveEffectiveLimits("free", {});

  // Empty grants → base unchanged (identity, same reference is fine).
  assert.deepStrictEqual(applyCouponGrants(base, []), base);

  // Single delta adds on top.
  const one = applyCouponGrants(base, [delta({ questionsPerDayDelta: 50 })]);
  assert.strictEqual(one.questionsPerDay, 55, "5 base + 50 delta");
  assert.strictEqual(one.questionsPerMonth, 25, "untouched lever stays base");

  // Multiple grants stack (sum), across all four numeric levers.
  const stacked = applyCouponGrants(base, [
    delta({ questionsPerDayDelta: 10, maxConnectionsDelta: 2 }),
    delta({ questionsPerDayDelta: 15, maxDashboardsDelta: 3 }),
  ]);
  assert.strictEqual(stacked.questionsPerDay, 5 + 25, "deltas sum");
  assert.strictEqual(stacked.maxConnectionsNonDemo, 1 + 2);
  assert.strictEqual(stacked.maxDashboards, 1 + 3);

  // Feature gates never move via deltas (password shares stay catalog-driven for Free).
  assert.strictEqual(one.allowPasswordShares, false);
  assert.strictEqual(one.maxActiveShareLinks, base.maxActiveShareLinks);

  // ── foldUserPlan: expired grants are the caller's concern; here inputs
  //    are already the active set, so an empty set = base plan. ─────────
  const freeNoGrants = foldUserPlan(planRow(), []);
  assert.strictEqual(freeNoGrants.planId, "free");
  assert.strictEqual(freeNoGrants.limits.questionsPerDay, 5);
  assert.strictEqual(freeNoGrants.activeGrants.length, 0);

  // Numeric grant on a Free user raises the enforced daily cap.
  const boosted = foldUserPlan(planRow(), [grant({ questionsPerDayDelta: 50 })]);
  assert.strictEqual(boosted.limits.questionsPerDay, 55);
  assert.strictEqual(boosted.activeGrants.length, 1);
  assert.strictEqual(boosted.activeGrants[0].couponCode, "LAUNCH");

  // Pro grant flips a Free user to the Pro catalog (boolean OR) and unlocks
  // password shares + the 20-link cap for the window.
  const proGrant = foldUserPlan(planRow(), [grant({ grantsPro: true })]);
  assert.strictEqual(proGrant.planId, "pro");
  assert.strictEqual(proGrant.limits.questionsPerDay, 50, "Pro catalog daily");
  assert.strictEqual(proGrant.limits.allowPasswordShares, true, "Pro unlocks password shares");
  assert.strictEqual(proGrant.limits.maxActiveShareLinks, 20);

  // Pro grant + numeric delta compose (Pro base 50 + delta 5).
  const proPlusDelta = foldUserPlan(planRow(), [grant({ grantsPro: true, questionsPerDayDelta: 5 })]);
  assert.strictEqual(proPlusDelta.limits.questionsPerDay, 55);

  // A coupon Pro grant NEVER downgrades a real (manual) Pro user, and its
  // absence leaves the real Pro intact.
  const realPro = foldUserPlan(planRow({ planId: "pro", source: "manual" }), []);
  assert.strictEqual(realPro.planId, "pro");
  assert.strictEqual(realPro.limits.questionsPerDay, 50);
  const realProWithDelta = foldUserPlan(
    planRow({ planId: "pro", source: "manual" }),
    [grant({ questionsPerDayDelta: 10 })],
  );
  assert.strictEqual(realProWithDelta.planId, "pro");
  assert.strictEqual(realProWithDelta.limits.questionsPerDay, 60, "real Pro base + delta");

  // Override base composes with a grant delta: override sets the base, grant adds.
  const overriddenPlusGrant = foldUserPlan(
    planRow({ questionsPerDayOverride: 100 }),
    [grant({ questionsPerDayDelta: 25 })],
  );
  assert.strictEqual(overriddenPlusGrant.limits.questionsPerDay, 125, "override 100 + delta 25");

  console.log("✓ coupon grant tests passed");
}

runTests();
