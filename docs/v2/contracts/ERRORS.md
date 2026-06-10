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
| `SHARE_REVOKED_OR_NOT_FOUND` | 404 | no | absent, revoked, disabled, or expired share |
| `INTERNAL_ERROR` | 500 | yes | unexpected server failure |

Cross-owner private access MUST map to `RESOURCE_NOT_FOUND`, never `403`.
Public share misses, expiry, and revocation use one indistinguishable response.

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

