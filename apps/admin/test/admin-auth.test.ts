/**
 * SPEC-08 §11.1 unit tests: allowlist parsing + requireAdmin matrix.
 * Run: pnpm --filter @query-wise/admin test
 */
import assert from "node:assert/strict";
import {
  AdminAccessError,
  getAdminAllowlist,
  requireAdmin,
  type AuthFn,
} from "../lib/admin-auth";

let passed = 0;

function test(name: string, fn: () => void | Promise<void>): void {
  const run = async () => {
    try {
      await fn();
      passed += 1;
      console.log(`  ok  ${name}`);
    } catch (error) {
      console.error(`FAIL  ${name}`);
      throw error;
    }
  };
  // Queue synchronously; main drains via top-level await pattern below.
  queue.push(run);
}

const queue: Array<() => Promise<void>> = [];

// ── Allowlist parsing ────────────────────────────────────────────────────────

test("allowlist: unset env → empty", () => {
  assert.deepEqual(getAdminAllowlist({}), []);
});

test("allowlist: empty string → empty", () => {
  assert.deepEqual(getAdminAllowlist({ ADMIN_CLERK_USER_IDS: "" }), []);
});

test("allowlist: whitespace only → empty", () => {
  assert.deepEqual(getAdminAllowlist({ ADMIN_CLERK_USER_IDS: "  ,  , " }), []);
});

test("allowlist: single id", () => {
  assert.deepEqual(getAdminAllowlist({ ADMIN_CLERK_USER_IDS: "user_abc" }), [
    "user_abc",
  ]);
});

test("allowlist: multiple ids with surrounding whitespace", () => {
  assert.deepEqual(
    getAdminAllowlist({
      ADMIN_CLERK_USER_IDS: " user_a ,user_b,  user_c  ",
    }),
    ["user_a", "user_b", "user_c"],
  );
});

// ── requireAdmin matrix ──────────────────────────────────────────────────────

const noSession: AuthFn = async () => ({ userId: null });
const session = (id: string): AuthFn => async () => ({ userId: id });

test("requireAdmin: env unset → ADMIN_NOT_CONFIGURED", async () => {
  await assert.rejects(
    () => requireAdmin({ env: {}, getAuth: session("user_any") }),
    (err: unknown) => {
      assert.ok(err instanceof AdminAccessError);
      assert.equal(err.code, "ADMIN_NOT_CONFIGURED");
      return true;
    },
  );
});

test("requireAdmin: empty allowlist → ADMIN_NOT_CONFIGURED (incl. development)", async () => {
  // Fail closed has no NODE_ENV bypass: empty allowlist rejects even when
  // the injected env claims development.
  await assert.rejects(
    () =>
      requireAdmin({
        env: { ADMIN_CLERK_USER_IDS: "", NODE_ENV: "development" },
        getAuth: session("user_dev"),
      }),
    (err: unknown) => {
      assert.ok(err instanceof AdminAccessError);
      assert.equal(err.code, "ADMIN_NOT_CONFIGURED");
      return true;
    },
  );
});

test("requireAdmin: no session → ADMIN_FORBIDDEN", async () => {
  await assert.rejects(
    () =>
      requireAdmin({
        env: { ADMIN_CLERK_USER_IDS: "user_admin" },
        getAuth: noSession,
      }),
    (err: unknown) => {
      assert.ok(err instanceof AdminAccessError);
      assert.equal(err.code, "ADMIN_FORBIDDEN");
      return true;
    },
  );
});

test("requireAdmin: session not in list → ADMIN_FORBIDDEN", async () => {
  await assert.rejects(
    () =>
      requireAdmin({
        env: { ADMIN_CLERK_USER_IDS: "user_admin" },
        getAuth: session("user_other"),
      }),
    (err: unknown) => {
      assert.ok(err instanceof AdminAccessError);
      assert.equal(err.code, "ADMIN_FORBIDDEN");
      return true;
    },
  );
});

test("requireAdmin: session in list → returns adminClerkUserId", async () => {
  const result = await requireAdmin({
    env: { ADMIN_CLERK_USER_IDS: "user_a,user_b" },
    getAuth: session("user_b"),
  });
  assert.deepEqual(result, { adminClerkUserId: "user_b" });
});

test("requireAdmin: undefined userId treated as forbidden", async () => {
  await assert.rejects(
    () =>
      requireAdmin({
        env: { ADMIN_CLERK_USER_IDS: "user_admin" },
        getAuth: async () => ({ userId: undefined }),
      }),
    (err: unknown) => {
      assert.ok(err instanceof AdminAccessError);
      assert.equal(err.code, "ADMIN_FORBIDDEN");
      return true;
    },
  );
});

// Drain queue
async function main() {
  console.log("admin-auth tests\n");
  for (const run of queue) {
    await run();
  }
  console.log(`\n${passed} passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
