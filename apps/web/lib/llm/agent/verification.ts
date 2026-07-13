import { z } from "zod";
import { devLog, devLogError } from "@query-wise/shared/observability";
import { generateStructuredObject } from "../structured";
import type { Provider } from "../client";
import { computeColumnStats, renderColumnStatsLine } from "./column-stats";
import { MODEL_ROW_SLICE } from "./types";
import type { AgentResultBlock, AgentRunState, AnalystAgentEmitters } from "./types";

/**
 * Self-verification pass (SPEC-02 §3). After the loop drafts an answer, a single
 * cheap structured LLM call checks it against the actual block data. Real issues
 * trigger one bounded correction run; if that is unavailable or still fails, a
 * caveat is appended rather than blocking the run. Gated by
 * QUERYWISE_AGENT_VERIFICATION (default on) and skipped for trivial questions.
 */

const ISSUE_KINDS = ["wrong_time_window", "fanout_suspected", "question_not_answered", "number_mismatch"] as const;

const verificationSchema = z.object({
  ok: z.boolean().describe("true if the answer correctly and completely addresses the question given the data"),
  issues: z
    .array(
      z.object({
        blockIndex: z.number().int().describe("index of the block the issue concerns, or -1 if answer-level"),
        kind: z.enum(ISSUE_KINDS),
        detail: z.string().describe("one concise sentence describing the problem"),
      }),
    )
    .describe("empty when ok is true"),
});

type VerificationResult = z.infer<typeof verificationSchema>;

/** QUERYWISE_AGENT_VERIFICATION defaults to true; only an explicit "false" disables it. */
function verificationEnabled(): boolean {
  return process.env.QUERYWISE_AGENT_VERIFICATION !== "false";
}

/** Skip verification where it cannot help: conversation turns and trivial KPI answers. */
function shouldSkip(mode: "query" | "conversation", blocks: AgentResultBlock[]): boolean {
  if (mode === "conversation") return true;
  if (blocks.length === 0) return true;
  if (blocks.length === 1 && blocks[0].result.returnedRowCount <= 1) return true;
  return false;
}

/**
 * Deterministic fan-out heuristic (SPEC-02 §3): a block that joins another table
 * AND aggregates with SUM/AVG can double-count rows on a 1:N join. Full static
 * grain analysis is out of scope — we surface the suspicion to the verifier.
 */
