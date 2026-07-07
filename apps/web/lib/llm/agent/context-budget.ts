import { getModelInputBudget, type LlmProvider } from "@/lib/llm-config";

/**
 * Token-budgeting primitives for the context engine (SPEC-01 §3).
 *
 * Token counting is deliberately approximate — `chars / 4` with a 10% safety
 * margin — so no tokenizer dependency is required. It lives behind the single
 * `estimateTokens` function so a real tokenizer can be swapped in later without
 * touching call sites.
 */

/** 10% headroom over the raw chars/4 estimate. */
const SAFETY_MARGIN = 1.1;
/** The assembler targets staying under 80% of the model's input budget. */
const TARGET_UTILISATION = 0.8;
/** Schema section gets ~40% of the total input budget. */
const SCHEMA_BUDGET_SHARE = 0.4;
/** Conversation history gets ~20% of the total input budget. */
const HISTORY_BUDGET_SHARE = 0.2;

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil((text.length / 4) * SAFETY_MARGIN);
}

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
