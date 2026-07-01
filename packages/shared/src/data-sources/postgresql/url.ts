
import { z } from "zod";
import { AppError } from "../../dal/core";

const connectionStringSchema = z.string().trim().min(1).max(4096);

export interface ParsedPostgresUrl {
  connectionString: string;
  host: string;
  hostDisplay: string;
  port: number;
  databaseName: string;
  user: string;
  password: string;
}

export function parsePostgresUrl(input: string): ParsedPostgresUrl {
  const connectionString = connectionStringSchema.parse(input);
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new AppError("VALIDATION_FAILED", "A valid PostgreSQL connection URL is required.");
  }

  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new AppError("VALIDATION_FAILED", "Only PostgreSQL connection URLs are supported.");
  }
  if (!url.hostname || !url.username || !url.pathname || url.pathname === "/") {
    throw new AppError("VALIDATION_FAILED", "The connection URL must include host, user, and database.");
  }
  const port = url.port ? Number(url.port) : 5432;
  if (!Number.isInteger(port) || port !== 5432) {
    throw new AppError("DATA_SOURCE_TARGET_BLOCKED", "Only the approved PostgreSQL port is allowed.");
  }

  const sslMode = url.searchParams.get("sslmode")?.toLowerCase();
  if (sslMode !== "require" && sslMode !== "verify-full") {
    throw new AppError("VALIDATION_FAILED", "The connection URL must set sslmode=require or sslmode=verify-full.");
  }
  // QueryWise always pins the resolved public endpoint and verifies the
  // original hostname, so normalize provider-standard URLs to the strict mode.
  url.searchParams.set("sslmode", "verify-full");

  return {
    connectionString: url.toString(),
    host: url.hostname,
    hostDisplay: url.hostname,
    port,
    databaseName: decodeURIComponent(url.pathname.slice(1)),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };
}
