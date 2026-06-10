# QueryWise V2 Contract Changelog

This is the coordinator-owned ledger for proposed, accepted, implemented, and
integrated cross-workstream contract changes. It does not replace
`INTEGRATION_CONTRACTS.md`; accepted contract text belongs there when the
coordinator is authorized to update it.

## Status Definitions

| Status | Meaning |
| --- | --- |
| `proposed` | producer documented a change; consumers must not merge against it |
| `accepted` | coordinator approved the contract; producer may implement it |
| `implemented` | producer committed implementation/tests; consumers may integrate |
| `integrated` | all required consumers recorded compatible integration evidence |
| `superseded` | a later accepted contract replaces it |
| `rejected` | proposal will not be implemented |

## Change Process

1. Producer records the proposal in its own work log.
2. Coordinator adds an entry below with consumers and compatibility impact.
3. Coordinator accepts, rejects, or requests revision.
4. Producer records the implementation commit and test evidence.
5. Each consumer records its integration commit and checkpoint evidence.
6. Coordinator marks the entry integrated only after all required consumers pass.

Breaking changes require a migration/compatibility plan and cannot skip the
`accepted` state.

## Ledger

| ID | Status | Contract | Producer | Required consumers | Compatibility / checkpoint |
| --- | --- | --- | --- | --- | --- |
| `CC-001` | accepted | Separate PostgreSQL application DB with server-only typed transactions, owner-scoped repositories, safe DTOs, pagination, and typed errors | `W1-FND` | `W1-AUTH`, `W1-DATA`, `W2-CONV`, `W2-DASH`, `W3-HARDEN` | Initial V2 baseline; publish at `C1` |
| `CC-002` | accepted | Versioned authenticated encryption for customer database secrets; plaintext never leaves server-only resolution path | `W1-FND` | `W1-DATA`, `W3-HARDEN` | Initial V2 baseline; publish at `C1` |
| `CC-003` | accepted | User identity comes from Clerk; private resources are owner-scoped; resource helpers return non-disclosing not-found behavior; public shares use a separate access path | `W1-AUTH` | all private feature/API owners, `W2-UI`, `W3-HARDEN` | Initial V2 baseline; publish at `C2` |
| `CC-004` | accepted | SQL-provider-neutral capability adapter and canonical relational metadata; PostgreSQL is the only V2 implementation | `W1-DATA` | `W2-CONV`, `W2-UI`, `W3-HARDEN` | Initial V2 baseline; publish at `C3` |
| `CC-005` | accepted | Client/product workflows reference `connectionId`; credentials and connection URLs are forbidden in query/schema DTOs | `W1-DATA` | `W2-CONV`, `W2-UI`, `W3-HARDEN` | Breaking replacement of V1 transport; publish at `C3` |
| `CC-006` | accepted | Query requests use `conversationId`; server resolves the connection, persists messages/query run, and returns bounded result/stream DTOs | `W2-CONV` | `W2-UI`, `W2-DASH`, `W3-HARDEN` | Breaking replacement of V1 query request; publish at `C4` |
| `CC-007` | accepted | Dashboard widgets are bounded snapshots with optional query-run references; public share DTOs exclude credentials, schema, and conversation history | `W2-DASH` | `W2-UI`, `W3-HARDEN` | Initial V2 baseline; publish at `C5` |

## New Entry Template

```markdown
### CC-NNN: <short name>

- Status:
- Producer:
- Required consumers:
- Work-log proposal:
- Contract summary:
- Compatibility impact:
- Migration/rollout plan:
- Security/privacy impact:
- Acceptance checkpoint:
- Coordinator decision:
- Producer implementation commit/tests:
- Consumer integration commits/tests:
- Supersedes:
```

