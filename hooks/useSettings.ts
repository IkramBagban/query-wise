"use client";

import { useLocalStorage } from "@/hooks/useLocalStorage";

export const SUPPORTED_MODELS = {
  google: [
    "gemini-3.1-pro-preview",
    "gemini-3-flash-preview",
  ],
  anthropic: [
    "claude-opus-4-6",
    "claude-sonnet-4-6",
  ],
} as const;

export type LlmProvider = keyof typeof SUPPORTED_MODELS;

export function useSettings() {
  const provider = useLocalStorage<LlmProvider>("llm_provider", "google");
  const model = useLocalStorage<string>("llm_model", "gemini-3-flash-preview");
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
