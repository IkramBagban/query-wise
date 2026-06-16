import "dotenv/config";

import {
  processSchemaIngestionJob,
  publishQueuedSchemaIngestionOutbox,
  SCHEMA_INGESTION_QUEUE_NAME,
  type SchemaIngestionJobData,
} from "@/lib/v2/ingestion";

type BullMqWorkerConstructor = new (
  name: string,
  processor: (job: { data: SchemaIngestionJobData; id?: string }) => Promise<unknown>,
  options: { connection: unknown; concurrency: number },
) => {
  on: (event: "completed" | "failed" | "error", listener: (...args: unknown[]) => void) => void;
  close: () => Promise<void>;
};

async function loadBullMq(): Promise<{ Worker: BullMqWorkerConstructor } | null> {
  try {
    const dynamicImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<{ Worker: BullMqWorkerConstructor }>;
    return await dynamicImport("bullmq");
  } catch {
    return null;
  }
}

function redisConnectionOptions(): unknown {
  const url = process.env.QUERYWISE_REDIS_URL ?? process.env.REDIS_URL;
  if (!url) throw new Error("QUERYWISE_REDIS_URL or REDIS_URL must be configured for schema ingestion workers.");
  return { url };
}

async function main(): Promise<void> {
  const bullmq = await loadBullMq();
  if (!bullmq) {
    throw new Error("The schema ingestion worker requires the bullmq package. Add it in the shared package workstream before running this worker.");
  }

  const concurrency = Number.parseInt(process.env.QUERYWISE_SCHEMA_INGESTION_CONCURRENCY ?? "2", 10);
  await publishQueuedSchemaIngestionOutbox();
  const relay = setInterval(() => {
    void publishQueuedSchemaIngestionOutbox().catch((error) => {
      console.error("[schema-ingestion] outbox relay failed", error);
    });
  }, 15_000);

  const worker = new bullmq.Worker(
    SCHEMA_INGESTION_QUEUE_NAME,
    async (job) => processSchemaIngestionJob(job.data),
    { connection: redisConnectionOptions(), concurrency: Math.max(1, Math.min(concurrency, 10)) },
  );

  worker.on("completed", (job) => {
    console.info("[schema-ingestion] completed", { jobId: (job as { id?: string }).id });
  });
  worker.on("failed", (job, error) => {
    console.error("[schema-ingestion] failed", { jobId: (job as { id?: string } | undefined)?.id, error });
  });
  worker.on("error", (error) => {
    console.error("[schema-ingestion] worker error", error);
  });

  const shutdown = async () => {
    clearInterval(relay);
    await worker.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

void main().catch((error) => {
  console.error("[schema-ingestion] fatal", error);
  process.exit(1);
});
