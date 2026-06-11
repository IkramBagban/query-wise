# Work Log: W2-DASH

## Implementation

- Added durable Prisma-backed multiple-dashboard CRUD and owner/direct-grant view
  listing.
- Added bounded snapshot widget create/update/delete and atomic batch layout
  persistence. Widget ordering is represented by persisted layout coordinates.
- Added owner-managed public/password links and direct user/email grants.
- Raw public tokens use 256 bits of entropy and only SHA-256 hashes are stored.
  Passwords use Node `scrypt`; unlocks use short-lived HMAC-signed,
  share/version-scoped HttpOnly cookies.
- Public responses are built through a dedicated allowlist mapper and enforce
  widget, row, column, preview-byte, and response-byte limits.
- Password attempts use an isolated bounded in-process limiter as the initial
  implementation; replace `lib/v2/sharing/rate-limit.ts` with a distributed
  atomic store before multi-instance production rollout.

## Current Schema Tradeoffs

- Pending email grants are stored as namespaced SHA-256 email digests in the
  existing `recipient_user_id` column. Existing Clerk users resolve to Clerk
  user IDs immediately. A future reconciliation worker is required to convert
  pending digests after signup.
- The current share-link schema has no durable idempotency-key field, so share
  creation cannot implement the published durable idempotency contract without
  a coordinated schema change.

## Verification

- Run `npx tsc --noEmit`.
- Run `npm run build`.
