/**
 * SPEC-08 §5.4 / §11.2: result data must never appear in the debug DTO.
 * Run: pnpm --filter @query-wise/admin test
 */
import assert from "node:assert/strict";
import {
  assertNoResultPayload,
  redactResultData,
} from "../lib/queries/run-debug-redaction";

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

console.log("run-debug redaction tests\n");

test("redactResultData hides rows and labels the redaction", () => {
  const summary = redactResultData({
    returnedRowCount: 42,
    totalRowCount: 100n,
    truncated: true,
    resultPreview: {
      columns: ["secret"],
      rows: [{ secret: "SHOULD_NEVER_LEAK" }],
    },
    resultBlocks: [
      { type: "table", rows: [{ a: 1 }, { a: 2 }] },
      { type: "chart", series: [1, 2, 3] },
    ],
  });
  assert.equal(summary.redacted, true);
  assert.equal(summary.returnedRowCount, 42);
  assert.equal(summary.totalRowCount, 100);
  assert.equal(summary.blockCount, 2);
  assert.match(summary.label, /result data hidden/);
  assert.match(summary.label, /42 rows/);
  assert.match(summary.label, /2 blocks/);
  const json = JSON.stringify(summary);
  assert.ok(!json.includes("SHOULD_NEVER_LEAK"));
  assert.ok(!json.includes("secret"));
});

test("assertNoResultPayload rejects DTOs with result keys", () => {
  const bad = {
    resultSummary: { redacted: true, label: "x", blockCount: 0 },
    resultPreview: { rows: [1] },
  };
  assert.throws(() => assertNoResultPayload(bad));
});

test("assertNoResultPayload accepts a clean DTO with question+SQL only", () => {
  const good = {
    questionText: "how many orders?",
    generatedQuery: { sql: "SELECT 1" },
    resultSummary: {
      redacted: true as const,
      returnedRowCount: 3,
      totalRowCount: 3,
      truncated: false,
      blockCount: 1,
      label: "«result data hidden — 3 rows, 1 blocks»",
    },
  };
  assertNoResultPayload(good);
  const json = JSON.stringify(good);
  assert.ok(json.includes("how many orders?"));
  assert.ok(json.includes("SELECT 1"));
  assert.ok(!json.includes("resultPreview"));
  assert.ok(!json.includes("resultBlocks"));
});

console.log(`\n${passed} passed`);
