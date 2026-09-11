import "dotenv/config";

// Ensure worker always logs regardless of NODE_ENV
if (!process.env.QUERYWISE_LOG_ENABLED) {
  process.env.QUERYWISE_LOG_ENABLED = "1";
}

import {
  enqueueScheduledSchemaRefresh,
  publishQueuedSchemaIngestionOutbox,
  scheduleSchemaRefreshRepeatable,
  SCHEMA_INGESTION_QUEUE_NAME,
  SCHEMA_REFRESH_QUEUE_NAME,
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
  const urlString = process.env.QUERYWISE_REDIS_URL ?? process.env.REDIS_URL;
  if (!urlString) {
    devLog("error", "schema-ingestion.worker.redis-missing", "Schema ingestion worker Redis URL is not configured.");
    throw new Error("QUERYWISE_REDIS_URL or REDIS_URL must be configured for schema ingestion workers.");
  }
  try {
    const parsed = new URL(urlString);
    return {
      host: parsed.hostname,
      port: parsed.port ? parseInt(parsed.port, 10) : 6379,
      username: parsed.username || undefined,
      password: parsed.password || undefined,
      tls: parsed.protocol === "rediss:" ? {} : undefined,
      maxRetriesPerRequest: null,
    };
  } catch {
    return { url: urlString };
  }
}

function outboxRelayIntervalMs(): number {
  // Neon-friendly default: the relay is failure-recovery-only (the enqueue
  // path closes its own outbox row on immediate publish), so poll rarely and
  // let a scale-to-zero DB suspend between polls (Neon suspends after ~5 min
  // idle and lingers ~5 min awake after each query, so the interval must be
  // well above 10 min to stay inside the free tier). 0 disables the interval
  // entirely (drain once on boot).
  const raw = process.env.QUERYWISE_OUTBOX_RELAY_MS;
  if (raw === undefined || raw.trim() === "") return 3_600_000;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 3_600_000;
  return parsed;
}

async function runOutboxRelayOnce(): Promise<void> {
  try {
    const published = await publishQueuedSchemaIngestionOutbox();
    devLog("debug", "schema-ingestion.worker.outbox-relay", "Schema ingestion worker relayed queued outbox jobs.", { published });
    if (published === 0) {
      // Release pooled connections so the app DB can suspend when idle.
      await getAppDb().$disconnect().catch(() => undefined);
    }
  } catch (error) {
    devLogError("schema-ingestion.worker.outbox-relay-failed", "Schema ingestion worker outbox relay failed.", error);
  }
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
  if (initiallyPublished === 0) {
    // No backlog: release pooled connections immediately so the app DB can
    // suspend instead of holding idle connections open until the first tick.
    await getAppDb().$disconnect().catch(() => undefined);
  }
  devLog("info", "schema-ingestion.worker.started", "Schema ingestion worker started.", {
    queueName: SCHEMA_INGESTION_QUEUE_NAME,
    concurrency: normalizedConcurrency,
    initiallyPublished,
  });
  const relayIntervalMs = outboxRelayIntervalMs();
  let relay: ReturnType<typeof setInterval> | null = null;
  if (relayIntervalMs > 0) {
    relay = setInterval(() => void runOutboxRelayOnce(), relayIntervalMs);
    relay.unref?.();
  }
  devLog("info", "schema-ingestion.worker.relay-config", "Schema ingestion outbox relay configured.", {
    relayIntervalMs,
    relayEnabled: relay !== null,
  });

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

  // SPEC-03 §6.2 — env-gated recurring drift detection. Registers a repeatable job and a worker that
  // enqueues an ingestion refresh per connection; unchanged entities are skipped downstream.
  const refreshCron = process.env.QUERYWISE_SCHEMA_REFRESH_CRON;
  let refreshWorker: InstanceType<BullMqWorkerConstructor> | null = null;
  if (refreshCron) {
    const scheduled = await scheduleSchemaRefreshRepeatable(refreshCron);
    refreshWorker = new bullmq.Worker(
      SCHEMA_REFRESH_QUEUE_NAME,
      async () => {
        devLog("info", "schema-refresh.worker.scan-started", "Scheduled schema refresh scan started.");
        return enqueueScheduledSchemaRefresh();
      },
      { connection: redisConnectionOptions(), concurrency: 1 },
    );
    refreshWorker.on("failed", (job, error) => {
      devLogError("schema-refresh.worker.job-failed", "Scheduled schema refresh job failed.", error, { jobId: (job as { id?: string } | undefined)?.id });
    });
    devLog("info", "schema-refresh.worker.started", "Scheduled schema refresh worker started.", { cronPattern: refreshCron, scheduled });
  }

  const shutdown = async () => {
    devLog("info", "schema-ingestion.worker.shutdown-started", "Schema ingestion worker shutdown started.");
    if (relay) clearInterval(relay);
    await worker.close();
    await refreshWorker?.close();
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
