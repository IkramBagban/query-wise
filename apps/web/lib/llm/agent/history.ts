import type { ChatMessage } from "@/types";
import type { AgentMemoryContext } from "./types";
import { estimateTokens } from "./tokens";

/**
 * Token-aware conversation history assembly (SPEC-01 §3, SPEC-02 §4), hardened
 * for long conversations in SPEC-10 §2.6.
 *
 * Extracted from `index.ts` as a pure module so the over-budget trimming logic is
 * unit-testable in isolation (the host module imports `server-only`). Trimming is
 * reported through an injected `onTrim` callback rather than importing `devLog`
 * directly, keeping this module dependency-light.
 */

export interface AgentMessage {
  role: "user" | "assistant";
  content: string;
}

/** Number of trailing messages (~2 turns) kept verbatim in history by default. */
export const HISTORY_VERBATIM_MESSAGES = 4;
/**
 * The last turn is never trimmed away: even under extreme budget pressure the
 * model keeps the immediately preceding user+assistant exchange (SPEC-10 §2.6).
 */
export const HISTORY_MIN_TAIL = 2;

/** Counts of what buildMessages dropped to fit budget; all zero/false when nothing trimmed. */
export interface HistoryTrimReport {
  tailDropped: number;
  blockSummariesDropped: number;
  rollingSummaryDropped: boolean;
}

function renderHistoryMessage(message: ChatMessage): AgentMessage {
  return {
    role: message.role,
    content:
      message.role === "assistant" && message.sql
        ? `${message.content}\n\n[SQL used: ${message.sql}]`
        : message.content,
  };
}

interface MemoryOverrides {
  /** Overridden (possibly truncated) block summaries; defaults to memory.blockSummaries. */
  blockSummaries?: string[];
  /** When false, the rolling summary is omitted (last-resort trim). */
  includeRollingSummary?: boolean;
}

/**
 * Render distilled conversation memory (SPEC-02 §4) as a single compact context
 * message: rolling summary, established filters / window, and recent block
 * headlines. `overrides` lets the budget logic drop the rolling summary or
 * truncate block summaries without mutating the source memory. Returns null when
 * there is nothing worth injecting.
 */
export function renderMemoryPreamble(
  memory: AgentMemoryContext | undefined,
  overrides: MemoryOverrides = {},
): string | null {
  if (!memory) return null;
  const includeRollingSummary = overrides.includeRollingSummary ?? true;
  const blockSummaries = overrides.blockSummaries ?? memory.blockSummaries ?? [];
  const parts: string[] = [];
  if (includeRollingSummary && memory.rollingSummary?.trim()) {
    parts.push(`Earlier in this conversation: ${memory.rollingSummary.trim()}`);
  }
  if (memory.entities?.length) parts.push(`Entities discussed: ${memory.entities.join(", ")}`);
  if (memory.timeWindow?.trim()) parts.push(`Established time window: ${memory.timeWindow.trim()}`);
  if (memory.activeFilters?.length) parts.push(`Active filters: ${memory.activeFilters.join("; ")}`);
  if (blockSummaries.length) parts.push(`Recent results:\n${blockSummaries.join("\n")}`);
  if (parts.length === 0) return null;
  return [
    "CONVERSATION MEMORY (for resolving follow-ups like \"break that down\" or \"same period\"; reuse these unless the user changes them):",
    ...parts,
  ].join("\n");
}

function sumTokens(messages: AgentMessage[]): number {
  return messages.reduce((sum, message) => sum + estimateTokens(message.content), 0);
}

/**
 * Token-aware history selection (SPEC-01 §3): keep the last ~2 turns verbatim,
 * then add older messages newest-first until the history token budget is spent.
 *
 * SPEC-10 §2.6 defect fix: when `tail + memory preamble` alone already exceed the
 * budget, the preamble was previously prepended anyway — silently blowing the
 * budget. Now we shed load in a deliberate order until it fits: (1) drop oldest
 * verbatim tail messages down to the last turn (HISTORY_MIN_TAIL), (2) truncate
 * the preamble's block summaries oldest-first, (3) drop the rolling summary as a
 * last resort. The final user question is ALWAYS appended and never trimmed.
 * Anything dropped is reported via `onTrim` so long-conversation truncation is
 * never silent.
 */
export function buildMessages(
  history: ChatMessage[],
  question: string,
  historyBudgetTokens: number,
  maxMessages?: number,
  memory?: AgentMemoryContext,
  onTrim?: (report: HistoryTrimReport) => void,
): AgentMessage[] {
  const rendered = history.map(renderHistoryMessage);
  const verbatimCount = Math.min(rendered.length, HISTORY_VERBATIM_MESSAGES);
  let tail = rendered.slice(rendered.length - verbatimCount);
  const older = rendered.slice(0, rendered.length - verbatimCount);

  const report: HistoryTrimReport = { tailDropped: 0, blockSummariesDropped: 0, rollingSummaryDropped: false };
  let blockSummaries = memory?.blockSummaries ? [...memory.blockSummaries] : [];
  let includeRollingSummary = true;

  const preambleTokens = (): number => {
    const rendered = renderMemoryPreamble(memory, { blockSummaries, includeRollingSummary });
    return rendered ? estimateTokens(rendered) : 0;
  };
  const overBudget = (): boolean => sumTokens(tail) + preambleTokens() > historyBudgetTokens;

  // (1) Shed oldest verbatim tail messages down to the last turn.
  while (overBudget() && tail.length > HISTORY_MIN_TAIL) {
    tail = tail.slice(1);
    report.tailDropped += 1;
  }
  // (2) Truncate block summaries oldest-first.
  while (overBudget() && blockSummaries.length > 0) {
    blockSummaries = blockSummaries.slice(1);
    report.blockSummariesDropped += 1;
  }
  // (3) Drop the rolling summary as a last resort.
  if (overBudget() && includeRollingSummary && memory?.rollingSummary?.trim()) {
    includeRollingSummary = false;
    report.rollingSummaryDropped = true;
  }

  const memoryPreamble = renderMemoryPreamble(memory, { blockSummaries, includeRollingSummary });

  // Fill in older messages newest-first with whatever budget remains.
  let usedTokens = sumTokens(tail) + (memoryPreamble ? estimateTokens(memoryPreamble) : 0);
  const kept: AgentMessage[] = [];
  for (let index = older.length - 1; index >= 0; index -= 1) {
    if (maxMessages !== undefined && kept.length + tail.length >= maxMessages) break;
    const cost = estimateTokens(older[index].content);
    if (usedTokens + cost > historyBudgetTokens) break;
    kept.unshift(older[index]);
    usedTokens += cost;
  }

  let messages = [...kept, ...tail];
  if (maxMessages !== undefined && messages.length > maxMessages) {
    messages = messages.slice(messages.length - maxMessages);
  }

  // Memory rides in front of the retained history so follow-up resolution has it
  // regardless of how much verbatim history fit the budget.
  if (memoryPreamble) {
    messages = [{ role: "user", content: memoryPreamble }, ...messages];
  }

  const last = messages[messages.length - 1];
  if (!last || last.role !== "user" || last.content.trim() !== question.trim()) {
    messages.push({ role: "user", content: question });
  }

  if (report.tailDropped > 0 || report.blockSummariesDropped > 0 || report.rollingSummaryDropped) {
    onTrim?.(report);
  }
  return messages;
}
