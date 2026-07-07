/**
 * Pure-logic unit tests for the SPEC-03 ingestion pipeline (no database required).
 * Run with: pnpm --filter @query-wise/worker exec tsx test/ingestion-logic.test.ts
 */
import assert from "node:assert/strict";
import type { MetadataColumn, MetadataEntity, MetadataRelationship } from "@query-wise/shared/types";
import { byImportance, nameSignal, kindSignal, scoreAndRankEntities } from "../src/importance";
import { quoteIdent, quoteQualified, entityKey } from "../src/introspection";
import {
  candidateTargetNames,
  convertDistinct,
  parseTopValues,
  resolveTargetPk,
  scannableColumns,
  serializeBound,
  singularize,
  typesCompatible,
} from "../src/ingestion-utils";

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

function col(name: string, overrides: Partial<MetadataColumn> = {}): MetadataColumn {
  return {
    name,
    ordinal: overrides.ordinal ?? 0,
    canonicalType: overrides.canonicalType ?? "string",
    nativeType: overrides.nativeType ?? "text",
    nullable: overrides.nullable ?? true,
    primaryKey: overrides.primaryKey ?? false,
    generated: overrides.generated ?? false,
  };
}

function entity(name: string, overrides: Partial<MetadataEntity> = {}): MetadataEntity {
  return {
    id: overrides.id ?? name,
    namespace: overrides.namespace ?? "public",
    name,
    kind: overrides.kind ?? "table",
    columns: overrides.columns ?? [col("id", { primaryKey: true, canonicalType: "integer", nativeType: "int8" })],
    estimatedRowCount: overrides.estimatedRowCount ?? 0,
    estimatedRowCountMeasuredAt: null,
    ...overrides,
  };
}

// ── §1 importance ──────────────────────────────────────────────────────────────────────────────
test("nameSignal boosts fact-like and penalizes ops tables", () => {
  assert.ok(nameSignal(entity("orders")) > 0.5);
  assert.ok(nameSignal(entity("migrations")) < 0.5);
  assert.equal(nameSignal(entity("customers")), 0.5); // neutral
});

test("nameSignal penalizes tiny sessions tables", () => {
  assert.ok(nameSignal(entity("sessions", { estimatedRowCount: 50 })) < 0.5);
  assert.ok(nameSignal(entity("sessions", { estimatedRowCount: 5_000_000 })) > 0.5);
});

test("kindSignal prefers tables over views over materialized views", () => {
  assert.ok(kindSignal(entity("t", { kind: "table" })) > kindSignal(entity("v", { kind: "view" })));
  assert.ok(kindSignal(entity("v", { kind: "view" })) > kindSignal(entity("m", { kind: "materialized-view" })));
});

test("scoreAndRankEntities ranks a central fact table above a tiny ops table", () => {
  const orders = entity("orders", { id: "orders", estimatedRowCount: 1_000_000, columns: [col("id", { primaryKey: true }), col("customer_id", { canonicalType: "integer" })] });
  const customers = entity("customers", { id: "customers", estimatedRowCount: 50_000 });
  const migrations = entity("migrations", { id: "migrations", estimatedRowCount: 12 });
  const rels: MetadataRelationship[] = [
    { id: "r1", fromEntityId: "orders", fromColumns: ["customer_id"], toEntityId: "customers", toColumns: ["id"] },
  ];
  const ranked = scoreAndRankEntities([migrations, customers, orders], rels);
  assert.equal(ranked[0].name, "orders");
  assert.equal(ranked[ranked.length - 1].name, "migrations");
  for (const e of ranked) assert.ok(typeof e.importanceScore === "number" && e.importanceScore >= 0 && e.importanceScore <= 1);
});

test("byImportance is stable and descending", () => {
  const a = entity("a", { id: "a" });
  const b = entity("b", { id: "b" });
  a.importanceScore = 0.5;
  b.importanceScore = 0.5;
  assert.deepEqual(byImportance([b, a]).map((e) => e.id), ["a", "b"]);
});

