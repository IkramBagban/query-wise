import assert from "assert";
import type { BoundedQueryResult } from "@query-wise/shared/types";
import { buildVerificationPrompt, VERIFIER_SYSTEM } from "./verification";
import type { AgentResultBlock } from "./types";

/**
 * SPEC-11 §B tests. Three verifier gaps the 2026-07-12 follow-up exposed:
 * period-label attribution, soft-ask coverage, and internal consistency. These
 * are LLM-free assertions on the verifier's SYSTEM instructions and on the
 * evidence the prompt hands the verifier — the material it needs to catch a
 * right-magnitude/wrong-month claim. (Whether the model then flags it is the
 * "one recorded live check" the spec calls for, run against a real key.)
 */

/** Incident-shaped monthly revenue: the Nov-2025 spike lives away from the first rows. */
function incidentBlock(): AgentResultBlock {
  const rows = [
    { order_month: "2026-01", total_revenue: 807277.43 },
    { order_month: "2026-02", total_revenue: 912004.11 },
    { order_month: "2025-10", total_revenue: 1012884.02 },
    { order_month: "2025-11", total_revenue: 2729077.09 },
    { order_month: "2025-12", total_revenue: 2411559.88 },
  ];
  const result: BoundedQueryResult = {
    columns: [
      { name: "order_month", canonicalType: "string", nullable: false },
      { name: "total_revenue", canonicalType: "decimal", nullable: false },
    ],
    rows,
    returnedRowCount: rows.length,
    totalRowCount: rows.length,
    truncated: false,
    executionTimeMs: 12,
    bytesReturned: 256,
  };
  return {
    index: 0,
    purpose: "Monthly revenue",
    sql: "SELECT date_trunc('month', o.created_at) AS order_month, SUM(o.total) AS total_revenue FROM orders o GROUP BY 1",
    result,
    chartHint: null,
    chartConfig: null,
  };
}

function runTests() {
  console.log("Running SPEC-11 §B verifier tests...");

  // (1) Period-label attribution instruction present.
  assert.ok(
    /named period against the labels in the stats line/i.test(VERIFIER_SYSTEM),
    "VERIFIER_SYSTEM instructs a period-label check",
  );
  assert.ok(
    /wrong period label is a number_mismatch/i.test(VERIFIER_SYSTEM),
    "VERIFIER_SYSTEM classifies wrong-period as number_mismatch",
  );

  // (2) Soft-ask coverage instruction present.
  assert.ok(
    /question_not_answered includes soft asks/i.test(VERIFIER_SYSTEM),
    "VERIFIER_SYSTEM extends question_not_answered to soft asks",
  );

  // (3) Internal-consistency instruction present.
  assert.ok(
    /two readings that contradict each other about the same period/i.test(VERIFIER_SYSTEM),
    "VERIFIER_SYSTEM flags contradictory readings as number_mismatch",
  );

  // The block-index-order requirement was superseded (SPEC-11 acceptance 4b): the
  // analyst chooses coverage order, so the verifier must not treat order as wrong.
  assert.ok(
    !/in block-index order/i.test(VERIFIER_SYSTEM),
    "VERIFIER_SYSTEM no longer requires block-index-order coverage",
  );

  // Fixture: the prompt must hand the verifier the labeled extreme (2025-11) so a
  // wrong-month claim ("October and November") is checkable WITHOUT the LLM having
  // to recompute anything — the stats line carries WHEN the max occurred.
  const block = incidentBlock();
  const wrongMonthAnswer =
    "**Revenue surged in October and November 2025**, peaking near $2.7M before easing.";
  const prompt = buildVerificationPrompt("How did monthly revenue trend?", [block], wrongMonthAnswer, []);

  assert.ok(prompt.includes("2025-11"), "prompt evidence labels the max month (2025-11)");
  assert.ok(prompt.includes("2729077.09"), "prompt evidence carries the peak value");
  assert.ok(prompt.includes(wrongMonthAnswer), "prompt embeds the drafted (wrong-month) answer");
  assert.ok(/stats \(over ALL rows\)/.test(prompt), "prompt carries the full-result stats line");

  console.log("✓ All SPEC-11 §B verifier tests passed");
}

runTests();
