import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { getAppDb, withAppDbTransaction } from "@/lib/v2/app-db";
import { AppError } from "@/lib/v2/dal/core";

const WINDOW_MINUTES = 15;
const MAX_ATTEMPTS = 5;

function keyHash(key: string): string {
  return createHash("sha256").update(key).digest("base64url");
}

export async function consumePasswordAttempts(keys: string[]): Promise<void> {
  await withAppDbTransaction(async (tx) => {
    for (const key of keys) {
      const [attempt] = await tx.$queryRaw<{ attemptCount: number }[]>(Prisma.sql`
        INSERT INTO v2_share_password_attempts (id, key_hash, attempt_count, resets_at)
        VALUES (${randomUUID()}::uuid, ${keyHash(key)}, 1, now() + (${WINDOW_MINUTES} * interval '1 minute'))
        ON CONFLICT (key_hash) DO UPDATE SET
          attempt_count = CASE
            WHEN v2_share_password_attempts.resets_at <= now() THEN 1
            ELSE v2_share_password_attempts.attempt_count + 1
          END,
          resets_at = CASE
            WHEN v2_share_password_attempts.resets_at <= now() THEN now() + (${WINDOW_MINUTES} * interval '1 minute')
            ELSE v2_share_password_attempts.resets_at
          END,
          updated_at = now()
        RETURNING attempt_count AS "attemptCount"
      `);
      if (!attempt || attempt.attemptCount > MAX_ATTEMPTS) {
        throw new AppError("RATE_LIMITED", "Too many password attempts. Try again later.", true);
      }
    }
  });
}

export async function clearPasswordAttempts(keys: string[]): Promise<void> {
  await getAppDb().sharePasswordAttempt.deleteMany({
    where: { keyHash: { in: keys.map(keyHash) } },
  });
}
