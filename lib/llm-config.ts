export const LLM_PROVIDER_IDS = ["google", "anthropic"] as const;

export type LlmProvider = (typeof LLM_PROVIDER_IDS)[number];

export const DEFAULT_LLM_PROVIDER: LlmProvider = "google";
export const DEFAULT_LLM_MODEL = "gemini-3-flash-preview";

export const LLM_PROVIDER_OPTIONS: { label: string; value: LlmProvider }[] = [
  { label: "Google", value: "google" },
  { label: "Anthropic", value: "anthropic" },
];

export const SUPPORTED_MODELS_BY_PROVIDER: Record<LlmProvider, readonly string[]> = {
  google: [
    "gemini-3.1-pro-preview",
    "gemini-3-flash-preview",
  ],
  anthropic: [
    "claude-opus-4-6",
    "claude-sonnet-4-6",
  ],
};

export const LLM_MODEL_CATALOG = [
  {
    provider: "google" as const,
    model: "gemini-3.1-pro-preview",
    label: "Gemini 3.1 Pro Preview",
    tier: "powerful" as const,
  },
  {
    provider: "google" as const,
    model: "gemini-3-flash-preview",
    label: "Gemini 3 Flash Preview",
    tier: "fast" as const,
  },
  {
    provider: "anthropic" as const,
    model: "claude-opus-4-6",
    label: "Claude Opus 4.6",
    tier: "powerful" as const,
  },
  {
    provider: "anthropic" as const,
    model: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    tier: "fast" as const,
  },
] as const;