// ── introspection quoting ────────────────────────────────────────────────────────────────────────
test("quoteIdent escapes embedded double quotes", () => {
  assert.equal(quoteIdent("weird\"name"), '"weird""name"');
  assert.equal(quoteQualified("public", "orders"), '"public"."orders"');
  assert.equal(entityKey("public", "orders"), "public.orders");
});

// ── §5 join inference helpers ─────────────────────────────────────────────────────────────────────
test("candidateTargetNames covers plural forms", () => {
  const names = candidateTargetNames("customer");
  assert.ok(names.has("customer"));
  assert.ok(names.has("customers"));
  const cat = candidateTargetNames("category");
  assert.ok(cat.has("categories"));
});

test("singularize handles common plural endings", () => {
  assert.equal(singularize("customers"), "customer");
  assert.equal(singularize("categories"), "category");
  assert.equal(singularize("boxes"), "box");
});

test("typesCompatible allows numeric family and exact matches, rejects mismatches", () => {
  assert.equal(typesCompatible("integer", "integer"), true);
  assert.equal(typesCompatible("integer", "decimal"), true);
  assert.equal(typesCompatible("uuid", "uuid"), true);
  assert.equal(typesCompatible("uuid", "integer"), false);
  assert.equal(typesCompatible("string", "integer"), false);
});

test("resolveTargetPk prefers a PK named id then falls back to a single PK", () => {
  const withId = entity("customers", { columns: [col("id", { primaryKey: true }), col("code", { primaryKey: true })] });
  assert.equal(resolveTargetPk(withId)?.name, "id");
  const single = entity("t", { columns: [col("uid", { primaryKey: true }), col("x")] });
  assert.equal(resolveTargetPk(single)?.name, "uid");
  const composite = entity("t2", { columns: [col("a", { primaryKey: true }), col("b", { primaryKey: true })] });
  assert.equal(resolveTargetPk(composite), undefined);
});

// ── §3 profiling helpers ──────────────────────────────────────────────────────────────────────────
test("convertDistinct handles positive counts and negative fractions", () => {
  assert.equal(convertDistinct(42, 1000), 42);
  assert.equal(convertDistinct(-0.5, 1000), 500); // fraction of rowcount
  assert.equal(convertDistinct(-0.5, null), undefined); // cannot convert without rowcount
  assert.equal(convertDistinct(null, 1000), undefined);
});

test("serializeBound normalizes dates, numerics, and bigints", () => {
  assert.equal(serializeBound(new Date("2024-01-02T03:04:05.000Z")), "2024-01-02T03:04:05.000Z");
  assert.equal(serializeBound(42), 42);
  assert.equal(serializeBound("123.45"), 123.45);
  assert.equal(serializeBound("2024-01-01"), "2024-01-01"); // date-only string kept as string
  assert.equal(serializeBound("9007199254740993"), "9007199254740993"); // unsafe int kept as string
  assert.equal(serializeBound(null), undefined);
});

test("parseTopValues pairs values with frequency-derived counts", () => {
  const parsed = parseTopValues(["a", "b"], [0.5, 0.25], 1000);
  assert.deepEqual(parsed, [{ value: "a", count: 500 }, { value: "b", count: 250 }]);
  assert.deepEqual(parseTopValues(["a"], [0.5], null), [{ value: "a" }]); // no rowcount → no count
  assert.equal(parseTopValues([], [], 100), undefined);
});

test("scannableColumns selects dates first, excludes keys/ids, caps at 8", () => {
  const columns: MetadataColumn[] = [
    col("id", { primaryKey: true, canonicalType: "integer", ordinal: 0 }),
    col("user_id", { canonicalType: "integer", ordinal: 1 }),
    col("amount", { canonicalType: "decimal", ordinal: 2 }),
    col("created_at", { canonicalType: "datetime", ordinal: 3 }),
    col("name", { canonicalType: "string", ordinal: 4 }),
  ];
  const picked = scannableColumns(entity("orders", { columns })).map((c) => c.name);
  assert.deepEqual(picked, ["created_at", "amount"]); // date first, id/user_id/name excluded
});

console.log(`\n${passed} tests passed`);
