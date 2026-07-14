import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { withAppDbTransaction } from "@query-wise/shared/app-db";
import { AppError } from "@query-wise/shared/dal/core";

/**
 * SPEC-12 §5.1: coupon codes are guessable bearer secrets, so redemption is
 * rate-limited. This mirrors the sharing password limiter
 * (`apps/web/lib/sharing/rate-limit.ts`, ADR-004) but with a shorter window and
 * higher ceiling, and reuses the generic `v2_share_password_attempts`
 * counter table (key_hash / attempt_count / resets_at) rather than adding a new
 * one. Keys are namespaced (`coupon:redeem:...`) so buckets never collide with
 * share-unlock attempts.
 */
const WINDOW_SECONDS = 60;
// Per-user ceiling. The IP bucket uses a larger multiple to blunt distributed
// guessing without punishing a shared NAT / office egress.
const PER_USER_MAX = 10;
const PER_IP_MAX = 30;

function keyHash(key: string): string {
  return createHash("sha256").update(key).digest("base64url");
}

async function consume(key: string, max: number): Promise<void> {
  await withAppDbTransaction(async (tx) => {
    const [attempt] = await tx.$queryRaw<{ attemptCount: number }[]>(Prisma.sql`
      INSERT INTO v2_share_password_attempts (id, key_hash, attempt_count, resets_at)
      VALUES (${randomUUID()}::uuid, ${keyHash(key)}, 1, now() + (${WINDOW_SECONDS} * interval '1 second'))
      ON CONFLICT (key_hash) DO UPDATE SET
        attempt_count = CASE
          WHEN v2_share_password_attempts.resets_at <= now() THEN 1
          ELSE v2_share_password_attempts.attempt_count + 1
        END,
        resets_at = CASE
          WHEN v2_share_password_attempts.resets_at <= now() THEN now() + (${WINDOW_SECONDS} * interval '1 second')
          ELSE v2_share_password_attempts.resets_at
        END,
        updated_at = now()
      RETURNING attempt_count AS "attemptCount"
    `);
    if (!attempt || attempt.attemptCount > max) {
      throw new AppError(
        "RATE_LIMITED",
        "Too many coupon attempts. Please wait a minute and try again.",
        true,
      );
    }
  });
}

/**
 * Gate one redemption attempt. Consumes both a per-user and a coarse per-IP
 * bucket; either exhaustion raises RATE_LIMITED (429). Call before touching the
 * coupon tables so a burst of guesses cannot enumerate codes.
 */
export async function consumeCouponRedemptionAttempt(
  userId: string,
  ipScope: string,
): Promise<void> {
  await consume(`coupon:redeem:${userId}`, PER_USER_MAX);
  await consume(`coupon:redeem:ip:${ipScope}`, PER_IP_MAX);
}
