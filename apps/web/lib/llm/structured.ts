import { generateObject, type LanguageModel } from "ai";
import type { z } from "zod";
import { getModel, type Provider, withModelFallback } from "./client";

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
}): Promise<z.infer<TSchema>> {
  const result = await withModelFallback({
    provider: params.provider,
    model: params.model,
    apiKeys: params.apiKeys,
    execute: async (candidateModel, apiKey) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const callParams: any = {
        model: getModel(params.provider, candidateModel, apiKey) as LanguageModel,
        schema: params.schema,
        schemaName: params.schemaName,
        system: params.system,
        prompt: params.prompt,
        maxOutputTokens: params.maxOutputTokens ?? 1600,
        temperature: params.temperature ?? 0.1,
        abortSignal: params.abortSignal,
      };
      return generateObject(callParams);
    },
  });

  return result.object as z.infer<TSchema>;
}
