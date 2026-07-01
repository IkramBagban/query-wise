import { createHash } from "node:crypto";
import { generateText } from "ai";
import { z } from "zod";
import type { MetadataEntity } from "@query-wise/shared/types";
import { getModel, type Provider, withModelFallback } from "./llm";
import type { SchemaEmbeddingRecord, SchemaEntityDescription } from "@query-wise/shared/ingestion";

const DESCRIPTION_BATCH_SIZE = 8;
const EMBEDDING_DIMENSIONS = 384;

const descriptionSchema = z.object({
  tables: z.array(z.object({
    entityId: z.string(),
    description: z.string().min(1),
    columns: z.array(z.object({ name: z.string(), description: z.string().min(1) })),
    sampleQuestions: z.array(z.string().min(1)).min(1).max(5),
  })),
});

function configuredProvider(): { provider: Provider; model: string; apiKey: string } | null {
  const provider = process.env.QUERYWISE_INGESTION_LLM_PROVIDER;
  const model = process.env.QUERYWISE_INGESTION_LLM_MODEL;
  const apiKey = process.env.QUERYWISE_INGESTION_LLM_API_KEY;
  if ((provider === "google" || provider === "anthropic" || provider === "groq") && model && apiKey) {
    return { provider, model, apiKey };
  }
  if (provider && provider !== "") {
    console.error(
      `[worker/llm] Unknown LLM provider: "${provider}". Set QUERYWISE_INGESTION_LLM_PROVIDER to google, anthropic, or groq.`,
    );
  }
  return null;
}

function compactEntity(entity: MetadataEntity) {
  return {
    entityId: entity.id,
    kind: entity.kind,
    columns: entity.columns.map((column) => ({
      name: column.name,
      type: column.nativeType,
      nullable: column.nullable,
      primaryKey: column.primaryKey,
    })),
    estimatedRowCount: entity.estimatedRowCount,
  };
}

function fallbackDescription(entity: MetadataEntity): SchemaEntityDescription {
  const readableName = entity.name.replace(/[_-]+/g, " ");
  const keyColumns = entity.columns.filter((column) => column.primaryKey).map((column) => column.name);
  return {
    entityId: entity.id,
    description: `${entity.kind} ${entity.namespace}.${entity.name} stores ${readableName} records.`,
    columns: entity.columns.map((column) => ({
      name: column.name,
      description: `${column.name} is a ${column.nativeType} column${column.primaryKey ? " used as a primary key" : ""}.`,
    })),
    sampleQuestions: [
      `How many records are in ${readableName}?`,
      keyColumns.length > 0
        ? `Show recent ${readableName} by ${keyColumns[0]}.`
        : `Show recent rows from ${readableName}.`,
    ],
  };
}

async function describeBatchWithLlm(entities: MetadataEntity[], config: { provider: Provider; model: string; apiKey: string }) {
  const prompt = [
    "Return strict JSON matching this TypeScript shape:",
    "{ tables: Array<{ entityId: string; description: string; columns: Array<{ name: string; description: string }>; sampleQuestions: string[] }> }",
    "Write concise analytics-focused descriptions. Do not invent values, metrics, or business facts not implied by names and types.",
    JSON.stringify({ tables: entities.map(compactEntity) }),
  ].join("\n\n");

  const { text } = await withModelFallback({
    provider: config.provider,
    model: config.model,
    execute: (candidateModel) =>
      generateText({
        model: getModel(config.provider, candidateModel, config.apiKey),
        system: "You enrich PostgreSQL schema metadata for text-to-SQL retrieval. Respond only with valid JSON.",
        prompt,
        maxOutputTokens: 5000,
        temperature: 0.1,
      }),
  });

  const jsonText = text.replace(/```json\n?/gi, "").replace(/```\n?/g, "").trim();
  let parsed: ReturnType<typeof descriptionSchema.safeParse> | { success: false };
  try {
    parsed = descriptionSchema.safeParse(JSON.parse(jsonText));
  } catch {
    parsed = { success: false };
  }
  if (!parsed.success) {
    throw new Error("Schema enrichment model returned invalid descriptions.");
  }
  return parsed.data.tables;
}

export async function describeEntities(
  entities: MetadataEntity[],
  existing: Record<string, SchemaEntityDescription> = {},
  onBatch?: (descriptions: Record<string, SchemaEntityDescription>) => Promise<void>,
): Promise<Record<string, SchemaEntityDescription>> {
  const descriptions = { ...existing };
  const pending = entities.filter((entity) => !descriptions[entity.id]);
  const llmConfig = configuredProvider();

  for (let index = 0; index < pending.length; index += DESCRIPTION_BATCH_SIZE) {
    const batch = pending.slice(index, index + DESCRIPTION_BATCH_SIZE);
    const batchDescriptions = llmConfig
      ? await describeBatchWithLlm(batch, llmConfig)
      : batch.map(fallbackDescription);
    for (const description of batchDescriptions) {
      descriptions[description.entityId] = description;
    }
    await onBatch?.(descriptions);
  }

  return descriptions;
}

function hashEmbedding(text: string, dimensions = EMBEDDING_DIMENSIONS): number[] {
  const vector = Array.from({ length: dimensions }, () => 0);
  const tokens = text.toLowerCase().match(/[a-z0-9_]+/g) ?? [];
  for (const token of tokens) {
    const digest = createHash("sha256").update(token).digest();
    const index = digest.readUInt16BE(0) % dimensions;
    const sign = digest[2] % 2 === 0 ? 1 : -1;
    vector[index] += sign;
  }
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => Number((value / magnitude).toFixed(6)));
}

function tableSummaryText(entity: MetadataEntity, description: SchemaEntityDescription): string {
  const columns = description.columns.map((column) => `${column.name}: ${column.description}`).join("; ");
  return `${entity.namespace}.${entity.name}: ${description.description}. Columns: ${columns}`;
}

function questionSummaryText(description: SchemaEntityDescription): string {
  return description.sampleQuestions.join("\n");
}

export function createEmbeddingRecords(input: {
  connectionId: string;
  schemaFingerprint: string;
  entities: MetadataEntity[];
  descriptions: Record<string, SchemaEntityDescription>;
  alreadyEmbeddedEntityIds?: Set<string>;
}): SchemaEmbeddingRecord[] {
  const records: SchemaEmbeddingRecord[] = [];
  for (const entity of input.entities) {
    if (input.alreadyEmbeddedEntityIds?.has(entity.id)) continue;
    const description = input.descriptions[entity.id] ?? fallbackDescription(entity);
    const tableText = tableSummaryText(entity, description);
    const questionText = questionSummaryText(description);
    records.push({
      connectionId: input.connectionId,
      entityId: entity.id,
      namespace: entity.namespace,
      entityName: entity.name,
      embeddingKind: "table-summary",
      text: tableText,
      vector: hashEmbedding(tableText),
      payload: { metadata: entity, description, schemaFingerprint: input.schemaFingerprint },
    });
    records.push({
      connectionId: input.connectionId,
      entityId: entity.id,
      namespace: entity.namespace,
      entityName: entity.name,
      embeddingKind: "question-summary",
      text: questionText,
      vector: hashEmbedding(questionText),
      payload: { metadata: entity, description, schemaFingerprint: input.schemaFingerprint },
    });
  }
  return records;
}
