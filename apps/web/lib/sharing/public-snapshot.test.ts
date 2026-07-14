/**
 * SPEC-13 §1: snapshot-mode public serving. Proves each widget's persisted
 * `snapshot` is served verbatim as the result with NO error, and that the mapper
 * performs no query execution / credential access (it is a pure function of the
 * widget row). No real DB.
 */
import assert from "node:assert";
import type { DashboardWidget } from "@prisma/client";
import { snapshotPublicWidget, snapshotPublicWidgets } from "./public-snapshot";

function widget(over: Partial<DashboardWidget> = {}): DashboardWidget {
  const snapshot = {
    schemaVersion: 1,
    columns: [{ name: "n", type: "number" }],
    rows: [{ n: 42 }],
    truncated: false,
    rowCount: 1,
  };
  return {
    id: over.id ?? "widget_1",
    dashboardId: "dash_1",
    queryRunId: "run_1",
    title: over.title ?? "Revenue",
    chartConfig: { schemaVersion: 1, type: "bar", xKey: "n", yKey: "n" },
    layout: { schemaVersion: 1, x: 0, y: 0, w: 6, h: 4 },
    snapshot: over.snapshot ?? snapshot,
    queryDefinition: { kind: "sql", dialectId: "postgresql", text: "select 1" },
    connectionId: "conn_1",
    lastRefreshedAt: null,
    lastRefreshError: null,
    filterBinding: null,
    viewTransform: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as DashboardWidget;
}

async function runTests() {
  console.log("Running snapshot-serving tests...");

  // Single widget: result === persisted snapshot, error null, presentation preserved.
  {
    const w = widget();
    const result = snapshotPublicWidget(w);
    assert.strictEqual(result.id, "widget_1");
    assert.strictEqual(result.title, "Revenue");
    assert.strictEqual(result.error, null, "snapshot serving never errors");
    assert.deepStrictEqual(result.result, w.snapshot, "serves the persisted snapshot verbatim");
    // No connectionId / queryRunId leaks into the public DTO.
    assert.ok(!("connectionId" in result), "no connection leak");
    assert.ok(!("queryRunId" in result), "no query run leak");
  }

  // Batch preserves order and maps each snapshot independently.
  {
    const snapA = { schemaVersion: 1, columns: [], rows: [{ a: 1 }], truncated: false, rowCount: 1 };
    const snapB = { schemaVersion: 1, columns: [], rows: [{ b: 2 }], truncated: false, rowCount: 1 };
    const widgets = [
      widget({ id: "w_a", snapshot: snapA as unknown as DashboardWidget["snapshot"] }),
      widget({ id: "w_b", snapshot: snapB as unknown as DashboardWidget["snapshot"] }),
    ];
    const results = snapshotPublicWidgets(widgets);
    assert.strictEqual(results.length, 2);
    assert.strictEqual(results[0].id, "w_a");
    assert.deepStrictEqual(results[0].result, snapA);
    assert.strictEqual(results[1].id, "w_b");
    assert.deepStrictEqual(results[1].result, snapB);
  }

  console.log("✓ snapshot-serving tests passed");
}

void runTests();
