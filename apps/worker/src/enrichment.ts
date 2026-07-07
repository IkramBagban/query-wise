import { createHash } from "node:crypto";
import { generateObject, generateText } from "ai";
import { z } from "zod";
import type { MetadataEntity } from "@query-wise/shared/types";
import { devLog, devLogError } from "@query-wise/shared/observability";
import { getModel, type Provider, withModelFallback } from "./llm";
import type { SchemaEmbeddingRecord, SchemaEntityDescription } from "@query-wise/shared/ingestion";
import { embedTexts } from "@query-wise/shared/ai";
import { computeEntityFingerprint } from "./fingerprint";

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
  const rawApiKey = process.env.QUERYWISE_INGESTION_LLM_API_KEY;
  if ((provider === "google" || provider === "anthropic" || provider === "groq") && model && rawApiKey) {
    const keys = rawApiKey.split(",").map((k) => k.trim()).filter(Boolean);
    const apiKey = keys[Math.floor(Math.random() * keys.length)];
    if (apiKey) return { provider, model, apiKey };
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



const TARGET_COLUMNS_PER_BATCH = 150;
const MAX_CONCURRENT_BATCHES = 4;
const WIDE_TABLE_THRESHOLD = 100;

function truncateWideEntity(entity: MetadataEntity): { truncatedEntity: MetadataEntity, omittedColumns: MetadataEntity['columns'] } {
  if (entity.columns.length <= WIDE_TABLE_THRESHOLD) return { truncatedEntity: entity, omittedColumns: [] };
  
  const sorted = [...entity.columns].sort((a, b) => {
    if (a.primaryKey && !b.primaryKey) return -1;
    if (!a.primaryKey && b.primaryKey) return 1;
    const aFk = a.name.toLowerCase().endsWith("id") || a.name.toLowerCase().endsWith("_id");
    const bFk = b.name.toLowerCase().endsWith("id") || b.name.toLowerCase().endsWith("_id");
    if (aFk && !bFk) return -1;
    if (!aFk && bFk) return 1;
    return a.ordinal - b.ordinal;
  });

  const kept = sorted.slice(0, WIDE_TABLE_THRESHOLD);
  const omitted = sorted.slice(WIDE_TABLE_THRESHOLD);

  return {
    truncatedEntity: { ...entity, columns: entity.columns.filter(c => kept.includes(c)) },
    omittedColumns: entity.columns.filter(c => omitted.includes(c)),
  };
}

async function describeBatchWithLlm(entities: MetadataEntity[], config: { provider: Provider; model: string; apiKey: string }, maxOutputTokens = 6000) {
  const entityIds = entities.map((e) => e.id);
  const prompt = [
    "Enrich the provided PostgreSQL tables with concise, analytics-oriented metadata.",
    "Return descriptions, column explanations, and 1-5 useful sample analytical questions per table.",
    "Do not invent metrics, row counts, or business facts that cannot be inferred from the names and column types.",
    "Input:",
    JSON.stringify({ tables: entities.map(compactEntity) }),
  ].join("\n\n");

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
          maxOutputTokens,
          temperature: 0.0,
        }),
    });
    tables = result.object.tables;
  } catch (structuredError) {
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
          maxOutputTokens,
          temperature: 0.0,
        }),
    });

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

  const returnedIds = new Set(tables.map((t) => t.entityId));
  const missing = entityIds.filter((id) => !returnedIds.has(id));
  if (missing.length > 0) {
    devLogError("schema-ingestion.llm.incomplete", "LLM response was missing some entities", undefined, {
      missingEntityIds: missing,
      returnedCount: tables.length,
      expectedCount: entityIds.length,
    });
  }

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
  const llmConfig = configuredProvider();

  const pending: { entity: MetadataEntity, omittedColumns: MetadataEntity['columns'] }[] = [];

  for (const entity of entities) {
    const fingerprint = computeEntityFingerprint(entity);
    const existingDesc = descriptions[entity.id];
    if (existingDesc && existingDesc.entityFingerprint === fingerprint) {
      continue;
    }
    const { truncatedEntity, omittedColumns } = truncateWideEntity(entity);
    pending.push({ entity: truncatedEntity, omittedColumns });
  }

  const batches: (typeof pending)[] = [];
  let currentBatch: typeof pending = [];
  let currentCols = 0;

  for (const item of pending) {
    if (currentBatch.length > 0 && currentCols + item.entity.columns.length > TARGET_COLUMNS_PER_BATCH) {
      batches.push(currentBatch);
      currentBatch = [];
      currentCols = 0;
    }
    currentBatch.push(item);
    currentCols += item.entity.columns.length;
    if (currentCols >= TARGET_COLUMNS_PER_BATCH) {
      batches.push(currentBatch);
      currentBatch = [];
      currentCols = 0;
    }
  }
  if (currentBatch.length > 0) batches.push(currentBatch);

  let activePromises = new Set<Promise<void>>();

  for (const batch of batches) {
    if (activePromises.size >= MAX_CONCURRENT_BATCHES) {
      await Promise.race(activePromises);
    }

    const batchIds = batch.map((item) => item.entity.id);
    const batchEntities = batch.map((item) => item.entity);
    const totalColumns = batchEntities.reduce((sum, e) => sum + e.columns.length, 0);
    const maxTokens = totalColumns > 100 ? 8192 : 6000;

    const promise = (async () => {
      let batchDescriptions: SchemaEntityDescription[];
      if (llmConfig) {
        try {
          batchDescriptions = await describeBatchWithLlm(batchEntities, llmConfig, maxTokens);
        } catch (error) {
          devLogError("schema-ingestion.descriptions.batch-failed", "LLM description batch failed, using heuristic fallback.", error, {
            batchEntityIds: batchIds,
            batchSize: batch.length,
          });
          batchDescriptions = batchEntities.map(fallbackDescription);
        }
      } else {
        batchDescriptions = batchEntities.map(fallbackDescription);
      }

      const descById = new Map(batchDescriptions.map(d => [d.entityId, d]));
      for (const item of batch) {
        let desc = descById.get(item.entity.id);
        if (!desc) {
          devLogError("schema-ingestion.descriptions.entity-fallback", "Falling back to heuristic for individual entity.", undefined, {
            entityId: item.entity.id,
            entityName: item.entity.name,
          });
          desc = fallbackDescription(item.entity);
        }
        
        for (const col of item.omittedColumns) {
          // SPEC-03 §6.3: mark truncated columns null rather than padding with useless boilerplate,
          // so the web tier renders nothing for them instead of noise.
          desc.columns.push({ name: col.name, description: null });
        }
        
        desc.entityFingerprint = computeEntityFingerprint(entities.find(e => e.id === item.entity.id)!);
        descriptions[desc.entityId] = desc;
      }

      await onBatch?.({ ...descriptions });
    })();

    activePromises.add(promise);
    promise.finally(() => activePromises.delete(promise));
  }

  await Promise.all(activePromises);

  return descriptions;
}


