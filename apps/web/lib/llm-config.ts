export const LLM_PROVIDER_IDS = ["groq", "google", "anthropic"] as const;

export type LlmProvider = (typeof LLM_PROVIDER_IDS)[number];

export const DEFAULT_LLM_PROVIDER: LlmProvider = "google";
export const DEFAULT_LLM_MODEL = "gemini-2.5-flash";

export const SUPPORTED_MODELS_BY_PROVIDER: Record<LlmProvider, readonly string[]> = {
  groq: [
    "openai/gpt-oss-120b",
    "openai/gpt-oss-120b",
    "llama-3.1-8b-instant",
  ],
  google: [
    "gemini-2.5-flash",
    "gemini-3-flash-preview",
  ],
  anthropic: [
    "claude-opus-4-6",
    "claude-sonnet-4-6",
  ],
};

export const LLM_PROVIDER_OPTIONS: { label: string; value: LlmProvider }[] = [
  { label: "Groq", value: "groq" },
  { label: "Google", value: "google" },
  { label: "Anthropic", value: "anthropic" },
];

export function isLlmProvider(value: string): value is LlmProvider {
  return LLM_PROVIDER_IDS.includes(value as LlmProvider);
}

export function isSupportedModel(provider: LlmProvider, model: string): boolean {
  return SUPPORTED_MODELS_BY_PROVIDER[provider].includes(model);
}

export function defaultModelForProvider(provider: LlmProvider): string {
  return SUPPORTED_MODELS_BY_PROVIDER[provider][0] ?? DEFAULT_LLM_MODEL;
}

/**
 * Per-provider input-token budget consumed by the context engine (SPEC-01 §3).
 * This is the ceiling the assembler sizes the prompt against — NOT the model's
 * full context window.
 *
 * For Groq the budget reflects the per-minute TOKEN allowance (TPM), because a
 * request that fits the context window can still trip a TPM 413. For Gemini /
 * Anthropic tiers a conservative fixed default is used. `openai/gpt-oss-120b`
 * on Groq is a development-only config, so nothing here hardcodes it — every
 * value is overridable via `QUERYWISE_MODEL_INPUT_BUDGET`.
 */
export const DEFAULT_MODEL_INPUT_BUDGET = 100_000;

/** Conservative default for Groq models: sized to a per-minute TPM allowance. */
const GROQ_DEFAULT_INPUT_BUDGET = 12_000;

const MODEL_INPUT_BUDGETS: Record<LlmProvider, Record<string, number>> = {
  groq: {},
  google: {
    "gemini-2.5-flash": 100_000,
    "gemini-3-flash-preview": 100_000,
  },
  anthropic: {
    "claude-opus-4-6": 100_000,
    "claude-sonnet-4-6": 100_000,
  },
};

export function getModelInputBudget(provider: LlmProvider, model: string): number {
  const override = Number(process.env.QUERYWISE_MODEL_INPUT_BUDGET);
  if (Number.isFinite(override) && override > 0) return override;

  const perModel = MODEL_INPUT_BUDGETS[provider]?.[model];
  if (perModel && perModel > 0) return perModel;

  if (provider === "groq") return GROQ_DEFAULT_INPUT_BUDGET;
  return DEFAULT_MODEL_INPUT_BUDGET;
}
