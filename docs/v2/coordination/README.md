# QueryWise V2 Agent Coordination

This directory is the shared operating system for V2 implementation. Every V2
agent must read this file, `docs/v2/CONTEXT.md`, its assigned feature spec,
`AGENTS.md`, and `docs/ASSIGNMENT.md` before writing code.

## Non-Negotiable Workflow

Every agent must complete these phases in order:

1. **Explore**: inspect the existing routes, modules, tests, dependencies, and
   relevant Next.js 16 guides under `node_modules/next/dist/docs/`.
2. **Record**: create or update only its own work log under
   `docs/v2/coordination/agents/`.
3. **Design**: document reused code, proposed boundaries, contracts consumed or
   published, migration impact, and risks before implementation.
4. **Implement**: write modular, typed, provider-neutral code within the
   assigned ownership boundary.
5. **Verify**: run focused tests and `npm run build`. Record exact commands and
   results.
6. **Review**: inspect the final diff for authorization, secret exposure,
   provider leakage, regressions, and accidental unrelated changes.
7. **Commit**: make atomic scoped commits following `AGENTS.md`.

Agents are not alone in the repository. They must never revert, delete, or
overwrite another agent's work. When an unexpected edit affects their task,
they must adapt or report the conflict to the coordinator.

## Documentation Ownership

To minimize merge conflicts:

- The coordinator owns `STATUS.md`, `DECISIONS.md`, and
  `INTEGRATION_CONTRACTS.md`.
- Each implementation or review agent owns exactly one log:
  `agents/<workstream-id>.md`.
- Agents may propose decision or contract changes in their own log. Only the
  coordinator copies accepted changes into the shared documents.
- Feature agents update their assigned feature spec only when the coordinator
  explicitly grants ownership.
- Any important non-UI behavior change must also update
  `docs/ENGINEERING_SYSTEM_DESIGN_NOTES.md` as required by `AGENTS.md`.

## Required Work Log Sections

Copy `WORK_LOG_TEMPLATE.md` when starting a workstream. Keep it current:

- scope and ownership
- exploration findings
- existing code reused
- design and boundaries
- contracts consumed and published
- data migrations and environment requirements
- security, privacy, and scaling considerations
- implementation progress
- test/build evidence
- commits
- integration notes, risks, and follow-ups

## Quality Gates

A workstream is not complete until:

- authorization is enforced server-side for private resources
- client DTOs cannot contain secrets or unrestricted records
- PostgreSQL implementation details do not leak into product features
- operations are bounded, paginated, and observable where appropriate
- errors are actionable without exposing sensitive data
- focused tests pass
- `npm run build` passes
- its work log and required engineering notes are current
- commits contain only intentionally owned files

## Database Extensibility Rule

V2 implements PostgreSQL, but the architecture must permit future SQL database
adapters such as MySQL, SQL Server, and analytical SQL engines.

Product features depend on SQL-provider-neutral capabilities and canonical
relational metadata. They do not directly depend on PostgreSQL catalog records,
PostgreSQL-only SQL, or `pg` pools.

An adapter advertises capabilities. Unsupported operations fail with a typed
capability error rather than requiring feature-level provider conditionals.

See `INTEGRATION_CONTRACTS.md` and `docs/v2/CONTEXT.md`.
