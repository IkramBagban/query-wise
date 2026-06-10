# Query Run State Machine And Idempotency Contract

## Submission

```ts
interface SubmitQueryRequest {
  conversationId: ResourceId;
  question: string;          // trimmed, 1..500 characters
  provider: LlmProviderId;
  model: string;             // 1..120 characters
  apiKey: string;            // transport-only, never persisted/logged
  idempotencyKey: string;    // client-generated UUID, required
}
```

The client MUST NOT send history, connection ID, connection URL, user ID,
schema, SQL, or a query-run ID. The server resolves all durable context from the
authorized conversation.

## Persisted Query Run

```ts
type QueryRunStatus =
  | "accepted"
  | "preparing"
  | "generating"
  | "validating"
  | "executing"
  | "persisting"
  | "succeeded"
  | "failed"
  | "cancelled";

interface QueryRunRecord extends OwnedResource {
  conversationId: ResourceId;
  connectionId: ResourceId;
  triggeringMessageId: ResourceId;
  responseMessageId: ResourceId | null;
  idempotencyKey: string;
  requestFingerprint: string;
  status: QueryRunStatus;
  statusVersion: number;
  providerId: DataSourceProviderId;
  dialectId: SqlDialectId;
  generatedQuery: ProviderQuery | null;
  resultPreview: BoundedResultPreview | null;
  returnedRowCount: number | null;
  totalRowCount: number | null;
  truncated: boolean | null;
  executionTimeMs: number | null;
  generatedAt: IsoDateTime | null;
  startedAt: IsoDateTime | null;
  finishedAt: IsoDateTime | null;
  errorCode: string | null;
  errorMessage: string | null; // safe owner-facing message only
}
```

Unique constraint: `(ownerUserId, conversationId, idempotencyKey)`.
`requestFingerprint` is a server hash of canonical request fields excluding
`apiKey`. The API key MUST never be persisted, included in the fingerprint, or
logged.

## State Machine

```text
accepted -> preparing -> generating -> validating -> executing -> persisting -> succeeded
    |          |            |             |             |           |
    +----------+------------+-------------+-------------+-----------+-> failed
    |
    +-> cancelled
```

- Status transitions are forward-only and increment `statusVersion`.
- `succeeded`, `failed`, and `cancelled` are terminal.
- `generatedQuery` is set no later than `validating`.
- `startedAt` is set on first transition out of `accepted`.
- `finishedAt` is non-null exactly for terminal states.
- `succeeded` requires an assistant response message and either a bounded result
  preview or a conversation-only response marker.
- `failed` requires a persisted safe error and assistant failure message.
- Cancellation is best-effort and only valid before a terminal state.

## Transaction Boundaries

1. In one transaction: authorize conversation, create/reuse idempotent query
   run, and create the user message.
2. Perform LLM and customer-database work outside the application DB
   transaction.
3. In one transaction: persist terminal query-run fields, assistant message,
   and conversation activity timestamp.

A worker crash may leave a non-terminal run. A recovery job marks runs stale
after an implementation-defined lease (recommended 5 minutes) and retries or
fails them without creating a second user message.

## Idempotency Semantics

- First valid request creates the run and returns `202`.
- Same key plus same fingerprint returns the existing run and current state;
  it MUST NOT call the LLM or database again.
- Same key plus different fingerprint returns `IDEMPOTENCY_KEY_REUSED`.
- Retrying a failed run requires a new idempotency key. The original run remains
  immutable.
- Query-run reads are owner/conversation scoped.

## Response And Streaming

```ts
interface QueryAcceptedResponse {
  contractVersion: "querywise.v2";
  queryRunId: ResourceId;
  status: QueryRunStatus;
  statusVersion: number;
}

type QueryStreamEventType =
  | "status" | "text-delta" | "sql-preview" | "query-stats"
  | "completed" | "failed";

interface QueryStreamEnvelope<T> {
  contractVersion: "querywise.v2";
  queryRunId: ResourceId;
  sequence: number;
  type: QueryStreamEventType;
  occurredAt: IsoDateTime;
  data: T;
}
```

Event sequence numbers strictly increase per run. Progress events are advisory;
the persisted run DTO is authoritative. SQL preview events are owner-only and
capability/dialect-aware per `SQL_DATA_SOURCE.md`.

## Measurable Query Fields

Successful runs record:

- generation duration, validation duration, execution duration, total duration
- returned row count, known total row count or null, truncation flag
- preview row count and serialized preview bytes
- provider ID, dialect ID, model identifier, schema snapshot ID/hash
- safe error code on failure

Metrics and audit logs MUST NOT include API keys, credentials, SQL text, or row
values. A keyed/salted SQL fingerprint MAY be recorded.

