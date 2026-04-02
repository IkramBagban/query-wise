"use client";

import { useSessionStorage } from "@/hooks/useSessionStorage";
import {
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_PROVIDER,
  type LlmProvider,
} from "@/lib/llm-config";

export function useSettings() {
  const provider = useSessionStorage<LlmProvider>("llm_provider", DEFAULT_LLM_PROVIDER);
  const model = useSessionStorage<string>("llm_model", DEFAULT_LLM_MODEL);
  const apiKey = useSessionStorage<string>("llm_api_key", "");

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

