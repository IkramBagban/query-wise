import { z } from "zod";
import { devLog, devLogError } from "@query-wise/shared/observability";
import { generateStructuredObject } from "../structured";
import type { Provider } from "../client";
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

/** Compact per-block evidence for the verifier: purpose, SQL, columns, first 5 rows. */
function renderBlockEvidence(block: AgentResultBlock): string {
  const columns = block.result.columns.map((column) => column.name).join(", ");
  const rows = JSON.stringify(block.result.rows.slice(0, 5));
  return [
    `Block ${block.index} — ${block.purpose}`,
    `SQL: ${block.sql}`,
    `columns: ${columns}`,
    `rowCount: ${block.result.returnedRowCount}${block.result.truncated ? " (truncated)" : ""}`,
    `first rows: ${rows}`,
  ].join("\n");
}

function buildVerificationPrompt(question: string, blocks: AgentResultBlock[], answer: string, fanoutHint: number[]): string {
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

const VERIFIER_SYSTEM = [
  "You verify a data analyst's drafted answer against the query results it is based on.",
  "Check: does the answer address every part of the question? Do the stated numbers match the data?",
  "Is the time window correct? Could any SUM/AVG over a join be double-counting (fan-out)?",
  "Be strict but do not invent problems. Return ok=true with an empty issues array when the answer is sound.",
  "Only report concrete, actionable issues.",
].join("\n");

function caveatFor(issues: VerificationResult["issues"]): string {
  const details = issues.map((issue) => issue.detail.trim().replace(/\.$/, "")).filter(Boolean);
  if (details.length === 0) return "";
  return `\n\nNote: ${details.join("; ")}.`;
}

function correctionMessageFor(issues: VerificationResult["issues"]): string {
  const lines = issues.map((issue) => `- (block ${issue.blockIndex}, ${issue.kind}) ${issue.detail}`);
  return [
    "Verification found potential problems with the answer:",
    ...lines,
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
      const corrected = await params.runCorrection(correctionMessageFor(initial.issues), 2);
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
      // Correction ran but issues remain — carry a caveat on the corrected answer.
      state.transcript.push({
        tool: "verify",
        input: { corrected: true },
        outcome: "error",
        summary: `residual issues: ${recheck.issues.map((issue) => issue.kind).join(", ")}`,
      });
      return answer + caveatFor(recheck.issues);
    } catch (error) {
      devLogError("agent.verify.correction-failed", "Verification correction pass failed; appending caveat.", error, {});
    }
  }

  // No budget (or correction threw): append a caveat rather than block the run.
  state.transcript.push({
    tool: "verify",
    input: { corrected: false },
    outcome: "error",
    summary: `unresolved: ${initial.issues.map((issue) => issue.kind).join(", ")}`,
  });
  return params.answer + caveatFor(initial.issues);
}
