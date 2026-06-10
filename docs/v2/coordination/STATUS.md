# QueryWise V2 Delivery Status

The coordinator owns this file.

## Waves

| Wave | Workstream | Status | Depends On |
| --- | --- | --- | --- |
| 0 | Architecture discovery and coordination | complete | none |
| 0 | Required architecture and contract decisions | in progress | discovery |
| 1 | Application database and shared domain foundation | pending | Wave 0 |
| 1 | Clerk authentication and authorization foundation | pending | Wave 0, foundation contracts |
| 1 | Data source adapter and PostgreSQL connection foundation | pending | Wave 0, foundation contracts |
| 2 | Persistent conversations and query-run integration | pending | Wave 1 |
| 2 | Multiple dashboards and sharing backend | pending | Wave 1 |
| 2 | V2 pages, shell, and feature UI integration | pending | Wave 1 contracts |
| 3 | Production hardening, integration, QA, and security review | pending | Wave 2 |

## Active Agents

| Workstream | Agent | Ownership | Status |
| --- | --- | --- | --- |
| Backend/data architecture audit | Darwin | read-only audit | complete |
| Frontend/routes architecture audit | Lorentz | read-only audit | complete |
| V2 spec/coordination audit | Bohr | read-only audit | complete |

## Integration Gate

Wave 1 implementation begins after the coordinator incorporates discovery
findings into the shared contracts and assigns disjoint file ownership.
