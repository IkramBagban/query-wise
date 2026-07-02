import { embedMany } from "ai";
import { google } from "@ai-sdk/google";

export async function embedTexts(texts: string[]): Promise<{ vector: number[]; dimensions: number; embeddingModel: string }[] | null> {
  const providerName = process.env.QUERYWISE_EMBEDDING_PROVIDER;
  const modelName = process.env.QUERYWISE_EMBEDDING_MODEL;

  if (!providerName || !modelName) {
    return null;
  }

  // Support google natively. Voyage or others can be added here.
  let model;
  if (providerName === "google") {
    model = google.textEmbeddingModel(modelName);
  } else {
    throw new Error(`Unsupported embedding provider: ${providerName}`);
  }

  try {
    const { embeddings } = await embedMany({
      model,
      values: texts,
    });
    
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
