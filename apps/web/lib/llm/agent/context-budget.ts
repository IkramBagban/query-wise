import { getModelInputBudget, type LlmProvider } from "@/lib/llm-config";
import { estimateTokens } from "./tokens";

/**
 * Token-budgeting primitives for the context engine (SPEC-01 §3).
 *
 * `estimateTokens` now lives in the dependency-free `./tokens` leaf (SPEC-10 §3)
 * and is re-exported here so existing call sites keep importing it from
 * `context-budget`.
 */

/** The assembler targets staying under 80% of the model's input budget. */
const TARGET_UTILISATION = 0.8;
/** Schema section gets ~40% of the total input budget. */
const SCHEMA_BUDGET_SHARE = 0.4;
/** Conversation history gets ~20% of the total input budget. */
const HISTORY_BUDGET_SHARE = 0.2;

export { estimateTokens };

export interface ContextBudget {
  /** Total input-token budget for the model/provider. */
  total: number;
  /** Ceiling the assembler aims to stay under (≤80% of total). */
  target: number;
  /** Token share reserved for the schema section (~40% of total). */
  schema: number;
  /** Token share reserved for conversation history (~20% of total). */
  history: number;
}

export function resolveContextBudget(provider: LlmProvider, model: string): ContextBudget {
  const total = getModelInputBudget(provider, model);
  return {
    total,
    target: Math.floor(total * TARGET_UTILISATION),
    schema: Math.floor(total * SCHEMA_BUDGET_SHARE),
    history: Math.floor(total * HISTORY_BUDGET_SHARE),
  };
}

/**
 * Greedily pick items (already ordered by descending relevance) whose rendered
 * form fits within `budget` tokens, stopping at the first item that would
 * overflow. Preserves relevance ordering rather than repacking, so the
 * highest-relevance tables always win their place in Tier B.
 */
export function greedyFitByTokens<T>(
  items: T[],
  render: (item: T) => string,
  budget: number,
): { selected: T[]; usedTokens: number } {
  const selected: T[] = [];
  let usedTokens = 0;
  for (const item of items) {
    const cost = estimateTokens(render(item));
    if (usedTokens + cost > budget) break;
    selected.push(item);
    usedTokens += cost;
  }
  return { selected, usedTokens };
}
