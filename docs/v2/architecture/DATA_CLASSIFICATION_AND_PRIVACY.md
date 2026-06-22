# Data Classification And Privacy Policy

## Classification

| Class | Examples | Storage/transport policy |
| --- | --- | --- |
| Restricted secrets | DB passwords/URLs, decrypted credentials, LLM API keys, share passwords, encryption keys | server-only; encrypted at rest where persisted; never logs/analytics/DTO/cache |
| Confidential customer data | samples, query results/previews, SQL, schema names/comments, conversations, dashboards | owner-authorized; TLS; bounded persistence; no logs by default |
| Internal operational data | resource IDs, audit events, job metadata, error codes, durations | server-only/minimal; no secret payloads |
| Public-by-configuration | explicitly shared dashboard DTO | only through share policy; revoke/expiry aware |

Classification is based on content, not field name. Schema identifiers and SQL
can reveal customer business information and are confidential.

## LLM API Key Policy

The V2 API key remains browser-held and is sent to the server only for the
current provider request over TLS. It is never persisted in the application
database, logs, analytics, jobs, error payloads, or caches. Server memory holds
it only for the outbound call lifetime.

## LLM Schema And Sample Policy

The LLM receives the minimum context needed to answer the question:

- Canonical structural metadata is eligible: selected namespaces, entities,
  columns, types, keys, relationships, and safe generated summaries.
- Large schemas use deterministic relevance selection. The service retains the
  full canonical snapshot server-side but sends a bounded subset per LLM call.
- Raw sample rows and top values are **off by default** for customer
  connections. Enabling samples requires an explicit per-connection opt-in
  explaining external-provider disclosure.
- Even when enabled, sampling excludes columns classified or named as likely
  secrets/PII and applies value truncation, row/column caps, and redaction.
- Demo data may include bounded samples because it is synthetic and designated
  non-sensitive.
- Query result rows are not sent back to the LLM unless required for a bounded
  explanation and explicitly covered by the same policy.

Samples and metadata are serialized as untrusted data, separated from system
instructions, and cannot grant tools or override read-only policy.

## Default Bounds

- LLM structural context: 200 entities, 2,000 columns, 512 KiB serialized.
- Samples when opted in: maximum 3 rows per selected entity, 20 columns per
  entity, 128 characters per scalar, 64 KiB total per request.
- Persisted result preview: 100 rows and 256 KiB.
- Client query response: 500 rows and 2 MiB.

If the required context exceeds a bound, rank and select context, ask a
clarifying question, or return a typed `CONTEXT_TOO_LARGE` response. Never
silently send unrestricted data.

## Likely Sensitive Column Handling

At minimum exclude or redact columns matching credentials/tokens/secrets,
password hashes, payment card data, government identifiers, auth/session data,
and binary/blob content. Email, phone, address, birth date, IP, and free-text
columns are PII candidates and excluded from samples by default.

Automated detection is a guardrail, not proof of anonymization. The user-facing
policy must state that customers control their schema and should avoid enabling
samples for regulated data without an appropriate provider agreement.

## Logs, Errors, And Analytics

- Use allowlisted structured fields, not arbitrary payload logging.
- Error messages use stable categories and redacted summaries.
- Never attach request bodies, headers, history, SQL results, connection URLs,
  samples, or provider response bodies to analytics.
- Audit logs record actor/resource/action/outcome and safe metadata, not content.
- Secret-canary tests inject recognizable values and assert absence from logs,
  DTOs, jobs, caches, and analytics adapters.

## Privacy UX

Connection creation and settings disclose:

- what metadata QueryWise stores,
- whether samples are enabled,
- that selected context is sent to the chosen LLM provider,
- retention/deletion behavior,
- recommendation to use a read-only role/read replica.
