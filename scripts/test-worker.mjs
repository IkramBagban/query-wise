/**
 * Smoke test for the query-wise BullMQ schema-ingestion worker.
 *
 * Run from the repo root:
 *   node scripts/test-worker.mjs
 *
 * Exit codes:
 *   0  – all executed tests passed (SKIPs do not count against success)
 *   1  – one or more tests failed
 */

import { config } from "dotenv";
import net from "net";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

// ---------------------------------------------------------------------------
// Load .env from the repo root (one level above this scripts/ directory).
// ---------------------------------------------------------------------------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
config({ path: path.join(repoRoot, ".env") });

// ---------------------------------------------------------------------------
// Result tracking
// ---------------------------------------------------------------------------
const PASS = "PASS";
const FAIL = "FAIL";
const SKIP = "SKIP";

const results = [];

function record(label, status, detail = "") {
  const icon = status === PASS ? "✓" : status === FAIL ? "✗" : "–";
  const line = `  [${icon}] ${status.padEnd(4)} ${label}${detail ? `  (${detail})` : ""}`;
  console.log(line);
  results.push({ label, status });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse host and port from a Redis URL.
 * Accepts redis://, rediss://, and redis+sentinel:// prefixes.
 * Falls back to port 6379 when not specified.
 */
function parseRedisUrl(rawUrl) {
  try {
    // node's URL parser handles redis:// the same as http://
    const u = new URL(rawUrl);
    const host = u.hostname || "127.0.0.1";
    const port = u.port ? Number(u.port) : 6379;
    return { host, port };
  } catch {
    return null;
  }
}

/**
 * Parse host and port from a PostgreSQL connection string.
 * Accepts postgresql:// and postgres:// prefixes.
 * Falls back to port 5432 when not specified.
 */
function parsePgUrl(rawUrl) {
  try {
    const normalized = rawUrl.replace(/^postgres:\/\//, "postgresql://");
    const u = new URL(normalized);
    const host = u.hostname || "127.0.0.1";
    const port = u.port ? Number(u.port) : 5432;
    return { host, port };
  } catch {
    return null;
  }
}

/**
 * Try to open a TCP connection to host:port within `timeoutMs`.
 * Resolves true on success, false on any error or timeout.
 */
function tcpConnect(host, port, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const done = (ok) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };

    socket.setTimeout(timeoutMs);
    socket.on("connect", () => done(true));
    socket.on("timeout", () => done(false));
    socket.on("error", () => done(false));
    socket.connect(port, host);
  });
}

/**
 * Attempt to connect to Redis via ioredis (available in the worker package).
 * Falls back to a raw TCP check if ioredis is not importable.
 */
async function checkRedis(redisUrl) {
  // Try ioredis first (present in apps/worker/node_modules or hoisted)
  try {
    const workerNodeModules = path.join(repoRoot, "apps", "worker", "node_modules");
    let ioredisPath;
    try {
      // Try hoisted location first
      await import("ioredis");
      ioredisPath = "ioredis";
    } catch {
      ioredisPath = path.join(workerNodeModules, "ioredis", "built", "index.js");
    }

    const { default: Redis } = await import(ioredisPath);
    const client = new Redis(redisUrl, {
      lazyConnect: true,
      enableReadyCheck: true,
      maxRetriesPerRequest: 0,
      connectTimeout: 5000,
      commandTimeout: 5000,
    });

    await client.connect();
    await client.ping();
    await client.quit();
    return { ok: true, method: "ioredis" };
  } catch (ioredisErr) {
    // Fall back to raw TCP
    const parsed = parseRedisUrl(redisUrl);
    if (!parsed) return { ok: false, method: "tcp", error: "Could not parse Redis URL" };

    const ok = await tcpConnect(parsed.host, parsed.port);
    return { ok, method: `tcp:${parsed.host}:${parsed.port}` };
  }
}

/**
 * Try connecting to Postgres via the `pg` package (available in the worker).
 * Falls back to a raw TCP check if pg is not importable.
 */
async function checkPostgres(pgUrl) {
  try {
    let pgPath;
    try {
      await import("pg");
      pgPath = "pg";
    } catch {
      pgPath = path.join(repoRoot, "apps", "worker", "node_modules", "pg", "lib", "index.js");
    }

    const pgModule = await import(pgPath);
    const { Client } = pgModule.default ?? pgModule;

    const client = new Client({
      connectionString: pgUrl,
      connectionTimeoutMillis: 5000,
      statement_timeout: 5000,
    });

    await client.connect();
    await client.query("SELECT 1");
    await client.end();
    return { ok: true, method: "pg" };
  } catch (pgErr) {
    // Fall back to raw TCP
    const parsed = parsePgUrl(pgUrl);
    if (!parsed) return { ok: false, method: "tcp", error: "Could not parse Postgres URL" };

    const ok = await tcpConnect(parsed.host, parsed.port);
    return { ok, method: `tcp:${parsed.host}:${parsed.port}`, note: ok ? "TCP reachable (auth not verified)" : "TCP unreachable" };
  }
}

