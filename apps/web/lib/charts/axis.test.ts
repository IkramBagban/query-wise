import { getColumnKind, validateAxisSemantics } from "./axis";
import assert from "assert";

function runTests() {
  console.log("Running axis tests...");

  // 1. Test getColumnKind
  const rows = [
    { id: 1, val: 100, date_str: "2024-01-01T00:00:00Z", cat: "A", empty: null, date_obj: new Date("2024-01-01") },
    { id: 2, val: 200, date_str: "2024-01-02", cat: "B", empty: null, date_obj: new Date("2024-01-02") },
  ];

  assert.strictEqual(getColumnKind(rows, "val"), "numeric");
  assert.strictEqual(getColumnKind(rows, "date_str"), "temporal");
  assert.strictEqual(getColumnKind(rows, "date_obj"), "temporal");
  assert.strictEqual(getColumnKind(rows, "cat"), "categorical");
  assert.strictEqual(getColumnKind(rows, "empty"), "categorical"); // falls back to categorical

  // 2. Test validateAxisSemantics
  // Table always valid
  assert.strictEqual(validateAxisSemantics("table", rows, {}), true);

  // Bar chart - xKey categorical, yKey numeric
  assert.strictEqual(validateAxisSemantics("bar", rows, { xKey: "cat", yKey: "val" }), true);
  assert.strictEqual(validateAxisSemantics("bar", rows, { xKey: "date_str", yKey: "val" }), true);
  // Bar chart - swapped (xKey numeric, yKey categorical) -> invalid
  assert.strictEqual(validateAxisSemantics("bar", rows, { xKey: "val", yKey: "cat" }), false);

  // Pie chart
  assert.strictEqual(validateAxisSemantics("pie", rows, { nameKey: "cat", valueKey: "val" }), true);
  assert.strictEqual(validateAxisSemantics("pie", rows, { nameKey: "val", valueKey: "cat" }), false);
  
  // Pie chart with high cardinality (>12 rows distinct)
  const manyRows = Array.from({ length: 15 }, (_, i) => ({ id: i, name: `name${i}`, val: 10 }));
  assert.strictEqual(validateAxisSemantics("pie", manyRows, { nameKey: "name", valueKey: "val" }), false);
  const lowCardRows = Array.from({ length: 15 }, (_, i) => ({ id: i, name: `same`, val: 10 }));
  assert.strictEqual(validateAxisSemantics("pie", lowCardRows, { nameKey: "name", valueKey: "val" }), true);

  // Scatter chart
  assert.strictEqual(validateAxisSemantics("scatter", rows, { xKey: "val", yKey: "val" }), true);
  assert.strictEqual(validateAxisSemantics("scatter", rows, { xKey: "date_str", yKey: "val" }), true);
  assert.strictEqual(validateAxisSemantics("scatter", rows, { xKey: "cat", yKey: "val" }), false); // scatter x must be numeric/temporal

  console.log("All tests passed!");
}

runTests();
