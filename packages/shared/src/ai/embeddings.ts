import { embedMany } from "ai";
import { google } from "@ai-sdk/google";
import { recordLlmUsage } from "../metrics";

/** Optional owner/connection context so embedding token usage is attributable. */
export interface EmbeddingUsageContext {
  userId: string;
  connectionId?: string | null;
}

export async function embedTexts(
  texts: string[],
  usageContext?: EmbeddingUsageContext,
): Promise<{ vector: number[]; dimensions: number; embeddingModel: string }[] | null> {
  const providerName = process.env.QUERYWISE_EMBEDDING_PROVIDER;
  const modelName = process.env.QUERYWISE_EMBEDDING_MODEL;

  if (!providerName || !modelName) {
    return null;
  }

  // Support google natively. Voyage or others can be added here.
  // An unsupported/misconfigured provider must fall back to lexical, not fail the ingestion job.
  if (providerName !== "google") {
    console.error(`Unsupported embedding provider: ${providerName}. Falling back to lexical.`);
    return null;
  }
  const model = google.textEmbeddingModel(modelName);

  try {
    const { embeddings, usage } = await embedMany({
      model,
      values: texts,
    });

    // Embedding token usage: providers report input tokens only (no output).
    if (usageContext) {
      void recordLlmUsage({
        userId: usageContext.userId,
        connectionId: usageContext.connectionId ?? null,
        task: "embedding",
        provider: "google",
        model: modelName,
        inputTokens: (usage as { tokens?: number } | undefined)?.tokens ?? 0,
        outputTokens: 0,
        success: true,
      });
    }

    if (embeddings.length === 0) return [];
    
    // Validate we got embeddings back and check dimensions
    const dimensions = embeddings[0]?.length ?? 0;
    if (dimensions === 0) {
        throw new Error("Received empty embeddings from provider");
    }

    return embeddings.map(vector => ({
      vector,
      dimensions,
      embeddingModel: modelName
    }));
  } catch (error) {
    console.error("Failed to generate embeddings:", error);
    // Returning null falls back to lexical seamlessly
    return null;
  }
}
