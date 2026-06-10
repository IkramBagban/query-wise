# Pagination And Bounded Result Contracts

## Cursor Pagination

```ts
interface PageRequest {
  cursor?: string;
  limit?: number;
}

interface CursorPage<T> {
  contractVersion: "querywise.v2";
  items: T[];
  pageInfo: {
    nextCursor: string | null;
    hasMore: boolean;
    limit: number;
  };
}
```

- Cursors are opaque, URL-safe, signed/versioned, and scoped to endpoint,
  authenticated principal, filters, and sort order.
- Default limit is `25`; maximum is `100`.
- Invalid, expired, or scope-mismatched cursors return `VALIDATION_FAILED`.
- Pagination uses deterministic keyset ordering, never offset pagination.
- The cursor encodes the final sort tuple, including `id` as tie-breaker.
- List endpoints return compact DTOs and MUST NOT include result rows, full
  messages, SQL, schema snapshots, credentials, or share secrets.

## Required Sort Orders

| Collection | Order |
| --- | --- |
| conversations | `lastActivityAt DESC, id DESC` |
| messages | `sequence ASC, id ASC` |
| dashboards | `updatedAt DESC, id DESC` |
| connections | `updatedAt DESC, id DESC` |
| audit events | `createdAt DESC, id DESC` |
| dashboard shares/grants | `createdAt DESC, id DESC` |

## Result Vocabulary

```ts
interface BoundedResultPreview {
  schemaVersion: 1;
  columns: ResultColumn[];
  rows: Record<string, JsonValue>[];
  previewRowCount: number;
  returnedRowCount: number;
  totalRowCount: number | null;
  truncated: boolean;
  bytes: number;
}
```

- `previewRowCount === rows.length`.
- `previewRowCount <= returnedRowCount`.
- `returnedRowCount` is the number returned by the adapter after its hard cap.
- `totalRowCount` is null unless already known without an additional expensive
  query.
- `truncated` is true when known data exists beyond the preview or adapter
  result.
- `bytes` is measured from the persisted/transport JSON representation.
- Values MUST be JSON-safe; non-finite numbers, binary values, and unsupported
  native types require explicit canonical serialization.

## V2 Bounds

| Surface | Default | Hard maximum |
| --- | ---: | ---: |
| query execution returned rows | 500 | 500 |
| persisted query-run preview rows | 100 | 100 |
| dashboard widget snapshot rows | 100 | 100 |
| public widget preview rows | 100 | 100 |
| columns in persisted/public preview | 50 | 50 |
| persisted preview bytes | 256 KiB | 256 KiB |
| question length | 500 chars | 500 chars |
| message content | 8,000 chars | 8,000 chars |
| conversation title | 120 chars | 120 chars |
| dashboard/widget title | 120 chars | 120 chars |
| SQL text persisted owner-side | 100 KiB | 100 KiB |

When execution returns more than 100 rows, only the first 100 are persisted in
the preview. The full bounded 500-row response MAY be returned to the active
owner request if the serialized response remains within 2 MiB; otherwise return
the preview and mark it truncated. Unrestricted exports require a future
asynchronous export contract and are out of scope.

## Schema And History Bounds

- Query generation context selects relevant canonical metadata; it MUST NOT
  blindly send an unbounded full schema to the LLM.
- Conversation context is server-selected and bounded by both message count
  (recommended 20 recent relevant messages) and serialized/token budget.
- Schema/list endpoints paginate or return explicitly bounded summaries.
- Bounds are enforced server-side even when a client requests larger values.

