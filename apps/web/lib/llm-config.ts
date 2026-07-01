export const LLM_PROVIDER_IDS = ["groq", "google", "anthropic"] as const;

export type LlmProvider = (typeof LLM_PROVIDER_IDS)[number];

export const DEFAULT_LLM_PROVIDER: LlmProvider = "google";
export const DEFAULT_LLM_MODEL = "gemini-2.5-flash";

export const SUPPORTED_MODELS_BY_PROVIDER: Record<LlmProvider, readonly string[]> = {
  groq: [
    "moonshotai/kimi-k2-instruct",
    "llama-3.3-70b-versatile",
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
