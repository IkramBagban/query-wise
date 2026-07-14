/**
 * SPEC-12 §11.1: coupon code generation (entropy/alphabet) and normalization.
 * Pure — no DB, no server-action harness.
 */
import assert from "node:assert/strict";
import {
  CROCKFORD_ALPHABET,
  COUPON_CODE_LENGTH,
  generateCouponCode,
  normalizeCouponCode,
} from "../lib/coupon-code";

let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

console.log("coupon-code tests\n");

test("alphabet excludes ambiguous I, L, O, U and is 32 chars", () => {
  assert.equal(CROCKFORD_ALPHABET.length, 32);
  for (const c of ["I", "L", "O", "U"]) {
    assert.equal(CROCKFORD_ALPHABET.includes(c), false, `must exclude ${c}`);
  }
});

test("generated codes are 8 chars from the alphabet", () => {
  for (let i = 0; i < 200; i++) {
    const code = generateCouponCode();
    assert.equal(code.length, COUPON_CODE_LENGTH);
    for (const ch of code) {
      assert.ok(CROCKFORD_ALPHABET.includes(ch), `unexpected char ${ch}`);
    }
  }
});

test("generated codes are not trivially colliding", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 500; i++) seen.add(generateCouponCode());
  // 40 bits of entropy → 500 draws should be essentially all unique.
  assert.ok(seen.size > 490, `too many collisions: ${seen.size}/500`);
});

test("normalization trims + uppercases and is idempotent", () => {
  assert.equal(normalizeCouponCode("  launch50 "), "LAUNCH50");
  assert.equal(normalizeCouponCode("LAUNCH50"), "LAUNCH50");
  assert.equal(
    normalizeCouponCode(normalizeCouponCode(" abc ")),
    normalizeCouponCode(" abc "),
  );
});

console.log(`\n${passed} passed`);
