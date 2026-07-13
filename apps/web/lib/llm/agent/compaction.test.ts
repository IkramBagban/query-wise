import assert from "assert";
import type { ModelMessage } from "ai";
import { compactToolResults, digestRunSqlOutput } from "./compaction";
import { AGENT_BUDGET_PROFILES, type AgentResultBlock, type AgentRunState } from "./types";

/**
 * SPEC-10 §2.2–§2.4 tests. The digest must never hide extremes (the incident
 * regression), and compaction must be a no-op until the context is actually large.
 */

/** The §0 incident fixture rows: Nov/Dec 2025 spike to ~2.7M, Jan 2026 dip. */
const INCIDENT_ROWS: Record<string, unknown>[] = [
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

const INCIDENT_STATS = [
  {
    column: "total_revenue",
    kind: "numeric" as const,
    min: 807277.43,
    max: 2729077.09,
    mean: 1306466.79,
    minRow: INCIDENT_ROWS[8],
    maxRow: INCIDENT_ROWS[6],
  },
];

function blockOutput(blockIndex: number, rows: Record<string, unknown>[]) {
  return {
    type: "json" as const,
    value: {
      blockIndex,
      columns: ["month", "total_revenue"],
      rows,
      rowCount: rows.length,
      totalRowCount: rows.length,
      truncated: false,
      executionTimeMs: 3,
      columnStats: INCIDENT_STATS,
    },
  };
}

function emptyState(): AgentRunState {
  return {
    blocks: [] as AgentResultBlock[],
    transcript: [],
    sqlAttempts: 0,
    sampleCalls: 0,
    searchCalls: 0,
    quietQueries: 0,
    budget: AGENT_BUDGET_PROFILES.standard,
  };
}

function toolMessage(output: unknown): ModelMessage {
  return {
    role: "tool",
    content: [{ type: "tool-result", toolCallId: "c", toolName: "run_sql", output }],
  } as unknown as ModelMessage;
}

const estimate = (text: string): number => Math.ceil((text.length / 4) * 1.1);

function runTests() {
  console.log("Running compaction tests...");

  // ── §2.2 digest: the incident spike survives summarization ──────────────────
  const state = emptyState();
  state.blocks.push({ index: 1, purpose: "Monthly revenue", sql: "SELECT ...", result: {} as never, chartHint: null, chartConfig: null });
  const digested = digestRunSqlOutput(blockOutput(1, INCIDENT_ROWS), state);
  assert.ok(digested, "digest produced for a block result");
  const dv = digested!.value as Record<string, unknown>;
  // Lossy 3-row sample is gone; both ends are kept.
  assert.strictEqual((dv.firstRows as unknown[]).length, 2, "digest keeps first 2 rows");
  assert.strictEqual((dv.lastRows as unknown[]).length, 2, "digest keeps last 2 rows");
  assert.strictEqual((dv as { sampleRows?: unknown }).sampleRows, undefined, "no lossy sampleRows field");
  // The spike is NOT in first/last rows — it only survives via columnStats.
  const stats = dv.columnStats as typeof INCIDENT_STATS;
  assert.strictEqual(stats[0].max, 2729077.09, "digest carries the spike in columnStats.max");
  assert.strictEqual((stats[0].maxRow as { month: string }).month, "2025-11", "digest columnStats names Nov 2025");
  assert.strictEqual(dv.purpose, "Monthly revenue", "digest names the block purpose");

  // Errors and non-run_sql outputs are left verbatim.
  assert.strictEqual(digestRunSqlOutput({ type: "json", value: { error: "boom" } }, state), null, "errors not digested");
  assert.strictEqual(digestRunSqlOutput({ type: "json", value: { columns: [] } }, state), null, "non-block/quiet not digested");

  // ── §2.3 under-threshold → compact NOTHING (identity) ───────────────────────
  const messages = [
    toolMessage(blockOutput(0, INCIDENT_ROWS)),
    toolMessage(blockOutput(1, INCIDENT_ROWS)),
    toolMessage(blockOutput(2, INCIDENT_ROWS)),
  ];
  const under = compactToolResults(messages, state, { estimatedTokens: 100, targetTokens: 100_000, estimate });
  assert.strictEqual(under, messages, "under-threshold returns the SAME array (no digesting)");

  // ── §2.3 over-threshold → digest oldest-first, keep the most recent two ──────
  const over = compactToolResults(messages, state, { estimatedTokens: 100_000, targetTokens: 1000, estimate });
  const isDigest = (m: ModelMessage): boolean => {
    const part = (m.content as Array<{ output?: { value?: Record<string, unknown> } }>)[0];
    return part.output?.value?.firstRows !== undefined;
  };
  assert.ok(isDigest(over[0]), "oldest result is digested");
  assert.ok(!isDigest(over[1]), "second-oldest kept verbatim (within last-2 window)");
  assert.ok(!isDigest(over[2]), "most recent kept verbatim");
  assert.strictEqual(over[1], messages[1], "verbatim messages are untouched references");
  assert.strictEqual(over[2], messages[2], "verbatim messages are untouched references");

  // ── §2.3 early stop: quit as soon as the estimate drops under the threshold ──
  const four = [
    toolMessage(blockOutput(0, INCIDENT_ROWS)),
    toolMessage(blockOutput(1, INCIDENT_ROWS)),
    toolMessage(blockOutput(2, INCIDENT_ROWS)),
    toolMessage(blockOutput(3, INCIDENT_ROWS)),
  ];
  // Just over threshold; digesting the single oldest result saves enough to stop.
  const early = compactToolResults(four, state, { estimatedTokens: 520, targetTokens: 1000, estimate });
  assert.ok(isDigest(early[0]), "oldest digested");
  assert.ok(!isDigest(early[1]), "second candidate skipped once under threshold");
  assert.strictEqual(early[2], four[2], "last-2 verbatim");
  assert.strictEqual(early[3], four[3], "last-2 verbatim");

  // ── §2.4 a 2-step correction run (small) never digests (under-threshold path) ─
  const correctionLike = compactToolResults(messages, state, { estimatedTokens: 200, targetTokens: 100_000, estimate });
  assert.strictEqual(correctionLike, messages, "small correction context is left untouched");

  console.log("✓ All compaction tests passed");
}

runTests();
