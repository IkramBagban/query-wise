import { createHash } from "node:crypto";
import { generateObject, generateText } from "ai";
import { z } from "zod";
import type { MetadataEntity } from "@query-wise/shared/types";
import { devLog, devLogError } from "@query-wise/shared/observability";
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
  const entityIds = entities.map((e) => e.id);
  const prompt = [
    "Enrich the provided PostgreSQL tables with concise, analytics-oriented metadata.",
    "Return descriptions, column explanations, and 1-5 useful sample analytical questions per table.",
    "Do not invent metrics, row counts, or business facts that cannot be inferred from the names and column types.",
    "Input:",
    JSON.stringify({ tables: entities.map(compactEntity) }),
  ].join("\n\n");

  // Prefer structured outputs (much more reliable than text + parse)
  let tables: Array<{
    entityId: string;
    description: string;
    columns: Array<{ name: string; description: string }>;
    sampleQuestions: string[];
  }>;

  try {
    const result = await withModelFallback({
      provider: config.provider,
      model: config.model,
      execute: (candidateModel) =>
        generateObject({
          model: getModel(config.provider, candidateModel, config.apiKey),
          schema: descriptionSchema,
          prompt,
          system:
            "You are a precise schema metadata enricher for text-to-SQL systems. " +
            "Output ONLY the structured object. Every entityId from the input must be present exactly once.",
          maxOutputTokens: 6000,
          temperature: 0.0,
        }),
    });
    tables = result.object.tables;
  } catch (structuredError) {
    // Fallback to text generation + parsing for models/providers that don't support structured outputs well
    devLogError("schema-ingestion.llm.structured-failed", "Structured generation failed, falling back to text+parse", structuredError, {
      provider: config.provider,
      model: config.model,
      batchEntityIds: entityIds,
    });

    const { text } = await withModelFallback({
      provider: config.provider,
      model: config.model,
      execute: (candidateModel) =>
        generateText({
          model: getModel(config.provider, candidateModel, config.apiKey),
          system: "You are a precise schema metadata enricher for text-to-SQL systems. Respond ONLY with valid JSON matching the requested shape. Never add commentary.",
          prompt: "Return ONLY valid JSON:\n" + prompt,
          maxOutputTokens: 6000,
          temperature: 0.0,
        }),
    });

    // Robust extraction
    let jsonText = text.trim();
    const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenceMatch) jsonText = fenceMatch[1].trim();
    const objectMatch = jsonText.match(/\{[\s\S]*\}/);
    if (objectMatch) jsonText = objectMatch[0];

    let parsed: ReturnType<typeof descriptionSchema.safeParse> | { success: false };
    try {
      parsed = descriptionSchema.safeParse(JSON.parse(jsonText));
    } catch (parseErr) {
      devLogError("schema-ingestion.llm.text-parse-failed", "Text fallback also failed to produce valid JSON", parseErr, {
        rawPreview: text.slice(0, 1000),
        batchEntityIds: entityIds,
      });
      parsed = { success: false };
    }

    if (!parsed.success) {
      throw new Error("Schema enrichment model returned invalid descriptions.");
    }
    tables = parsed.data.tables;
  }

  // Ensure completeness and log any mismatches
  const returnedIds = new Set(tables.map((t) => t.entityId));
  const missing = entityIds.filter((id) => !returnedIds.has(id));
  if (missing.length > 0) {
    devLogError("schema-ingestion.llm.incomplete", "LLM response was missing some entities", undefined, {
      missingEntityIds: missing,
      returnedCount: tables.length,
      expectedCount: entityIds.length,
    });
  }

  // Filter to only the requested ones + basic validation
  const validTables = tables.filter((t) =>
    entityIds.includes(t.entityId) &&
    t.description?.trim() &&
    Array.isArray(t.columns) &&
    t.columns.length > 0 &&
    Array.isArray(t.sampleQuestions) &&
    t.sampleQuestions.length >= 1 &&
    t.sampleQuestions.length <= 5
  );

  if (validTables.length !== entities.length) {
    devLogError("schema-ingestion.llm.partial-validation", "Some descriptions failed post-processing validation", undefined, {
      batchEntityIds: entityIds,
      validCount: validTables.length,
    });
  }

  return validTables.length > 0 ? validTables : entities.map(fallbackDescription);
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
    const batchIds = batch.map((e) => e.id);

    let batchDescriptions: SchemaEntityDescription[];
    if (llmConfig) {
      try {
        batchDescriptions = await describeBatchWithLlm(batch, llmConfig);
      } catch (error) {
        devLogError("schema-ingestion.descriptions.batch-failed", "LLM description batch failed, using heuristic fallback.", error, {
          batchEntityIds: batchIds,
          batchSize: batch.length,
        });
        batchDescriptions = batch.map(fallbackDescription);
      }
    } else {
      batchDescriptions = batch.map(fallbackDescription);
    }

    // Final safety: ensure every entity in the batch has an entry (per-entity fallback)
    const covered = new Set(batchDescriptions.map((d) => d.entityId));
    for (const entity of batch) {
      if (!covered.has(entity.id)) {
        devLogError("schema-ingestion.descriptions.entity-fallback", "Falling back to heuristic for individual entity.", undefined, {
          entityId: entity.id,
          entityName: entity.name,
        });
        batchDescriptions.push(fallbackDescription(entity));
      }
    }

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
