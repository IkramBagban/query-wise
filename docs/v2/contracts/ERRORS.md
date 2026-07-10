# Error Model Contract

## Wire Shape

```ts
interface ApiErrorResponse {
  contractVersion: "querywise.v2";
  error: {
    code: ApiErrorCode;
    message: string;
    retryable: boolean;
    requestId: string;
    fieldErrors?: Record<string, string[]>;
    retryAfterSeconds?: number;
    requiresPassword?: boolean;
  };
}
```

`message` is safe for the caller. Raw database/provider messages, stack traces,
SQL text, credentials, API keys, schema samples, token hashes, and internal
hostnames MUST NOT cross the wire.

## Stable Codes And HTTP Mapping

| Code | HTTP | Retryable | Meaning |
| --- | ---: | --- | --- |
| `AUTHENTICATION_REQUIRED` | 401 | no | no valid signed-in user |
| `RESOURCE_NOT_FOUND` | 404 | no | absent or not authorized private resource |
| `VALIDATION_FAILED` | 400 | no | invalid body/path/query input |
| `CONFLICT` | 409 | no | invariant/version conflict |
| `IDEMPOTENCY_KEY_REUSED` | 409 | no | key reused with different canonical request |
| `RATE_LIMITED` | 429 | yes | request rate exceeded |
| `QUERY_CONCURRENCY_LIMITED` | 429 | yes | per-user/global query concurrency exceeded |
| `DATA_SOURCE_CAPABILITY_UNSUPPORTED` | 422 | no | adapter lacks required capability |
| `DATA_SOURCE_UNAVAILABLE` | 503 | yes | source cannot be reached |
| `DATA_SOURCE_AUTHENTICATION_FAILED` | 422 | no | source credentials rejected |
| `DATA_SOURCE_TARGET_BLOCKED` | 422 | no | network/SSRF policy rejection |
| `SCHEMA_SNAPSHOT_UNAVAILABLE` | 409 | yes | no usable snapshot yet |
| `QUERY_GENERATION_FAILED` | 502 | yes | LLM generation failed |
| `QUERY_VALIDATION_BLOCKED` | 422 | no | generated SQL violates safety policy |
| `QUERY_EXECUTION_TIMEOUT` | 504 | yes | execution exceeded timeout |
| `QUERY_EXECUTION_FAILED` | 422 | conditional | safe source execution failure |
| `RESULT_LIMIT_EXCEEDED` | 413 | no | serialized bounded payload still too large |
| `SHARE_PASSWORD_REQUIRED` | 401 | no | valid share requires unlock |
| `SHARE_PASSWORD_INVALID` | 401 | no | generic invalid unlock response |
| `SHARE_EXPIRED` | 410 | no | valid public share token has expired |
| `SHARE_REVOKED_OR_NOT_FOUND` | 404 | no | absent, revoked, disabled, or deleted share |
| `QUOTA_EXCEEDED_DAILY` | 429 | yes | daily question cap reached (resets next UTC midnight) |
| `QUOTA_EXCEEDED_MONTHLY` | 429 | yes | monthly question cap reached (resets 1st UTC) |
| `QUOTA_EXCEEDED_SCHEMA_REFRESH` | 429 | yes | daily manual schema re-sync cap reached |
| `PLAN_LIMIT_CONNECTIONS` | 403 | no | non-demo connection cap reached for the plan |
| `PLAN_LIMIT_DASHBOARDS` | 403 | no | dashboard cap reached for the plan |
| `PLAN_LIMIT_SHARES` | 403 | no | active public share-link cap reached for the plan |
| `PLAN_FEATURE_PASSWORD_SHARES` | 403 | no | password-protected shares require Pro |
| `PLAN_FEATURE_MODEL` | 403 | no | model tier not allowed on the plan (reserved) |
| `ACCOUNT_DISABLED` | 403 | no | account disabled by an operator; plan-enforced mutations blocked, reads allowed |
| `INTERNAL_ERROR` | 500 | yes | unexpected server failure |

`ACCOUNT_DISABLED` is set when `UserPlan.status = disabled` (SPEC-08 §6.4). The
admin panel suspend action is the primary path; product enforcement rejects
question accept, connection/dashboard/share create, and schema refresh with this
code while allowing reads and existing public shares. Reactivate restores
`status = active`.

Quota codes (`QUOTA_EXCEEDED_*`) include `retryAfterSeconds` (seconds until the
window resets in UTC) when computable. Plan-limit and feature codes are not
retryable — the caller must free a slot, upgrade, or contact support. Windows are
UTC: day resets at `00:00Z`, month on the 1st at `00:00Z`.


Cross-owner private access MUST map to `RESOURCE_NOT_FOUND`, never `403`.
Public share password-required responses include `requiresPassword: true`.

## Internal Error Requirements

Internal typed errors SHOULD include:

```ts
interface InternalErrorContext {
  code: ApiErrorCode;
  requestId: string;
  operation: string;
  resourceType?: string;
  resourceId?: string;
  providerId?: DataSourceProviderId;
  retryable: boolean;
  cause?: unknown; // server-only
}
```

Observability records MAY contain safe SQL hashes and counts, but MUST NOT
contain SQL text, row values, secrets, API keys, share tokens/passwords, or raw
provider errors before redaction.

## SSE Errors

After an SSE response starts, HTTP status remains `200`. Terminal failure is:

```ts
interface QueryErrorEvent {
  contractVersion: "querywise.v2";
  queryRunId: ResourceId;
  sequence: number;
  error: ApiErrorResponse["error"];
}
```

Exactly one terminal SSE event (`completed` or `failed`) is emitted. The
persisted query-run terminal state is authoritative if transport disconnects.
