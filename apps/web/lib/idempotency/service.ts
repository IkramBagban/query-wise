import "server-only";

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { getAppDb, withAppDbTransaction } from "@query-wise/shared/app-db";
import { AppError } from "@query-wise/shared/dal/core";
import { createResourceId } from "@query-wise/shared/domain";

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1_000;

type IdempotentOperationInput<T> = {
  ownerUserId: string;
  operation: string;
  idempotencyKey: string;
  requestFingerprint: string;
  execute: () => Promise<T>;
};

export function idempotencyFingerprint(parts: readonly unknown[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

function jsonRoundTrip<T>(value: T): { value: T; json: Prisma.InputJsonValue } {
  const normalized = JSON.parse(JSON.stringify(value)) as T;
  return { value: normalized, json: normalized as Prisma.InputJsonValue };
}

export async function executeIdempotently<T>(input: IdempotentOperationInput<T>): Promise<T> {
  const claimed = await withAppDbTransaction(async (tx) => {
    // The short advisory lock makes claim/replay decisions atomic without holding a
    // database transaction open across the external operation itself.
    const lockKey = `idempotency:${input.ownerUserId}:${input.operation}:${input.idempotencyKey}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

    let existing = await tx.idempotencyRecord.findUnique({
      where: {
        ownerUserId_operation_idempotencyKey: {
          ownerUserId: input.ownerUserId,
          operation: input.operation,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (existing && existing.expiresAt <= new Date()) {
      await tx.idempotencyRecord.delete({ where: { id: existing.id } });
      existing = null;
    }
    if (existing) {
      if (existing.requestFingerprint !== input.requestFingerprint) {
        throw new AppError("IDEMPOTENCY_KEY_REUSED", "The idempotency key was already used for a different request.");
      }
      if (existing.response !== null) {
        return { replay: existing.response as T, recordId: existing.id };
      }
      throw new AppError("CONFLICT", "The idempotent operation is still in progress.", true);
    }

    const record = await tx.idempotencyRecord.create({
      data: {
        id: createResourceId(),
        ownerUserId: input.ownerUserId,
        operation: input.operation,
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: input.requestFingerprint,
        expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
      },
    });
    return { replay: null, recordId: record.id };
  });

  if (claimed.replay !== null) return claimed.replay;

  try {
    const result = jsonRoundTrip(await input.execute());
    await getAppDb().idempotencyRecord.update({
      where: { id: claimed.recordId },
      data: { response: result.json },
    });
    return result.value;
  } catch (error) {
    // A failed attempt may be retried with the same key; successful responses are
    // retained so exact retries never repeat the external side effect.
    await getAppDb().idempotencyRecord.deleteMany({
      where: { id: claimed.recordId, response: { equals: Prisma.DbNull } },
    }).catch(() => undefined);
    throw error;
  }
}
