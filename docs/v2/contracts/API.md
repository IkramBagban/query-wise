# API Contract

## Route Handler Rules

- All Route Handlers run in the Node.js runtime when using application/customer
  databases.
- Validate JSON bodies, path params, query params, headers, and cursors.
- Private routes call `requireUser` and an owner/access-scoped service or DAL.
- Route Handlers return minimal DTOs and MUST NOT directly access application
  or customer databases.
- Private resource absence and cross-owner access return the same `404`.
- Responses use the error model in `ERRORS.md`.
- Private and public-share responses use `Cache-Control: private, no-store`.
- Next.js 16 dynamic route params are promises; handlers SHOULD use typed
  `RouteContext<"...">` after type generation.

## Common Response Shapes

```ts
interface ApiSuccess<T> {
  contractVersion: "querywise.v2";
  data: T;
}

interface MutationAck {
  contractVersion: "querywise.v2";
  data: { id: ResourceId; updatedAt: IsoDateTime };
}
```

Creation returns `201`, accepted asynchronous work returns `202`, successful
reads/mutations return `200`, and deletion returns `204`.

## Private Endpoints

| Method and route | Authorization | Request | Response |
| --- | --- | --- | --- |
| `GET /api/connections` | signed-in owner scope | cursor page | `CursorPage<ConnectionListItem>` |
| `POST /api/connections` | signed-in | name, provider, credential input | `ConnectionDto` |
| `GET /api/connections/[connectionId]` | owned connection | none | `ConnectionDto` |
| `PATCH /api/connections/[connectionId]` | owned connection | name and/or replacement credential | `ConnectionDto` |
| `DELETE /api/connections/[connectionId]` | owned connection | none | `204` |
| `POST /api/connections/[connectionId]/test` | owned connection | `idempotencyKey` | safe test result |
| `GET /api/connections/[connectionId]/schema` | owned connection | safe view options | canonical safe schema DTO |
| `POST /api/connections/[connectionId]/schema/refresh` | owned connection | `idempotencyKey` | `202` sync status |
| `GET /api/conversations` | signed-in owner scope | cursor page | compact page |
| `POST /api/conversations` | owned connection | `connectionId` | conversation DTO |
| `GET /api/conversations/[conversationId]` | conversation access | none | conversation DTO |
| `PATCH /api/conversations/[conversationId]` | owner | title/status | mutation ack |
| `DELETE /api/conversations/[conversationId]` | owner | none | `204` |
| `GET /api/conversations/[conversationId]/messages` | conversation access | cursor page | compact message page |
| `POST /api/query` | conversation access | `SubmitQueryRequest` | `202 QueryAcceptedResponse` or existing run |
| `GET /api/query-runs/[queryRunId]` | owner-scoped run | none | query-run DTO |
| `GET /api/query-runs/[queryRunId]/events` | owner-scoped run | SSE | query stream |
| `GET /api/dashboards` | signed-in owner/direct-view scope | cursor page | compact page |
| `POST /api/dashboards` | signed-in | name | dashboard DTO |
| `GET /api/dashboards/[dashboardId]` | dashboard view access | none | private dashboard DTO |
| `PATCH /api/dashboards/[dashboardId]` | owner edit access | name | mutation ack |
| `DELETE /api/dashboards/[dashboardId]` | owner | none | `204` |
| widget mutation routes | owner | bounded widget/layout input | private widget DTO/ack |
| share/grant management routes | owner | bounded share/grant input | owner-only share DTO |

Credential input is accepted only on connection create/update and is never
echoed. Query routes accept `conversationId`, never `connectionId` or a
connection URL. Schema routes accept `connectionId` in the path, never a URL.

## Public Endpoints

| Method and route | Authorization | Response |
| --- | --- | --- |
| `GET /api/public/shares/[token]` | active token; unlock if required | `PublicDashboardDto` |
| `POST /api/public/shares/[token]/unlock` | active token + rate-limited password | short-lived share unlock credential |

Public routes use `PUBLIC_SHARING.md` and do not expose private dashboard DTOs.

## Idempotent Mutations

Query submission, connection tests, schema refreshes, share creation, and
background-job enqueue operations require a client-generated idempotency key.
The service persists a canonical request fingerprint and applies the same
semantics as `QUERY_RUNS.md`: same key/same request returns the prior operation;
same key/different request returns `IDEMPOTENCY_KEY_REUSED`.

## API Ownership

| Layer | Owns |
| --- | --- |
| Route Handler | transport validation, auth entry, status/header mapping |
| server-only service | orchestration, capability checks, transactions |
| owner/access-scoped DAL | application DB authorization and DTO mapping |
| SQL adapter | customer DB connection, metadata, validation, execution |
| query generation strategy | dialect-aware SQL generation |
| sharing service | token/password verification and public DTO mapping |

No layer may return a broader record merely because a downstream caller is
currently server-side; every boundary returns the minimum contract required.