function tableSummaryText(entity: MetadataEntity, description: SchemaEntityDescription): string {
  // Columns with a null description (truncated, §6.3) contribute only their name to the embed text.
  const columns = description.columns
    .map((column) => (column.description ? `${column.name}: ${column.description}` : column.name))
    .join("; ");
  return `${entity.namespace}.${entity.name}: ${description.description}. Columns: ${columns}`;
}

function questionSummaryText(description: SchemaEntityDescription): string {
  return description.sampleQuestions.join("\n");
}

export async function createEmbeddingRecords(input: {
  connectionId: string;
  schemaFingerprint: string;
  entities: MetadataEntity[];
  descriptions: Record<string, SchemaEntityDescription>;
  alreadyEmbeddedEntityIds?: Set<string>;
}): Promise<SchemaEmbeddingRecord[]> {
  const itemsToEmbed: { entity: MetadataEntity, description: SchemaEntityDescription, kind: "table-summary" | "question-summary", text: string }[] = [];
  
  for (const entity of input.entities) {
    if (input.alreadyEmbeddedEntityIds?.has(entity.id)) continue;
    const description = input.descriptions[entity.id] ?? fallbackDescription(entity);
    itemsToEmbed.push({ entity, description, kind: "table-summary", text: tableSummaryText(entity, description) });
    itemsToEmbed.push({ entity, description, kind: "question-summary", text: questionSummaryText(description) });
  }
  
  if (itemsToEmbed.length === 0) return [];
  
  const texts = itemsToEmbed.map(item => item.text);
  const embeddings = await embedTexts(texts);
  
  if (!embeddings) {
    return []; // Fall back to lexical seamlessly
  }

  const records: SchemaEmbeddingRecord[] = [];
  for (let i = 0; i < itemsToEmbed.length; i++) {
    const item = itemsToEmbed[i];
    const embedding = embeddings[i];
    if (!item || !embedding) continue;
    records.push({
      connectionId: input.connectionId,
      entityId: item.entity.id,
      namespace: item.entity.namespace,
      entityName: item.entity.name,
      embeddingKind: item.kind,
      text: item.text,
      vector: embedding.vector,
      dimensions: embedding.dimensions,
      embeddingModel: embedding.embeddingModel,
      payload: { metadata: item.entity, description: item.description, schemaFingerprint: input.schemaFingerprint },
    });
  }
  return records;
}