function fanoutSuspectBlocks(blocks: AgentResultBlock[]): number[] {
  return blocks
    .filter((block) => {
      const sql = block.sql.toLowerCase();
      const joinCount = (sql.match(/\bjoin\b/g) ?? []).length;
      const aggregates = /\b(sum|avg)\s*\(/.test(sql);
      return joinCount >= 1 && aggregates;
    })
    .map((block) => block.index);
}

/**
 * Compact per-block evidence for the verifier (SPEC-10 §2.5).
 *
 * WHY 50 rows + a stats line: the incident's recheck used `rows.slice(0, 5)` =
 * May–Sep (all ~$1M), so "revenue is consistent around $1M" PASSED — the Nov/Dec
 * spike lived at rows 7–8, outside the window. The verifier must never see less
 * than the claim it checks. We now show the full 50-row model slice AND a stats
 * line computed over ALL rows, so any claim about consistency/trend/spikes/ranges
 * can be checked against min/max/mean, not just the visible rows.
 */
function renderBlockEvidence(block: AgentResultBlock): string {
  const columns = block.result.columns.map((column) => column.name).join(", ");
  const rows = JSON.stringify(block.result.rows.slice(0, MODEL_ROW_SLICE));
  const statsLine = renderColumnStatsLine(computeColumnStats(block.result));
  return [
    `Block ${block.index} — ${block.purpose}`,
    `SQL: ${block.sql}`,
    `columns: ${columns}`,
    `rowCount: ${block.result.returnedRowCount}${block.result.truncated ? " (truncated)" : ""}`,
    ...(statsLine ? [`stats (over ALL rows): ${statsLine}`] : []),
    `first rows: ${rows}`,
  ].join("\n");
}

export function buildVerificationPrompt(question: string, blocks: AgentResultBlock[], answer: string, fanoutHint: number[]): string {
  const evidence = blocks.map(renderBlockEvidence).join("\n\n");
  const hint =
    fanoutHint.length > 0
      ? `\n\nATTENTION: block(s) ${fanoutHint.join(", ")} join a table and aggregate with SUM/AVG — check for fan-out (double counting on a 1:N join) before trusting their totals.`
      : "";
  return [
    `User question:\n${question}`,
    ``,
    `Query results:\n${evidence}`,
    ``,
    `Drafted answer:\n${answer}`,
    hint,
  ].join("\n");
}

export const VERIFIER_SYSTEM = [
  "You verify a data analyst's drafted answer against the query results it is based on.",
  "Check: does the answer address every part of the question? Do the stated numbers match the data?",
  "Is the time window correct? Could any SUM/AVG over a join be double-counting (fan-out)?",
  "The stats line is computed over the full result — any claim about consistency, trend, spikes, or ranges MUST be checked against min/max/mean, not only the visible rows.",
  "Check that the answer covers every block (the analyst chooses the order by importance, so order is not itself an issue), and that ambiguous terms (e.g. 'top selling') state their interpretation (by units vs by revenue).",
  "When the answer names WHEN an extreme or trend occurred (a month, week, or period), check the named period against the labels in the stats line and the rows. Right magnitude with the wrong period label is a number_mismatch.",
  "question_not_answered includes soft asks: if the user asked to 'know more' about something and the answer neither goes deeper nor explicitly offers to, flag it.",
  "Flag as number_mismatch any two readings that contradict each other about the same period (e.g. 'stable' weekly vs a described surge in the same months).",
  "Be strict but do not invent problems. Return ok=true with an empty issues array when the answer is sound.",
  "Only report concrete, actionable issues.",
].join("\n");

/**
 * Build the correction message (SPEC-02 §3, hardened in SPEC-10 §2.4).
 *
 * WHY inline evidence: in the incident the correction pass digested away the very
 * rows it had to re-read. The correction turn no longer compacts (see index.ts),
 * but we ALSO inline the flagged blocks' full model-slice rows + stats line here,
 * so even a model that skips re-querying sees the real numbers (including the
 * spike) while fixing the answer.
 */
function correctionMessageFor(issues: VerificationResult["issues"], blocks: AgentResultBlock[]): string {
  const lines = issues.map((issue) => `- (block ${issue.blockIndex}, ${issue.kind}) ${issue.detail}`);
  const flagged = [...new Set(issues.map((issue) => issue.blockIndex))]
    .map((index) => blocks.find((block) => block.index === index))
    .filter((block): block is AgentResultBlock => Boolean(block));
  const evidence = flagged.map(renderBlockEvidence).join("\n\n");
  return [
    "Verification found potential problems with the answer:",
    ...lines,
    ...(evidence
      ? ["", "Relevant data (stats span ALL rows — trust them over eyeballing):", evidence]
      : []),
    "",
    "Fix the query or the answer. Re-run SQL if needed, then rewrite the final answer. Do not repeat these instructions.",
  ].join("\n");
}

export async function runSelfVerification(params: {
  question: string;
  mode: "query" | "conversation";
  answer: string;
  state: AgentRunState;
  provider: Provider;
  model: string;
  apiKeys: string[];
  abortSignal?: AbortSignal;
  emitters: AnalystAgentEmitters;
  /** Runs a bounded correction turn and returns the corrected answer text. */
  runCorrection: (message: string, maxSteps: number) => Promise<string>;
}): Promise<string> {
  const { state, emitters } = params;
  if (!verificationEnabled() || shouldSkip(params.mode, state.blocks)) return params.answer;

  emitters.onActivity?.({ kind: "thinking", tool: "verify", label: "Verifying results" });

  const verify = async (answer: string): Promise<VerificationResult | null> => {
    const fanoutHint = fanoutSuspectBlocks(state.blocks);
    try {
      return await generateStructuredObject({
        provider: params.provider,
        model: params.model,
        apiKeys: params.apiKeys,
        task: "utility",
        schema: verificationSchema,
        schemaName: "answer_verification",
        system: VERIFIER_SYSTEM,
        prompt: buildVerificationPrompt(params.question, state.blocks, answer, fanoutHint),
        maxOutputTokens: 600,
        temperature: 0,
        abortSignal: params.abortSignal,
      });
    } catch (error) {
      // Verification is best-effort telemetry-grade — never fail the run over it.
      devLogError("agent.verify.failed", "Self-verification call failed; leaving answer as drafted.", error, {});
      return null;
    }
  };

  const initial = await verify(params.answer);
  if (!initial || initial.ok || initial.issues.length === 0) {
    state.transcript.push({
      tool: "verify",
      input: { blocks: state.blocks.length },
      outcome: "ok",
      summary: initial ? "verified: no issues" : "verification unavailable",
    });
    return params.answer;
  }

  devLog("info", "agent.verify.issues", "Verification found issues.", {
    issues: initial.issues.map((issue) => issue.kind),
  });

  // Correction path (SPEC-02 §3): retry only when the loop still has SQL budget.
  const hasBudget = state.sqlAttempts < state.budget.maxSqlAttempts;
  if (hasBudget) {
    try {
      // SPEC-11 §C: the correction rewrites the answer, so the draft's positioned
      // narration steps are stale. Drop them (in place, preserving the transcript
      // reference) before the correction run appends its fresh narration — otherwise
      // the reloaded timeline would render both the draft and the corrected prose.
      const withoutNarration = state.transcript.filter((step) => step.tool !== "narration");
      state.transcript.length = 0;
      state.transcript.push(...withoutNarration);
      const corrected = await params.runCorrection(correctionMessageFor(initial.issues, state.blocks), 2);
      const answer = corrected.trim() || params.answer;
      const recheck = await verify(answer);
      if (!recheck || recheck.ok || recheck.issues.length === 0) {
        state.transcript.push({
          tool: "verify",
          input: { corrected: true },
          outcome: "ok",
          summary: "verified after correction",
        });
        return answer;
      }
      // Correction ran but issues remain — record them in the transcript for
      // debugging, but do NOT staple raw verifier notes onto the user's answer.
      // The dev verifier model is noisy/hallucination-prone (e.g. flagging a value
      // that is present), so surfacing its notes verbatim hurts more than it helps.
      state.transcript.push({
        tool: "verify",
        input: { corrected: true },
        outcome: "error",
        summary: `residual issues: ${recheck.issues.map((issue) => issue.kind).join(", ")}`,
      });
      return answer;
    } catch (error) {
      devLogError("agent.verify.correction-failed", "Verification correction pass failed; appending caveat.", error, {});
    }
  }

  // No budget (or correction threw): record the issues in the transcript but leave
  // the user's answer clean (no raw verifier notes appended).
  state.transcript.push({
    tool: "verify",
    input: { corrected: false },
    outcome: "error",
    summary: `unresolved: ${initial.issues.map((issue) => issue.kind).join(", ")}`,
  });
  return params.answer;
}
