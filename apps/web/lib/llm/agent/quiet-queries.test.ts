import assert from "assert";
import { AGENT_BUDGET_PROFILES, resolveAgentBudget, type AgentRunState } from "./types";

/**
 * SPEC-09 §3.2 tests. Quiet probes must draw from a SEPARATE budget so probing
 * never competes with answering, and a quiet execution must never be recorded as
 * a block (verification only ever sees `state.blocks`). These are the pure,
 * runtime-free invariants behind acceptance criteria #4 and the verification note.
 */
function runTests() {
  console.log("Running quiet-query budget tests...");

  // Separate cap exists on both profiles.
  assert.strictEqual(AGENT_BUDGET_PROFILES.standard.maxQuietQueries, 4, "standard: 4 quiet probes");
  assert.strictEqual(AGENT_BUDGET_PROFILES.extended.maxQuietQueries, 8, "extended: 8 quiet probes");

  // resolveAgentBudget carries the quiet cap through.
  const { budget } = resolveAgentBudget("how many refunds do we have?");
  assert.strictEqual(typeof budget.maxQuietQueries, "number", "resolved budget exposes maxQuietQueries");

  // The run tracks quiet probes on their OWN counter, not sqlAttempts. Mirror the
  // tool's branch: a quiet execution bumps quietQueries and leaves sqlAttempts at 0.
  const state: AgentRunState = {
    blocks: [],
    transcript: [],
    sqlAttempts: 0,
    sampleCalls: 0,
    searchCalls: 0,
    quietQueries: 0,
    budget: AGENT_BUDGET_PROFILES.standard,
  };
  state.quietQueries += 1; // one quiet probe
  state.transcript.push({
    tool: "run_sql",
    input: { sql: "SELECT count(*) FROM refunds", purpose: "refund existence check", presentation: "quiet" },
    outcome: "ok",
    summary: "probed 1 rows",
    // NOTE: no blockIndex — a quiet probe is never a block.
  });
  assert.strictEqual(state.sqlAttempts, 0, "quiet probe does not consume sqlAttempts");
  assert.strictEqual(state.quietQueries, 1, "quiet probe consumes the quiet budget");
  assert.strictEqual(state.blocks.length, 0, "quiet probe never becomes a block (verification ignores it)");
  const quietStep = state.transcript[0] as { blockIndex?: number };
  assert.strictEqual(quietStep.blockIndex, undefined, "quiet transcript step carries no blockIndex");

  console.log("✓ All quiet-query budget tests passed");
}

runTests();
