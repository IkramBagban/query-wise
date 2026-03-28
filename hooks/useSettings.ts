"use client";

import { useLocalStorage } from "@/hooks/useLocalStorage";

export const SUPPORTED_MODELS = {
  google: ["gemini-1.5-flash", "gemini-1.5-pro"],
  anthropic: ["claude-sonnet-4-5", "claude-3-7-sonnet"],
} as const;

export type LlmProvider = keyof typeof SUPPORTED_MODELS;

export function useSettings() {
  const provider = useLocalStorage<LlmProvider>("llm_provider", "google");
  const model = useLocalStorage<string>("llm_model", "gemini-1.5-flash");
  const apiKey = useLocalStorage<string>("llm_api_key", "");

  return {
    provider: provider.value,
    setProvider: provider.setValue,
    model: model.value,
    setModel: model.setValue,
    apiKey: apiKey.value,
    setApiKey: apiKey.setValue,
    initialized: provider.initialized && model.initialized && apiKey.initialized,
  };
}
