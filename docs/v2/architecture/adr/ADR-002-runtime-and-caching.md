# ADR-002: Runtime And Caching

- Status: Accepted
- Date: 2026-06-10
- Owners: All backend workstreams

## Decision

Run all database, cryptography, LLM orchestration, and job Route Handlers on
the Next.js Node.js runtime. Treat instances as disposable and horizontally
scaled. Edge runtime is not used for V2 private APIs.

Use Next.js Route Handlers as thin transport adapters. They validate input,
authenticate, call server-only services/DALs, and map minimal DTOs. Private
resource GET handlers and public share reads are dynamic and must not be
prerendered or shared-cached.

## Caching Rules

- React `cache()` may deduplicate authenticated identity or DAL reads only
  within one server render/request lifecycle.
- Durable schema snapshots live in the application database.
- Optional distributed metadata cache keys are
  `schema:{connectionId}:{schemaVersion}`. They never contain credentials.
- Public share DTO caching, if added, is keyed by a non-secret internal share
  record/version and invalidated on revoke/update. Password-gated responses are
  never shared-cached.
- Query results, credentials, LLM API keys, decrypted secrets, authorization
  decisions, and raw samples are not placed in framework or distributed caches.
- Process-local maps may only be bounded best-effort accelerators with correct
  cache-miss behavior. They cannot be authoritative.

## Runtime Constraints

- Explicitly export `runtime = "nodejs"` for customer DB, app DB, crypto, and
  job routes.
- Pool registries use `connectionId`, have bounded sizes and idle eviction, and
  dispose on credential update/delete.
- Every outbound call has a timeout and cancellation path.
- Local filesystem writes are diagnostic-only in development and never a
  persistence mechanism.
- Secrets are read only from server-side configuration modules.

## Next.js 16 Security Consequences

Route Handlers and Server Actions are reachable public endpoints. Every entry
point revalidates input, authentication, and resource authorization. DAL modules
use `server-only` and return minimal DTOs. Mutations use POST/PATCH/DELETE and
must not occur as render side effects.

## Rationale

`pg`, server-side cryptography, and controlled connection pooling require the
Node.js runtime. Explicit cache rules prevent cross-user disclosure and make
behavior correct across deployments and instances.

## Verification

- Build rejects importing server-only modules into client code.
- Cross-user cache isolation tests.
- Revoked shares cannot be served from cache.
- Multi-instance tests show no dependence on local files or process maps.
- Pool eviction and disposal tests.
