import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { ClerkUserId, JsonValue } from "@/types/v2";
import { AppError } from "./errors";

export const DEFAULT_PAGE_LIMIT = 25;
export const MAX_PAGE_LIMIT = 100;
interface CursorEnvelope { version: 1; endpoint: string; principal: ClerkUserId; sort: JsonValue[]; expiresAt: number }

function key(): Buffer {
  const value = process.env.QUERYWISE_CURSOR_SIGNING_KEY;
  if (!value) throw new Error("QUERYWISE_CURSOR_SIGNING_KEY is not configured.");
  const decoded = Buffer.from(value, "base64");
  if (decoded.length < 32) throw new Error("QUERYWISE_CURSOR_SIGNING_KEY must decode to at least 32 bytes.");
  return decoded;
}
function signature(payload: string) { return createHmac("sha256", key()).update(payload).digest("base64url"); }
export function normalizePageLimit(limit?: number): number {
  if (limit == null) return DEFAULT_PAGE_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_LIMIT) throw new AppError("VALIDATION_FAILED", `Page limit must be between 1 and ${MAX_PAGE_LIMIT}.`);
  return limit;
}
export function encodeCursor(endpoint: string, principal: ClerkUserId, sort: JsonValue[], ttlSeconds = 86400): string {
  if (!endpoint || !principal || !Number.isFinite(ttlSeconds) || ttlSeconds <= 0 || ttlSeconds > 604800) {
    throw new AppError("VALIDATION_FAILED", "The pagination cursor parameters are invalid.");
  }
  const payload = Buffer.from(JSON.stringify({ version: 1, endpoint, principal, sort, expiresAt: Date.now() + ttlSeconds * 1000 } satisfies CursorEnvelope)).toString("base64url");
  return `${payload}.${signature(payload)}`;
}
export function decodeCursor(cursor: string, endpoint: string, principal: ClerkUserId): JsonValue[] {
  try {
    if (cursor.length > 4096) throw new Error();
    const parts = cursor.split(".");
    if (parts.length !== 2) throw new Error();
    const [payload, supplied] = parts;
    if (!payload || !supplied) throw new Error();
    const expected = signature(payload);
    if (supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) throw new Error();
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as CursorEnvelope;
    if (parsed.version !== 1 || parsed.endpoint !== endpoint || parsed.principal !== principal || parsed.expiresAt < Date.now() || !Array.isArray(parsed.sort)) throw new Error();
    return parsed.sort;
  } catch {
    throw new AppError("VALIDATION_FAILED", "The pagination cursor is invalid or expired.");
  }
}
