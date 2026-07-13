import assert from "assert";
import type { BlockView } from "@query-wise/shared/types";
import type { QueryResult } from "@/types";
import { applyViewTransform, availableTransforms, viewChartConfig } from "./views";
import { toCumulative } from "./transforms";

/**
 * SPEC-09 §2.2 transform tests. Every transform is exercised against the awkward
 * shapes the spec calls out — empty rows, a single row, null cells, and a
 * non-numeric measure — to prove `applyViewTransform` is total (never throws) and
 * degrades to the raw result rather than producing garbage.
 */

function view(partial: Partial<BlockView> & { transform: BlockView["transform"] }): BlockView {
  return {
    id: "v",
    chartConfig: { schemaVersion: 1, type: "bar" },
    transform: partial.transform,
    ...partial,
  };
}

function result(rows: Record<string, unknown>[], columns: string[]): QueryResult {
  return { columns, rows, rowCount: rows.length, executionTimeMs: 1 };
}

function runTests() {
  console.log("Running view-transform tests...");

  const monthly = result(
    [
      { month: "2024-01-01", revenue: 100 },
      { month: "2024-02-01", revenue: 50 },
      { month: "2024-03-01", revenue: 25 },
    ],
    ["month", "revenue"],
  );

  // --- cumulative ---
  const cumulativeView = view({
    chartConfig: { schemaVersion: 1, type: "line", xKey: "month", yKey: "revenue" },
    transform: { kind: "cumulative", measureKeys: ["revenue"] },
  });
  const cumulative = applyViewTransform(monthly, cumulativeView);
  assert.deepStrictEqual(
    cumulative.rows.map((r) => r.revenue),
    [100, 150, 175],
    "cumulative sums running total in x order",
  );
  // Ordering is enforced even when input rows are shuffled.
  const shuffled = result(
    [
      { month: "2024-03-01", revenue: 25 },
      { month: "2024-01-01", revenue: 100 },
      { month: "2024-02-01", revenue: 50 },
    ],
    ["month", "revenue"],
  );
  assert.deepStrictEqual(
    applyViewTransform(shuffled, cumulativeView).rows.map((r) => r.revenue),
    [100, 150, 175],
    "cumulative sorts by x before accumulating",
  );

  // --- topN with Others bucket ---
  const ranked = result(
    [
      { product: "A", sales: 100 },
      { product: "B", sales: 80 },
      { product: "C", sales: 60 },
      { product: "D", sales: 40 },
      { product: "E", sales: 20 },
    ],
    ["product", "sales"],
  );
  const topN = applyViewTransform(
    ranked,
    view({
      chartConfig: { schemaVersion: 1, type: "bar", xKey: "product", yKey: "sales" },
      transform: { kind: "topN", n: 2, measureKey: "sales", othersBucket: true },
    }),
  );
  assert.strictEqual(topN.rows.length, 3, "top 2 + Other = 3 rows");
  assert.strictEqual(topN.rows[2].product, "Other", "overflow collapses to Other");
  assert.strictEqual(Number(topN.rows[2].sales), 120, "Other aggregates C+D+E");

  // topN without Others = plain slice
  const topNoOthers = applyViewTransform(
    ranked,
    view({
      chartConfig: { schemaVersion: 1, type: "bar", xKey: "product", yKey: "sales" },
      transform: { kind: "topN", n: 2, measureKey: "sales", othersBucket: false },
    }),
  );
  assert.deepStrictEqual(topNoOthers.rows.map((r) => r.product), ["A", "B"], "slice keeps top 2 only");

  // --- percentOfTotal (multi-measure composition) ---
  const composition = result(
    [
      { month: "2024-01-01", a: 30, b: 10 },
      { month: "2024-02-01", a: 20, b: 20 },
    ],
    ["month", "a", "b"],
  );
  const pct = applyViewTransform(
    composition,
    view({
      chartConfig: { schemaVersion: 1, type: "area", xKey: "month", yKeys: ["a", "b"] },
      transform: { kind: "percentOfTotal", measureKeys: ["a", "b"] },
    }),
  );
  assert.strictEqual(Number(pct.rows[0].a), 75, "row 1: 30/40 = 75%");
  assert.strictEqual(Number(pct.rows[1].a), 50, "row 2: 20/40 = 50%");

  // --- pivot (long → wide) ---
  const long = result(
    [
      { month: "2024-01-01", category: "X", revenue: 10 },
      { month: "2024-01-01", category: "Y", revenue: 5 },
      { month: "2024-02-01", category: "X", revenue: 20 },
      { month: "2024-02-01", category: "Y", revenue: 8 },
    ],
    ["month", "category", "revenue"],
  );
  const pivotView = view({
    chartConfig: { schemaVersion: 1, type: "line", xKey: "month", yKey: "revenue" },
    transform: { kind: "pivot", seriesKey: "category" },
  });
  const pivoted = applyViewTransform(long, pivotView);
  assert.ok(pivoted.columns.includes("X") && pivoted.columns.includes("Y"), "pivot creates a column per series");
  assert.strictEqual(pivoted.rows.length, 2, "one row per distinct x");
  const cfg = viewChartConfig(pivotView, pivoted);
  assert.ok(cfg.yKeys?.includes("X") && cfg.yKeys?.includes("Y"), "pivot config exposes series as yKeys");
  assert.strictEqual(cfg.seriesKey, undefined, "pivot config drops the raw series key (already widened)");

  // --- totality: awkward shapes never throw and degrade to raw ---
  const empty = result([], ["month", "revenue"]);
  assert.strictEqual(applyViewTransform(empty, cumulativeView).rows.length, 0, "empty rows pass through");

  const single = result([{ month: "2024-01-01", revenue: 100 }], ["month", "revenue"]);
  assert.deepStrictEqual(
    applyViewTransform(single, cumulativeView).rows.map((r) => r.revenue),
    [100],
    "single row cumulative = itself",
  );
  assert.deepStrictEqual(availableTransforms(single, single ? { schemaVersion: 1, type: "bar" } : null), [], "single-row (KPI) offers no transforms");

  const withNulls = result(
    [
      { month: "2024-01-01", revenue: null },
      { month: "2024-02-01", revenue: 50 },
    ],
    ["month", "revenue"],
  );
  assert.deepStrictEqual(
    applyViewTransform(withNulls, cumulativeView).rows.map((r) => r.revenue),
    [0, 50],
    "null measure contributes 0 to the running sum",
  );

  const nonNumeric = result(
    [
      { month: "2024-01-01", label: "high" },
      { month: "2024-02-01", label: "low" },
    ],
    ["month", "label"],
  );
  const nonNumericOut = toCumulative(nonNumeric, ["label"], "month");
  assert.strictEqual(Number(nonNumericOut.rows[1].label), 0, "non-numeric measure accumulates as 0, no throw");

  // Missing measure column ⇒ transform is a no-op passthrough.
  const badKey = applyViewTransform(
    monthly,
    view({
      chartConfig: { schemaVersion: 1, type: "line", xKey: "month", yKey: "revenue" },
      transform: { kind: "cumulative", measureKeys: ["does_not_exist"] },
    }),
  );
  assert.deepStrictEqual(badKey.rows, monthly.rows, "unknown measure ⇒ raw result unchanged");

  console.log("✓ All view-transform tests passed");
}

runTests();
