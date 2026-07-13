import assert from "assert";
import type { BoundedQueryResult } from "@query-wise/shared/types";
import { computeColumnStats, renderColumnStatsLine } from "./column-stats";

/**
 * SPEC-10 §2.1 tests. computeColumnStats is the ground truth that makes the
 * 2026-07-12 "verified-wrong" class of failure impossible: stats are computed
 * over ALL rows so extremes survive every later digest/evidence elision.
 */

function result(columns: string[], rows: Record<string, unknown>[]): BoundedQueryResult {
  return {
    columns: columns.map((name) => ({ name, canonicalType: "string", nullable: true })) as BoundedQueryResult["columns"],
    rows: rows as BoundedQueryResult["rows"],
    returnedRowCount: rows.length,
    totalRowCount: rows.length,
    truncated: false,
    executionTimeMs: 1,
    bytesReturned: 0,
  };
}

/** The §0 incident fixture: 12 monthly rows with the Nov/Dec 2025 ~2.7M spike. */
export const INCIDENT_ROWS: Record<string, unknown>[] = [
  { month: "2025-05", total_revenue: "1000000.00" },
  { month: "2025-06", total_revenue: "1010000.00" },
  { month: "2025-07", total_revenue: "990000.00" },
  { month: "2025-08", total_revenue: "1020000.00" },
  { month: "2025-09", total_revenue: "1005000.00" },
  { month: "2025-10", total_revenue: "1015000.00" },
  { month: "2025-11", total_revenue: "2729077.09" },
  { month: "2025-12", total_revenue: "2720247.00" },
  { month: "2026-01", total_revenue: "807277.43" },
  { month: "2026-02", total_revenue: "1030000.00" },
  { month: "2026-03", total_revenue: "1040000.00" },
  { month: "2026-04", total_revenue: "1025000.00" },
];

function runTests() {
  console.log("Running computeColumnStats tests...");

  // 1. Empty result → no stats.
  assert.deepStrictEqual(computeColumnStats(result(["a"], [])), [], "empty result → []");

  // 2. Single row → min == max, mean == value.
  const single = computeColumnStats(result(["n"], [{ n: 42 }]));
  assert.strictEqual(single.length, 1, "single: one stat");
  assert.strictEqual(single[0].min, 42, "single: min");
  assert.strictEqual(single[0].max, 42, "single: max");
  assert.strictEqual(single[0].mean, 42, "single: mean");

  // 3. String numerics (Postgres numerics arrive as strings) parse as numeric.
  const strNum = computeColumnStats(result(["rev"], [{ rev: "100.5" }, { rev: "200.5" }, { rev: "300" }]));
  assert.strictEqual(strNum[0].kind, "numeric", "string numerics classified numeric");
  assert.strictEqual(strNum[0].min, 100.5, "string numerics: min");
  assert.strictEqual(strNum[0].max, 300, "string numerics: max");
  assert.strictEqual(strNum[0].mean, 200.33, "string numerics: mean 2dp");

  // 4. Nulls are ignored for numeric aggregation.
  const withNulls = computeColumnStats(result(["n"], [{ n: 10 }, { n: null }, { n: 30 }, { n: null }]));
  assert.strictEqual(withNulls[0].min, 10, "nulls ignored: min");
  assert.strictEqual(withNulls[0].max, 30, "nulls ignored: max");
  assert.strictEqual(withNulls[0].mean, 20, "nulls ignored: mean over non-nulls");

  // 5. All-null column → skipped (no stats entry).
  const allNull = computeColumnStats(result(["a", "n"], [{ a: null, n: 1 }, { a: null, n: 2 }]));
  assert.strictEqual(allNull.find((s) => s.column === "a"), undefined, "all-null column skipped");
  assert.strictEqual(allNull.find((s) => s.column === "n")?.kind, "numeric", "numeric column still present");

  // 6. Mixed-type column → neither all-numeric nor all-temporal → skipped.
  const mixed = computeColumnStats(result(["m"], [{ m: 1 }, { m: "hello" }, { m: 3 }]));
  assert.strictEqual(mixed.length, 0, "mixed-type column skipped");

  // 7. >8 numeric columns → cap at 8, numerics prioritized.
  const wideRow: Record<string, unknown> = {};
  const wideCols: string[] = [];
  for (let i = 0; i < 12; i += 1) {
    wideCols.push(`c${i}`);
    wideRow[`c${i}`] = i;
  }
  const wide = computeColumnStats(result(wideCols, [wideRow]));
  assert.strictEqual(wide.length, 8, ">8 numeric columns capped at 8");
  assert.ok(wide.every((s) => s.kind === "numeric"), "cap prioritizes numerics");

  // 8. Temporal detection (ISO month strings) yields min/max, no mean.
  const temporal = computeColumnStats(result(["d"], [{ d: "2025-11" }, { d: "2025-05" }, { d: "2026-01" }]));
  assert.strictEqual(temporal[0].kind, "temporal", "ISO months classified temporal");
  assert.strictEqual(temporal[0].min, "2025-05", "temporal min");
  assert.strictEqual(temporal[0].max, "2026-01", "temporal max");
  assert.strictEqual(temporal[0].mean, undefined, "temporal has no mean");

  // 9. THE INCIDENT: the Nov/Dec spike must be in the stats even though the
  // first/last visible rows are all ~$1M.
  const incident = computeColumnStats(result(["month", "total_revenue"], INCIDENT_ROWS));
  const rev = incident.find((s) => s.column === "total_revenue");
  assert.ok(rev, "incident: revenue stat present");
  assert.strictEqual(rev!.max, 2729077.09, "incident: max is the Nov spike");
  assert.strictEqual(rev!.min, 807277.43, "incident: min is the Jan dip");
  assert.strictEqual((rev!.maxRow as { month: string }).month, "2025-11", "incident: maxRow is Nov 2025");
  assert.strictEqual((rev!.minRow as { month: string }).month, "2026-01", "incident: minRow is Jan 2026");

  // The rendered stats line (used by verifier evidence) exposes the spike + label.
  const line = renderColumnStatsLine(incident);
  assert.ok(line.includes("2729077.09"), "stats line shows the spike value");
  assert.ok(line.includes("2025-11"), "stats line labels the spike month");
  assert.ok(line.includes("807277.43"), "stats line shows the dip value");

  console.log("✓ All computeColumnStats tests passed");
}

runTests();
