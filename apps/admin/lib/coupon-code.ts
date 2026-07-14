import { randomInt } from "node:crypto";

/**
 * Crockford base32 alphabet: unambiguous (no I, L, O, U). Pure/testable so the
 * entropy and normalization contracts (SPEC-12 §6.2) can be verified without a
 * DB or the server-action harness.
 */
export const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const COUPON_CODE_LENGTH = 8;

/** Generate an 8-char Crockford base32 code (~40 bits of entropy). */
export function generateCouponCode(length = COUPON_CODE_LENGTH): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CROCKFORD_ALPHABET[randomInt(CROCKFORD_ALPHABET.length)];
  }
  return out;
}

/** Canonical coupon code: trim surrounding whitespace, uppercase. Idempotent. */
export function normalizeCouponCode(raw: string): string {
  return raw.trim().toUpperCase();
}
