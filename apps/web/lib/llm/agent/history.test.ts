import assert from "assert";
import type { ChatMessage } from "@/types";
import { buildMessages, type HistoryTrimReport } from "./history";
import type { AgentMemoryContext } from "./types";

/**
 * SPEC-10 §2.6 tests. Long conversations must never drop the final user question,
 * and any budget-driven truncation must be reported (never silent).
 */

let idCounter = 0;
function msg(role: "user" | "assistant", content: string): ChatMessage {
  idCounter += 1;
  return { id: `m${idCounter}`, role, content, timestamp: idCounter };
}

const QUESTION = "break that down by region";

function runTests() {
  console.log("Running buildMessages tests...");

  // ── Normal case: within budget → nothing trimmed, question is last ──────────
  const history = [msg("user", "show revenue"), msg("assistant", "here it is")];
  let trimmed: HistoryTrimReport | null = null;
  const normal = buildMessages(history, QUESTION, 10_000, undefined, undefined, (r) => (trimmed = r));
  assert.strictEqual(trimmed, null, "no trim callback when within budget");
  assert.strictEqual(normal[normal.length - 1].content, QUESTION, "question is the last message");

  // ── Question is NEVER dropped, even at a zero budget ────────────────────────
  const zero = buildMessages(history, QUESTION, 0, undefined, undefined);
  assert.strictEqual(zero[zero.length - 1].content, QUESTION, "question survives a zero budget");

  // ── Over-budget preamble: shed tail → block summaries → rolling summary ──────
  const bigTurns = [
    msg("user", "q1 ".repeat(80)),
    msg("assistant", "a1 ".repeat(80)),
    msg("user", "q2 ".repeat(80)),
    msg("assistant", "a2 ".repeat(80)),
  ];
  const memory: AgentMemoryContext = {
    rollingSummary: "ROLLINGSUMMARYTOKEN " + "ctx ".repeat(400),
    blockSummaries: [
      "BLOCKSUMMARYTOKEN turn 1 " + "x ".repeat(200),
      "BLOCKSUMMARYTOKEN turn 2 " + "y ".repeat(200),
      "BLOCKSUMMARYTOKEN turn 3 " + "z ".repeat(200),
    ],
    entities: ["orders"],
  };
  let report: HistoryTrimReport | null = null;
  const tight = buildMessages(bigTurns, QUESTION, 60, undefined, memory, (r) => (report = r));

  assert.ok(report, "onTrim fired when over budget");
  const trimReport = report as unknown as HistoryTrimReport;
  assert.ok(trimReport.tailDropped > 0, "oldest verbatim tail messages were dropped");
  assert.ok(trimReport.blockSummariesDropped > 0, "block summaries were truncated");
  assert.strictEqual(trimReport.rollingSummaryDropped, true, "rolling summary dropped as last resort");

  // The final question is intact.
  assert.strictEqual(tight[tight.length - 1].content, QUESTION, "question intact under heavy trim");
  // The preamble that remains no longer carries the rolling summary or block summaries.
  const preamble = tight.find((m) => m.content.includes("CONVERSATION MEMORY"));
  assert.ok(preamble, "a memory preamble still rides in front (entities survive)");
  assert.ok(!preamble!.content.includes("ROLLINGSUMMARYTOKEN"), "rolling summary text is gone");
  assert.ok(!preamble!.content.includes("BLOCKSUMMARYTOKEN"), "block summary text is gone");
  assert.ok(preamble!.content.includes("orders"), "cheap entities line is retained");

  // Minimum tail invariant: never fewer than the last turn (2 messages) survive
  // aside from the appended question, as long as history had at least that many.
  const verbatim = tight.filter((m) => m.content !== QUESTION && !m.content.includes("CONVERSATION MEMORY"));
  assert.ok(verbatim.length >= 2, "at least the last turn is kept verbatim");

  console.log("✓ All buildMessages tests passed");
}

runTests();
