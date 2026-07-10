import assert from "node:assert";
import {
  dayPeriodKey,
  monthPeriodKey,
  periodKey,
  secondsUntilNextUtcMidnight,
  secondsUntilNextUtcMonth,
} from "./periods";
import { PLAN_CATALOG, getPlanDefinition, resolveEffectiveLimits } from "./catalog";

function runTests() {
  console.log("Running plans tests...");

  // ── Period keys (UTC) ──────────────────────────────────────────────
  assert.strictEqual(dayPeriodKey(new Date("2026-07-09T13:45:00.000Z")), "2026-07-09");
  assert.strictEqual(monthPeriodKey(new Date("2026-07-09T13:45:00.000Z")), "2026-07");
  // Just before UTC midnight stays on the same day; just after rolls over.
  assert.strictEqual(dayPeriodKey(new Date("2026-07-09T23:59:59.999Z")), "2026-07-09");
  assert.strictEqual(dayPeriodKey(new Date("2026-07-10T00:00:00.000Z")), "2026-07-10");
  // Month boundary.
  assert.strictEqual(monthPeriodKey(new Date("2026-07-31T23:59:59.999Z")), "2026-07");
  assert.strictEqual(monthPeriodKey(new Date("2026-08-01T00:00:00.000Z")), "2026-08");
  // Leap day.
  assert.strictEqual(dayPeriodKey(new Date("2028-02-29T12:00:00.000Z")), "2028-02-29");
  assert.strictEqual(periodKey("day", new Date("2026-01-01T00:00:00.000Z")), "2026-01-01");
  assert.strictEqual(periodKey("month", new Date("2026-01-01T00:00:00.000Z")), "2026-01");

  // ── retryAfter helpers ─────────────────────────────────────────────
  // One second before UTC midnight → 1 second remaining.
  assert.strictEqual(secondsUntilNextUtcMidnight(new Date("2026-07-09T23:59:59.000Z")), 1);
  // A full day from midnight → 86400.
  assert.strictEqual(secondsUntilNextUtcMidnight(new Date("2026-07-09T00:00:00.000Z")), 86_400);
  // End of month → 1 second to next month.
  assert.strictEqual(secondsUntilNextUtcMonth(new Date("2026-07-31T23:59:59.000Z")), 1);
  assert.ok(secondsUntilNextUtcMonth(new Date("2026-07-01T00:00:00.000Z")) > 0);

  // ── Catalog limits ─────────────────────────────────────────────────
  assert.strictEqual(PLAN_CATALOG.free.questionsPerDay, 5);
  assert.strictEqual(PLAN_CATALOG.free.questionsPerMonth, 25);
  assert.strictEqual(PLAN_CATALOG.free.maxConnectionsNonDemo, 1);
  assert.strictEqual(PLAN_CATALOG.free.maxDashboards, 1);
  assert.strictEqual(PLAN_CATALOG.free.maxActiveShareLinks, 1);
  assert.strictEqual(PLAN_CATALOG.free.allowPasswordShares, false);
  assert.strictEqual(PLAN_CATALOG.free.schemaRefreshesPerDay, 1);
  assert.strictEqual(PLAN_CATALOG.free.modelTier, "fast");
  assert.strictEqual(PLAN_CATALOG.pro.questionsPerDay, 50);
  assert.strictEqual(PLAN_CATALOG.pro.questionsPerMonth, 500);
  assert.strictEqual(PLAN_CATALOG.pro.maxConnectionsNonDemo, 5);
  assert.strictEqual(PLAN_CATALOG.pro.maxDashboards, 100);
  assert.strictEqual(PLAN_CATALOG.pro.maxActiveShareLinks, 20);
  assert.strictEqual(PLAN_CATALOG.pro.allowPasswordShares, true);
  assert.strictEqual(PLAN_CATALOG.pro.modelTier, "premium");
  assert.strictEqual(getPlanDefinition("pro").displayName, "Pro");

  // ── Effective limits: override ?? catalog ──────────────────────────
  const freeNoOverride = resolveEffectiveLimits("free", {});
  assert.strictEqual(freeNoOverride.questionsPerDay, 5);
  assert.strictEqual(freeNoOverride.maxConnectionsNonDemo, 1);

  const boosted = resolveEffectiveLimits("free", { questionsPerDayOverride: 50 });
  assert.strictEqual(boosted.questionsPerDay, 50, "override wins over catalog");
  assert.strictEqual(boosted.questionsPerMonth, 25, "unset override falls back to catalog");

  // A null override reverts to the catalog default (cleared override).
  const cleared = resolveEffectiveLimits("free", { questionsPerDayOverride: null });
  assert.strictEqual(cleared.questionsPerDay, 5);

  // A zero override is honored (not treated as "unset").
  const zeroed = resolveEffectiveLimits("free", { questionsPerDayOverride: 0 });
  assert.strictEqual(zeroed.questionsPerDay, 0);

  // Overrides never change feature gates (password shares stay catalog-driven).
  const proOverride = resolveEffectiveLimits("pro", { maxDashboardsOverride: 250 });
  assert.strictEqual(proOverride.maxDashboards, 250);
  assert.strictEqual(proOverride.allowPasswordShares, true);

  console.log("✓ plans tests passed");
}

runTests();
