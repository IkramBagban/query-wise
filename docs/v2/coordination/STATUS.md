# QueryWise V2 Delivery Status

The coordinator owns this file.

## Waves

| Wave | Workstream | Status | Depends On |
| --- | --- | --- | --- |
| 0 | Architecture discovery and coordination | complete | none |
| 0 | Required architecture and contract decisions | complete | discovery |
| 1 | Application database and shared domain foundation | in progress | Wave 0 |
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
| Wave 0 production architecture | Dewey | `docs/v2/architecture/**` | complete |
| Wave 0 cross-feature contracts | Schrodinger | `docs/v2/contracts/**` | complete |
| Wave 0 execution model | Herschel | coordination execution docs | complete |
| Wave 1 foundation | Goodall | C1 foundation-owned paths | active |
| Wave 1 auth preparation | Singer | read-only handoff | active |
| Wave 0 independent review | Cicero | read-only review | active |

## Integration Gate

Wave 0 contracts are frozen at the committed coordination, architecture, and
contract baselines. C1 is active. W1-AUTH and W1-DATA implementation begin
after C1 publishes its typed persistence/domain contracts.
