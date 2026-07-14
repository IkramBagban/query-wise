/**
 * SPEC-13 §4: the shared deleted-connection decision used by BOTH the read path
 * (getConversation → connectionDeleted flag) and the write/execute path
 * (acceptQuerySubmission → CONNECTION_DELETED). Proves reads degrade to a flag
 * while writes hard-reject with the 410 code.
 */
import assert from "node:assert";
import { AppError } from "@query-wise/shared/dal/core";
import { assertConnectionNotDeleted, isConnectionDeleted } from "./deleted-guard";

function runTests() {
  console.log("Running deleted-connection guard tests...");

  const active = { deletedAt: null };
  const deleted = { deletedAt: new Date("2026-07-14T00:00:00Z") };

  // Read-path flag.
  assert.strictEqual(isConnectionDeleted(active), false, "active connection → not deleted");
  assert.strictEqual(isConnectionDeleted(deleted), true, "soft-deleted connection → deleted");

  // Write path: active connection passes silently.
  assert.doesNotThrow(() => assertConnectionNotDeleted(active), "active connection must not throw");

  // Write path: deleted connection throws the exact 410 code.
  try {
    assertConnectionNotDeleted(deleted);
    assert.fail("expected CONNECTION_DELETED throw");
  } catch (error) {
    assert.ok(error instanceof AppError, `expected AppError, got ${error}`);
    assert.strictEqual((error as AppError).code, "CONNECTION_DELETED");
  }

  console.log("✓ deleted-connection guard tests passed");
}

runTests();
