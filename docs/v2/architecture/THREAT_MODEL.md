# QueryWise V2 Threat Model

## Assets

- Customer database credentials and network location
- User-provided LLM API keys
- Customer schema, samples, query text, and result previews
- Conversations, dashboards, share links/passwords, and access grants
- Clerk identity/session state and encryption keys
- Application database integrity and audit evidence
- Customer database availability and LLM spend

## Trust Boundaries

1. Browser to QueryWise: all IDs, payloads, headers, and UI state are untrusted.
2. QueryWise to Clerk: identity assertions are trusted only after server-side
   verification.
3. QueryWise to application PostgreSQL/Redis: privileged internal services;
   access is server-only and least privilege.
4. QueryWise to customer database: untrusted external network and data;
   credentials are highly sensitive.
5. QueryWise to LLM provider: external processor receiving an explicitly
   bounded prompt.
6. Public share viewer to sharing service: unauthenticated, adversarial path.
7. Scheduled worker invocation: authenticated machine-to-machine boundary.

## Primary Threats And Controls

| Threat | Example | Required controls | Verification |
| --- | --- | --- | --- |
| Broken object authorization | Change `conversationId` | owner-scoped DAL, server-resolved user, private 404 | cross-user API tests |
| Credential/API-key disclosure | Logs, DTOs, cache key, analytics | encrypted credentials, minimal DTOs, redaction, no secret cache keys | secret-canary tests |
| SSRF/network pivot | Connection to localhost/metadata service | resolve and reject loopback, link-local, private/reserved ranges; recheck DNS/IP at connect | DNS rebinding/unsafe-host tests |
| SQL escape/write | Data-modifying CTE or unsafe function | parser policy, read-only transaction, read-only role, timeout/caps | adversarial SQL corpus |
| Prompt injection from schema/data | Sample value instructs model | label metadata as untrusted data, delimit/serialize, no tool authority from samples | prompt-injection cases |
| Cross-user cache leakage | Cache keyed by URL or missing owner | stable scoped IDs/version keys, no shared private caching | multi-user cache tests |
| Public share guessing/brute force | Token or password attack | high-entropy hashed token, strong password hash, rate limit, revoke/expiry | brute-force/rate tests |
| Resource exhaustion/cost abuse | Large schema, query fan-out, LLM retries | byte/count bounds, distributed rate/concurrency limits, job queue | load tests |
| Malicious customer DB response | Huge values/types/errors | adapter normalization, byte caps, safe error mapping | malformed/large-value tests |
| Job replay/duplication | Duplicate email/snapshot | idempotency keys, leases, transactional outbox | duplicate-delivery tests |
| Supply-chain or server compromise | Secret exfiltration | locked dependencies, secret manager, least privilege, audit/rotation runbooks | dependency and access review |
| Retention failure | Deleted user data remains | deletion workflow, purge jobs, backup expiry disclosure | deletion reconciliation |

## SSRF Production Policy

By default, public SaaS deployments may connect only to publicly routable
database endpoints on approved PostgreSQL ports. Reject localhost, unspecified,
multicast, link-local, carrier-grade NAT, private RFC1918, and cloud metadata
ranges after DNS resolution for every new connection. Pin the validated address
for the connection attempt or revalidate before socket use to resist rebinding.

Private-network connectivity requires an explicitly deployed private connector
or allowlisted egress architecture; it is not enabled by weakening the public
SaaS validator.

## Authentication And Authorization

- Clerk handles identity; QueryWise resolves user identity server-side.
- Proxy/page protection improves UX only. Each Route Handler, Server Action,
  service, and DAL operation enforces its own authorization.
- Public share access uses a separate minimal DTO path and never calls private
  dashboard access helpers as an anonymous owner substitute.
- Authorization failures do not reveal the existence of another user's private
  resource.

## Residual Risks

- Read-only queries can still be computationally expensive.
- Schema names, SQL, samples, and previews may contain sensitive customer data.
- A compromised application runtime can access decrypted credentials during
  adapter use.
- LLM providers receive data under the user's selected provider's terms.

These risks require least-privilege customer roles, bounded execution, clear
privacy UX, dependency controls, and incident response.
