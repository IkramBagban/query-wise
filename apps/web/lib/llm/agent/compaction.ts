import type { JSONValue, ModelMessage } from "ai";
import type { AgentRunState } from "./types";

/**
 * Tool-result compaction (SPEC-01 §4, hardened in SPEC-10 §2.2–§2.4).
 *
 * WHY THIS MODULE EXISTS SEPARATELY: the 2026-07-12 incident shipped a
 * verified-wrong answer partly because an older run_sql result was digested down
 * to `sampleRows: rows.slice(0, 3)` — May/Jun/Jul, all ~$1M — so the model
 * correcting a claim about the Nov/Dec spike literally could not see Nov/Dec. And
 * it happened at <10% of the token budget, where digesting bought nothing. These
 * pure functions fix both: digests now carry full-result stats and BOTH ends of
 * the series, and compaction is skipped entirely until the context is actually
 * large. Pure + injected estimator so the host module (`index.ts`) stays out of
 * the unit tests.
 */

/** Fraction of `budget.target` under which compaction is pure loss and is skipped. */
export const COMPACTION_THRESHOLD_FRACTION = 0.5;
/** Most-recent run_sql results always kept verbatim (never digested). */
export const VERBATIM_RUN_SQL_RESULTS = 2;

interface RunSqlLocation {
  messageIndex: number;
  partIndex: number;
}

/**
 * Digest an older run_sql result (SPEC-10 §2.2). Replaces the old lossy
 * `sampleRows: rows.slice(0, 3)` with:
 *  - `columnStats` carried through from the tool result (full-result min/max/mean),
 *  - `firstRows` AND `lastRows` (a time-series digest must show BOTH ends).
 * The incident's revenue digest now reads min 807,277 (Jan) → max 2,729,077 (Nov),
 * so the spike survives summarization by construction. Errors and non-run_sql
 * outputs are already small and left verbatim (returns null).
 */
export function digestRunSqlOutput(
  output: unknown,
  state: AgentRunState,
): { type: "json"; value: JSONValue } | null {
  if (!output || typeof output !== "object") return null;
  const wrapped = output as { type?: string; value?: unknown };
  if (wrapped.type !== "json" || !wrapped.value || typeof wrapped.value !== "object") return null;
  const value = wrapped.value as Record<string, unknown>;
  // SPEC-09 §3.3: both block and quiet results are digest-eligible; quiet carries
  // `quiet: true` and no blockIndex. Errors are already small — leave verbatim.
  const isBlock = typeof value.blockIndex === "number";
  const isQuiet = value.quiet === true;
  if (value.error !== undefined || (!isBlock && !isQuiet)) return null;

  const block = isBlock ? state.blocks.find((candidate) => candidate.index === value.blockIndex) : undefined;
  const rows = Array.isArray(value.rows) ? value.rows : [];
  const digest = {
    ...(isBlock ? { blockIndex: value.blockIndex, purpose: block?.purpose } : { quiet: true }),
    columns: value.columns,
    rowCount: value.rowCount,
    totalRowCount: value.totalRowCount,
    truncated: value.truncated,
    // SPEC-10 §2.1/§2.2: stats over the FULL result — the ground truth for any
    // claim about consistency, trend, spikes, or ranges. Carried through, not
    // recomputed, so the digest never disagrees with the original tool result.
    columnStats: value.columnStats,
    // Both ends: a time series that hides its last rows is how the Nov/Dec spike
    // got lost. Keeping first + last two lets the model see the shape's endpoints.
    firstRows: rows.slice(0, 2),
    lastRows: rows.slice(-2),
    note: isQuiet
      ? "summarized quiet probe — not shown to the user; re-run as a block query if you need the user to see it. columnStats span ALL rows; trust them over firstRows/lastRows."
      : "summarized — the full result is shown to the user as a block; re-query only if you need values you no longer see. columnStats span ALL rows; trust them over firstRows/lastRows.",
  };
  return { type: "json", value: digest as unknown as JSONValue };
}

/** Serialized-token cost of a single tool-result part's output, via the injected estimator. */
function outputTokens(output: unknown, estimate: (text: string) => number): number {
  return estimate(JSON.stringify(output ?? null));
}

/**
 * Budget-aware tool-result compaction (SPEC-10 §2.3). Policy:
 *  1. If the step is estimated at ≤ 50% of `budget.target`, compact NOTHING —
 *     the incident ran at <10% of budget and still lost data to digesting.
 *  2. Otherwise digest oldest-first, stopping as soon as the estimate drops under
 *     the threshold; ALWAYS keep the most recent two run_sql results verbatim.
 *
 * Pure: the caller (`index.ts`/`prepareStep`) computes `estimatedTokens` and
 * `targetTokens` and passes them in, along with the token estimator so the loop
 * can re-estimate as it digests.
 */
export function compactToolResults(
  messages: ModelMessage[],
  state: AgentRunState,
  opts: { estimatedTokens: number; targetTokens: number; estimate: (text: string) => number },
): ModelMessage[] {
  const { estimatedTokens, targetTokens, estimate } = opts;
  const threshold = targetTokens * COMPACTION_THRESHOLD_FRACTION;
  // Under threshold → digesting is pure loss with zero token benefit. Skip.
  if (estimatedTokens <= threshold) return messages;

  const locations: RunSqlLocation[] = [];
  messages.forEach((message, messageIndex) => {
    if (message.role !== "tool" || !Array.isArray(message.content)) return;
    message.content.forEach((part, partIndex) => {
      if (part.type === "tool-result" && part.toolName === "run_sql") {
        locations.push({ messageIndex, partIndex });
      }
    });
  });
  // Nothing to gain unless there are more results than we keep verbatim.
  if (locations.length <= VERBATIM_RUN_SQL_RESULTS) return messages;

  // Candidates = everything except the most recent two (oldest first already).
  const candidates = locations.slice(0, locations.length - VERBATIM_RUN_SQL_RESULTS);
  const digests = new Map<string, { type: "json"; value: JSONValue }>();
  let running = estimatedTokens;
  for (const location of candidates) {
    if (running <= threshold) break;
    const message = messages[location.messageIndex];
    if (message.role !== "tool" || !Array.isArray(message.content)) continue;
    const part = message.content[location.partIndex];
    if (!part || part.type !== "tool-result" || part.toolName !== "run_sql") continue;
    const digest = digestRunSqlOutput(part.output, state);
    if (!digest) continue;
    const before = outputTokens(part.output, estimate);
    const after = outputTokens(digest, estimate);
    running -= Math.max(0, before - after);
    digests.set(`${location.messageIndex}:${location.partIndex}`, digest);
  }
  if (digests.size === 0) return messages;

  return messages.map((message, messageIndex) => {
    if (message.role !== "tool" || !Array.isArray(message.content)) return message;
    let changed = false;
    const content = message.content.map((part, partIndex) => {
      const digest = digests.get(`${messageIndex}:${partIndex}`);
      if (!digest) return part;
      changed = true;
      return { ...part, output: digest };
    });
    return changed ? { ...message, content } : message;
  });
}
