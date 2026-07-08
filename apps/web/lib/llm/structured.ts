import { generateObject, type LanguageModel } from "ai";
import type { z } from "zod";
import { getModel, type Provider, withModelFallback } from "./client";
import { type AttemptInfo, type LlmTask, runRoutedTask } from "./model-router";

export async function generateStructuredObject<TSchema extends z.ZodType>(params: {
  provider: Provider;
  model: string;
  apiKeys: string[];
  schema: TSchema;
  schemaName: string;
  system: string;
  prompt: string;
  maxOutputTokens?: number;
  temperature?: number;
  abortSignal?: AbortSignal;
  /**
   * When set, the call is routed through the shared key/model router for that
   * task's fallback chain (cross-provider, key-cooldown aware) instead of the
   * legacy same-provider fallback. Utility work (title/memory/verify) passes
   * "utility" so it runs on the cheap chain, off the agent's Gemini quota.
   */
  task?: LlmTask;
  onAttempt?: (info: AttemptInfo) => void;
}): Promise<z.infer<TSchema>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buildParams = (model: LanguageModel): any => ({
    model,
    schema: params.schema,
    schemaName: params.schemaName,
    system: params.system,
    prompt: params.prompt,
    maxOutputTokens: params.maxOutputTokens ?? 1600,
    temperature: params.temperature ?? 0.1,
    abortSignal: params.abortSignal,
  });

  if (params.task) {
    const result = await runRoutedTask({
      task: params.task,
      onAttempt: params.onAttempt,
      execute: ({ provider, model, apiKey }) =>
        generateObject(buildParams(getModel(provider, model, apiKey) as LanguageModel)),
    });
    return result.object as z.infer<TSchema>;
  }

  const result = await withModelFallback({
    provider: params.provider,
    model: params.model,
    apiKeys: params.apiKeys,
    execute: async (candidateModel, apiKey) =>
      generateObject(buildParams(getModel(params.provider, candidateModel, apiKey) as LanguageModel)),
  });
  return result.object as z.infer<TSchema>;
}
