# Public Share Safe DTO Contract

## Separate Trust Path

Public share routes resolve a share token through a sharing service and map a
dedicated allowlist DTO. They MUST NOT call a private dashboard DTO mapper and
then remove fields. Public viewers can trigger bounded, server-side refreshes
of saved dashboard widget SQL, but they never receive SQL text, schema context,
query-run internals, connection details, or source credentials.

## Public DTO

```ts
interface PublicDashboardDto {
  contractVersion: "querywise.v2";
  dashboard: {
    name: string;
    updatedAt: IsoDateTime;
    widgets: PublicDashboardWidgetDto[];
  };
  share: {
    expiresAt: IsoDateTime | null;
  };
}

interface PublicDashboardWidgetDto {
  id: ResourceId;
  title: string;
  chartConfig: PublicChartConfig;
  layout: { schemaVersion: 1; x: number; y: number; w: number; h: number };
  result: BoundedResultPreview | null;
  error: { code: string; message: string } | null;
}
```

`PublicChartConfig` is an allowlist of rendering fields and validated column
references. `BoundedResultPreview` follows `PAGINATION_AND_BOUNDS.md`. A widget
with `result: null` MUST include a safe public rendering error and MUST NOT
fall back to stale snapshot data.

## Forbidden Fields

Public responses MUST NOT expose:

- dashboard ID, owner user ID/email/profile, access grants, or owner controls
- share ID, raw token, token hash, password hash, unlock-token internals
- connection ID/name/host/database/provider-private details or credentials
- conversation/message/query-run IDs or history
- SQL/query definitions, SQL preview, schema metadata, or schema samples
- internal errors, audit fields, model/provider configuration, or API keys

Widget IDs are allowed only as opaque render keys and MUST NOT authorize private
widget endpoints.

## Link And Unlock Semantics

- Raw share tokens contain at least 192 bits of entropy and are shown only at
  creation time. Persist a token hash, plus an encrypted token copy only for
  owner-side link management of newly generated links.
- Passwords are persisted only as strong password hashes.
- `GET /api/public/shares/[token]` returns the DTO for an active unprotected
  share, `SHARE_PASSWORD_REQUIRED` for a protected share, or the generic public
  not-found response.
- `POST /api/public/shares/[token]/unlock` is rate-limited and returns a
  short-lived, share-scoped, revocable unlock credential.
- Unlock credentials MUST NOT grant private dashboard API access.
- Revocation, disablement, expiry, dashboard deletion, or password change
  invalidates unlock credentials immediately or through a checked share
  version.
- Public responses use `Cache-Control: private, no-store`.
- Public widget refreshes execute only saved widget `queryDefinition` values
  that still match the original saved query run. Execution remains read-only,
  row/byte bounded, and server-side using the dashboard owner's credentials.
- Successful public dashboard loads increment the share link view count and
  last-viewed timestamp.

## Snapshot Bounds

A public dashboard response MUST satisfy all of:

| Measure | Bound |
| --- | ---: |
| widgets per response | 50 |
| preview rows per widget | 100 |
| preview columns per widget | 50 |
| serialized bytes per widget preview | 256 KiB |
| serialized bytes per public dashboard response | 2 MiB |

Dashboard mutation MUST reject or require pagination/redesign before these
bounds are exceeded; the public route MUST NOT expose SQL or unbounded rows.
