import { generateObject } from "ai";
import type { z } from "zod";
import { getModel, type Provider, withModelFallback } from "./client";

export async function generateStructuredObject<TSchema extends z.ZodType>(params: {
  provider: Provider;
  model: string;
  apiKey: string;
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
    execute: async (candidateModel) =>
      generateObject({
        model: getModel(params.provider, candidateModel, params.apiKey),
        schema: params.schema,
        schemaName: params.schemaName,
        system: params.system,
        prompt: params.prompt,
        maxOutputTokens: params.maxOutputTokens ?? 1600,
        temperature: params.temperature ?? 0.1,
        abortSignal: params.abortSignal,
      }),
  });

  return result.object as z.infer<TSchema>;
}
