# Lifecycle, Retention, And Deletion

## Resource Lifecycles

### Database Connection

`pending -> connected | error -> deleting -> deleted`

Creation encrypts credentials before persistence and enqueues initial schema
sync. Credential update increments a credential version and disposes the old
pool. Delete immediately blocks new access, disposes pools, deletes encrypted
credentials, revokes dependent active work, and enqueues bounded cleanup.

### Schema Snapshot

`queued -> syncing -> succeeded | failed -> superseded -> purged`

Only a successful, complete snapshot is promoted. Refresh failure preserves the
previous successful snapshot. Profiling is separately versioned and optional.

### Conversation And Query Run

Conversation: `active -> archived -> deleting -> deleted`.

Query run: `accepted -> generating -> executing -> succeeded | failed |
cancelled | expired`. Terminal runs are immutable except for redaction/purge
fields. A failed run remains visible with a safe error category.

### Dashboard And Share

Dashboard: `active -> deleting -> deleted`.

Share link: `active -> revoked | expired -> purged`. Revocation takes effect
immediately in authorization and cache invalidation. Access grants are removed
when the dashboard or owner is deleted.

## Default Retention

| Data | Default |
| --- | --- |
| Encrypted active connection credentials | Until connection/account deletion |
| Superseded schema snapshots | 30 days; retain latest successful |
| Failed schema/job diagnostics | 30 days, redacted |
| Conversations/messages/query-run metadata | Until user deletion; user can delete |
| Query result previews | 30 days, then purge content while retaining safe run metadata |
| Dashboards/widget snapshots | Until dashboard/account deletion |
| Revoked/expired share records | 30 days, then purge token/hash and content links |
| Audit events | 180 days |
| Rate-limit keys and concurrency leases | TTL only, maximum 24 hours |
| Dead jobs | 30 days |
| Backups | 30-day rolling expiry |

Retention values are configuration and must be disclosed. A future paid/legal
policy may change values through a reviewed decision, not ad hoc code.

## Deletion Semantics

- User-visible delete blocks access synchronously and creates a durable purge
  job in the same application-DB transaction.
- Purge jobs are idempotent, dependency-ordered, and run in bounded batches.
- Secrets and share-token/password hashes are deleted first.
- Customer databases are never modified by QueryWise deletion.
- Audit records may retain a pseudonymous actor hash and safe action metadata,
  but no deleted content or secrets.
- Backups expire naturally within the disclosed window; selective backup
  mutation is not promised.

## Account Deletion Order

1. Mark account deleting and deny private access.
2. Revoke public shares and grants.
3. Dispose pools and delete encrypted credentials.
4. Delete samples, previews, schema snapshots, messages, widgets, and jobs.
5. Delete remaining product records and pseudonymize permitted audit events.
6. Record a secret-free deletion completion marker.

## Verification

- Deletion request makes private and public resources inaccessible immediately.
- Replayed purge jobs are harmless.
- Reconciliation finds no orphaned records or secret envelopes.
- Backup policy and maximum residual window are documented in operations.
