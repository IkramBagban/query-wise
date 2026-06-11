# W2-CONV

## Implemented

- Durable owner-scoped conversation create/list/read/update/archive/delete and message cursor pagination.
- Idempotent durable query runs with persisted user message before external work, terminal assistant message/run persistence, bounded previews, SSE envelopes, and best-effort cancellation.
- V2 query orchestration resolves history, connection secret, schema snapshot, validation, and execution server-side through W1-DATA services. Query requests accept `conversationId`, never connection URLs/history/schema.

## Integration

- Consumes C1 `574ebb4`, C2 `52bf8ec`, and the current W1-DATA service surface.
- Reuses legacy LLM/chart behavior through read-only imports.
- No API keys, decrypted credentials, or unrestricted result sets are persisted.

## Verification

- Owned paths: no TypeScript diagnostics.
- Full build/typecheck may still be blocked by concurrent work outside W2-CONV ownership.
