# Deployment And Operations

## Production Topology

- Next.js 16 application deployed as horizontally scalable Node.js instances.
- Managed PostgreSQL application database with TLS, automated backups,
  point-in-time recovery, and separate migration credentials.
- Managed Redis-compatible service for rate limits and concurrency leases.
- Protected scheduled worker endpoint; optional dedicated Node.js worker.
- Clerk for identity and user-selected LLM providers.
- Customer PostgreSQL connections originate from documented egress addresses
  where the hosting platform supports them.

## Environments

Use isolated development, preview, staging, and production application
databases, Redis namespaces, Clerk tenants, encryption keys, and job secrets.
Preview deployments must not connect to production customer databases by
default. Synthetic/demo data is the standard test source.

## Configuration Classes

Required server-only configuration includes:

- application database URL and restricted runtime credentials
- migration database credentials, available only to deployment jobs
- versioned credential-encryption key material
- Clerk server credentials
- Redis endpoint/credentials
- worker invocation secret
- demo database connection
- optional approved egress/network policy

Do not expose these with `NEXT_PUBLIC_`. Validate configuration at startup
without printing values. Rotate secrets using versioned encryption envelopes
and dual-read migration where needed.

## Deployment Procedure

1. Build and run unit/integration/security checks.
2. Back up and verify application DB health.
3. Run reviewed forward migration from one migration runner with lock/statement
   timeouts.
4. Deploy backward-compatible application code.
5. Run smoke tests: auth, owner isolation, connection test, schema read, demo
   query, dashboard/share revoke, worker claim.
6. Promote traffic gradually and monitor.
7. Run post-deploy canary and migration reconciliation.

Application rollback is allowed only while compatible with the migrated schema.
Database rollback uses a reviewed forward fix.

## Observability

Structured logs and traces include correlation ID, authenticated actor hash,
resource IDs, operation, duration, outcome, error category, and dependency
timing. They exclude restricted secrets and confidential payload content.

Required metrics:

- API rate/error/latency by route class
- auth/authorization failures
- rate-limit blocks and concurrency utilization
- application/customer pool checkout and utilization
- query duration/timeouts/row and byte caps
- LLM duration/fallback/error category
- schema-sync/job queue depth, age, attempts, dead jobs
- share unlock failures and revocations
- migration version and application DB health

Alert on SLO burn, dead jobs, oldest-job age, app DB saturation, repeated
decryption failures, unusual authorization failures, query timeout spikes, and
limiter outage.

## Runbooks

Maintain tested runbooks for:

- application DB unavailable or migration failure
- Redis outage
- customer DB outage/credential rotation
- LLM provider outage
- encryption-key compromise/rotation
- credential or customer-data exposure
- abusive public share or query traffic
- stuck/dead jobs
- user/account deletion reconciliation

## Backup And Recovery

- Enable daily backups and point-in-time recovery for application PostgreSQL.
- Default backup retention is 30 days.
- Test restore at least quarterly into an isolated environment.
- Recovery objectives: RPO <= 15 minutes and RTO <= 4 hours for application
  persistence.
- Redis is non-authoritative and need not be restored.
- Customer databases are outside QueryWise backup responsibility.

## Production Readiness Gates

- Migration smoke/upgrade tests pass.
- Cross-user authorization and secret-canary tests pass.
- Query safety corpus and database read-only-role tests pass.
- Performance budgets have measured evidence.
- Restore, key rotation, share revocation, and deletion workflows are tested.
- Known risks and operational owners are documented.
