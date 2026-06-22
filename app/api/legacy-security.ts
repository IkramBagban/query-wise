import "server-only";

import { requireUser } from "@/lib/v2/auth";
import { AppError } from "@/lib/v2/dal/core";

export const LEGACY_PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };
export const LEGACY_MAX_BODY_BYTES = 2 * 1024 * 1024;

export class LegacyPayloadTooLargeError extends Error {
  constructor() {
    super("The request body exceeds the legacy endpoint limit.");
    this.name = "LegacyPayloadTooLargeError";
  }
}

export async function readLegacyJson(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > LEGACY_MAX_BODY_BYTES) {
    throw new LegacyPayloadTooLargeError();
  }
  if (!request.body) return null;

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > LEGACY_MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new LegacyPayloadTooLargeError();
    }
    chunks.push(value);
  }

  const body = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(body));
}

export async function requireLegacyUser(): Promise<
  { userId: string; error?: never } | { userId?: never; error: Response }
> {
  try {
    return await requireUser();
  } catch (error) {
    if (error instanceof AppError && error.code === "AUTHENTICATION_REQUIRED") {
      return {
        error: Response.json(
          { error: "Unauthorized" },
          { status: 401, headers: LEGACY_PRIVATE_HEADERS },
        ),
      };
    }
    throw error;
  }
}
