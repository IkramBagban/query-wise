/**
 * Zero-dependency token estimation leaf (SPEC-01 §3, extracted per SPEC-10 §3).
 *
 * Extracted out of `context-budget.ts` so pure, budget-aware modules
 * (`history.ts`, `compaction.ts`) can depend on the estimator WITHOUT pulling in
 * `@/lib/llm-config` — keeping those modules import-light and unit-testable in
 * isolation. `context-budget.ts` re-exports `estimateTokens`, so existing call
 * sites are unchanged.
 *
 * Token counting is deliberately approximate — `chars / 4` with a 10% safety
 * margin — so no tokenizer dependency is required. A real tokenizer can be
 * swapped in here later without touching call sites.
 */

/** 10% headroom over the raw chars/4 estimate. */
export const TOKEN_SAFETY_MARGIN = 1.1;

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil((text.length / 4) * TOKEN_SAFETY_MARGIN);
}