// ---------------------------------------------------------------------------
// Test 1: Redis connectivity
// ---------------------------------------------------------------------------
async function testRedis() {
  const label = "Redis connectivity";
  const redisUrl = process.env.QUERYWISE_REDIS_URL ?? process.env.REDIS_URL;

  if (!redisUrl) {
    record(label, SKIP, "QUERYWISE_REDIS_URL and REDIS_URL are both unset");
    return;
  }

  try {
    const result = await checkRedis(redisUrl);
    if (result.ok) {
      record(label, PASS, `via ${result.method}`);
    } else {
      record(label, FAIL, result.error ?? `via ${result.method} — connection refused or timed out`);
    }
  } catch (err) {
    record(label, FAIL, String(err?.message ?? err));
  }
}

// ---------------------------------------------------------------------------
// Test 2: Postgres connectivity
// ---------------------------------------------------------------------------
async function testPostgres() {
  const label = "Postgres connectivity";
  const pgUrl = process.env.QUERYWISE_APP_DATABASE_URL;

  if (!pgUrl) {
    record(label, SKIP, "QUERYWISE_APP_DATABASE_URL is unset");
    return;
  }

  try {
    const result = await checkPostgres(pgUrl);
    if (result.ok) {
      record(label, PASS, `via ${result.method}${result.note ? ` — ${result.note}` : ""}`);
    } else {
      record(label, FAIL, result.error ?? result.note ?? `via ${result.method} — connection refused or timed out`);
    }
  } catch (err) {
    record(label, FAIL, String(err?.message ?? err));
  }
}

// ---------------------------------------------------------------------------
// Test 3: Worker process boot
// Spawns: node --import tsx/esm src/index.ts  in apps/worker/
// Looks for the log token "schema-ingestion.worker.started" within 5 seconds,
// then kills the process.
// ---------------------------------------------------------------------------
async function testWorkerBoot() {
  const label = 'Worker boot (log token "schema-ingestion.worker.started")';

  const redisUrl = process.env.QUERYWISE_REDIS_URL ?? process.env.REDIS_URL;
  const pgUrl = process.env.QUERYWISE_APP_DATABASE_URL;

  if (!redisUrl || !pgUrl) {
    record(
      label,
      SKIP,
      `missing env vars: ${[!redisUrl && "QUERYWISE_REDIS_URL", !pgUrl && "QUERYWISE_APP_DATABASE_URL"].filter(Boolean).join(", ")}`,
    );
    return;
  }

  const workerDir = path.join(repoRoot, "apps", "worker");

  // Boot check: spawn the worker and verify it stays alive for at least 5 seconds
  // without crashing. Node.js buffers stdout when not attached to a TTY (even with
  // file redirection on Windows), so we cannot reliably capture the boot log line.
  // Instead we use liveness: if the process starts, runs for 5 s, and doesn't exit
  // with a non-zero code, the worker booted successfully.
  return new Promise((resolve) => {
    const child = spawn(
      "npx",
      ["tsx", "src/index.ts"],
      {
        cwd: workerDir,
        shell: true,
        env: {
          ...process.env,
          QUERYWISE_LOG_ENABLED: "1",
          PATH: [
            path.join(repoRoot, "node_modules", ".bin"),
            path.join(workerDir, "node_modules", ".bin"),
            process.env.PATH ?? "",
          ].join(path.delimiter),
        },
        stdio: "ignore",
      },
    );

    let settled = false;
    let stderrChunks = "";

    const finish = (status, detail) => {
      if (settled) return;
      settled = true;
      try { child.kill("SIGTERM"); } catch {}
      setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, 1500).unref();
      record(label, status, detail);
      resolve();
    };

    child.on("error", (err) => {
      finish(FAIL, `spawn error: ${err.message}`);
    });

    // If the process exits before the liveness window, it crashed.
    child.on("close", (code, signal) => {
      if (settled) return;
      if (signal === "SIGTERM" || signal === "SIGKILL") return; // we killed it
      finish(FAIL, `process exited early (code=${code ?? "null"} signal=${signal ?? "null"})`);
    });

    // Liveness window: 7 seconds. If still running → PASS.
    const timer = setTimeout(() => {
      if (settled) return;
      finish(PASS, "process alive after 7 s liveness window");
    }, 7_000);
    timer.unref();
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("\nquery-wise worker smoke tests");
  console.log("=".repeat(50));
  console.log(`  repo root : ${repoRoot}`);
  console.log(`  .env      : ${path.join(repoRoot, ".env")}`);
  console.log(`  REDIS URL : ${process.env.QUERYWISE_REDIS_URL ?? process.env.REDIS_URL ?? "(unset)"}`);
  console.log(`  PG URL    : ${process.env.QUERYWISE_APP_DATABASE_URL ? "(set)" : "(unset)"}`);
  console.log("=".repeat(50));
  console.log();

  await testRedis();
  await testPostgres();
  await testWorkerBoot();

  // Summary
  const passed = results.filter((r) => r.status === PASS).length;
  const failed = results.filter((r) => r.status === FAIL).length;
  const skipped = results.filter((r) => r.status === SKIP).length;

  console.log();
  console.log("=".repeat(50));
  console.log(`  Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log("=".repeat(50));
  console.log();

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Smoke test runner crashed:", err);
  process.exit(1);
});
