import "dotenv/config";

// Ensure worker always logs regardless of NODE_ENV
if (!process.env.QUERYWISE_LOG_ENABLED) {
  process.env.QUERYWISE_LOG_ENABLED = "1";
}

import {
  publishQueuedSchemaIngestionOutbox,
  SCHEMA_INGESTION_QUEUE_NAME,
  type SchemaIngestionJobData,
} from "@query-wise/shared/ingestion";
import { getAppDb } from "@query-wise/shared/app-db";
import { processSchemaIngestionJob } from "./processor";
import { devLog, devLogError } from "@query-wise/shared/observability";

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
  } catch (error) {
    devLogError("schema-ingestion.worker.bullmq-load-failed", "Schema ingestion worker could not load BullMQ.", error);
    return null;
  }
}

function redisConnectionOptions(): unknown {
  const url = process.env.QUERYWISE_REDIS_URL ?? process.env.REDIS_URL;
  if (!url) {
    devLog("error", "schema-ingestion.worker.redis-missing", "Schema ingestion worker Redis URL is not configured.");
    throw new Error("QUERYWISE_REDIS_URL or REDIS_URL must be configured for schema ingestion workers.");
  }
  return { url };
}

async function main(): Promise<void> {
  devLog("info", "schema-ingestion.worker.boot", "Schema ingestion worker booting.", {
    queueName: SCHEMA_INGESTION_QUEUE_NAME,
  });
  const bullmq = await loadBullMq();
  if (!bullmq) {
    throw new Error("The schema ingestion worker requires the bullmq package. Add it in the shared package workstream before running this worker.");
  }

  const concurrency = Number.parseInt(process.env.QUERYWISE_SCHEMA_INGESTION_CONCURRENCY ?? "2", 10);
  const normalizedConcurrency = Math.max(1, Math.min(concurrency, 10));
  const initiallyPublished = await publishQueuedSchemaIngestionOutbox();
  devLog("info", "schema-ingestion.worker.started", "Schema ingestion worker started.", {
    queueName: SCHEMA_INGESTION_QUEUE_NAME,
    concurrency: normalizedConcurrency,
    initiallyPublished,
  });
  const relay = setInterval(() => {
    void publishQueuedSchemaIngestionOutbox()
      .then((published) => {
        devLog("debug", "schema-ingestion.worker.outbox-relay", "Schema ingestion worker relayed queued outbox jobs.", { published });
      })
      .catch((error) => {
        devLogError("schema-ingestion.worker.outbox-relay-failed", "Schema ingestion worker outbox relay failed.", error);
      });
  }, 15_000);

  const worker = new bullmq.Worker(
    SCHEMA_INGESTION_QUEUE_NAME,
    async (job) => {
      devLog("info", "schema-ingestion.worker.job-received", "Schema ingestion worker received job.", {
        jobId: job.id,
        connectionId: job.data.connectionId,
        intent: job.data.intent,
      });
      return processSchemaIngestionJob(job.data);
    },
    { connection: redisConnectionOptions(), concurrency: normalizedConcurrency },
  );

  worker.on("completed", (job) => {
    devLog("info", "schema-ingestion.worker.job-completed", "Schema ingestion worker completed job.", { jobId: (job as { id?: string }).id });
  });
  worker.on("failed", (job, error) => {
    devLogError("schema-ingestion.worker.job-failed", "Schema ingestion worker job failed.", error, { jobId: (job as { id?: string } | undefined)?.id });
  });
  worker.on("error", (error) => {
    devLogError("schema-ingestion.worker.error", "Schema ingestion worker emitted an error.", error);
  });

  const shutdown = async () => {
    devLog("info", "schema-ingestion.worker.shutdown-started", "Schema ingestion worker shutdown started.");
    clearInterval(relay);
    await worker.close();
    await getAppDb().$disconnect();
    devLog("info", "schema-ingestion.worker.shutdown-completed", "Schema ingestion worker shutdown completed.");
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

void main().catch((error) => {
  devLogError("schema-ingestion.worker.fatal", "Schema ingestion worker exited with a fatal error.", error);
  process.exit(1);
});
