/**
 * SPEC-08 §11.1: effectiveLimit = override ?? catalog (product shared module).
 * Admin does not re-implement; this verifies the contract still holds.
 */
import assert from "node:assert/strict";
// Import catalog only — avoid pulling app-db via plans/index side effects.
import { resolveEffectiveLimits } from "../../../packages/shared/src/plans/catalog";

let passed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (error) {
    console.error(`FAIL  ${name}`);
    throw error;
  }
}

console.log("effective-limits tests\n");

test("catalog defaults when no overrides", () => {
  const free = resolveEffectiveLimits("free", {});
  assert.equal(free.questionsPerDay, 5);
  assert.equal(free.questionsPerMonth, 25);
  assert.equal(free.maxConnectionsNonDemo, 1);
  assert.equal(free.maxDashboards, 1);
  assert.equal(free.schemaRefreshesPerDay, 1);
});

test("override wins for every overridable limit", () => {
  const limits = resolveEffectiveLimits("free", {
    questionsPerDayOverride: 50,
    questionsPerMonthOverride: 200,
    maxConnectionsOverride: 3,
    maxDashboardsOverride: 10,
    schemaRefreshesPerDayOverride: 7,
  });
  assert.equal(limits.questionsPerDay, 50);
  assert.equal(limits.questionsPerMonth, 200);
  assert.equal(limits.maxConnectionsNonDemo, 3);
  assert.equal(limits.maxDashboards, 10);
  assert.equal(limits.schemaRefreshesPerDay, 7);
});

test("cleared override (null) restores catalog", () => {
  const limits = resolveEffectiveLimits("free", {
    questionsPerDayOverride: null,
    questionsPerMonthOverride: null,
  });
  assert.equal(limits.questionsPerDay, 5);
  assert.equal(limits.questionsPerMonth, 25);
});

test("zero override is honored", () => {
  assert.equal(
    resolveEffectiveLimits("pro", { questionsPerDayOverride: 0 }).questionsPerDay,
    0,
  );
});

test("feature gates stay catalog-driven (no override columns)", () => {
  const limits = resolveEffectiveLimits("free", {
    questionsPerDayOverride: 999,
  });
  assert.equal(limits.allowPasswordShares, false);
  assert.equal(limits.maxActiveShareLinks, 1);
});

console.log(`\n${passed} passed`);
