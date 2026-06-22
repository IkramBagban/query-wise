# QueryWise V2 Agent Prompt Standard

Use this template for every implementation or review workstream. Replace all
bracketed fields before dispatch. Do not remove mandatory workflow or safety
requirements.

## Reusable Prompt

```text
Workstream: [WORKSTREAM_ID] - [NAME]
Repository: D:\Desktop\PROJECTS\query-wise
Mission: [CONCRETE OUTCOME]

You are not alone in this repository. You own ONLY:
[EXACT CREATE/EDIT PATHS]

You may read but must not edit:
[READ-ONLY PATHS AND DEPENDENCY-OWNER PATHS]

Required dependencies/checkpoints:
[CHECKPOINTS, PRODUCER WORKSTREAMS, AND COMMIT HASHES IF AVAILABLE]

Required deliverables:
[DELIVERABLES AND ACCEPTANCE CRITERIA]

Mandatory workflow:

1. Explore before coding.
   - Read AGENTS.md, docs/ASSIGNMENT.md, docs/v2/CONTEXT.md,
     docs/v2/coordination/README.md, docs/v2/coordination/DEPENDENCY_GRAPH.md,
     docs/v2/coordination/OWNERSHIP_MATRIX.md, the assigned V2 spec, and every
     published contract/checkpoint this work consumes.
   - Inspect the existing repository structure, relevant routes, modules, types,
     tests, dependencies, and git status. Infer reusable behavior from code; do
     not assume the V1 architecture should be copied.
   - This repository uses Next.js 16.2.1 with breaking changes. Before writing
     code, read the relevant guides in node_modules/next/dist/docs/. At minimum,
     choose from project structure, Server/Client Components, data fetching,
     mutation, caching, Route Handlers, authentication, data security, and
     backend-for-frontend according to the task. Record exact docs read.
   - Create and maintain only your work log:
     docs/v2/coordination/agents/[WORKSTREAM_ID].md
   - Record exploration findings, code to reuse, gaps, design, contracts,
     security/privacy/scale risks, and the intended file list before coding.

2. Respect ownership and coordinate contracts.
   - Edit only the exact owned paths above. Never revert, overwrite, delete, or
     reformat another agent's work. Never edit .env or environment files.
   - Do not edit STATUS.md, DECISIONS.md, INTEGRATION_CONTRACTS.md, V2 specs, or
     another agent's log unless this prompt explicitly grants that path.
   - Do not silently invent or change shared schemas, DTOs, errors, APIs, stream
     events, capabilities, or authorization semantics.
   - Propose every contract change in your work log with producer, consumers,
     compatibility impact, migration plan, and required checkpoint. Notify the
     coordinator before implementing a blocking or breaking change.
   - If an unexpected concurrent edit affects your task, adapt to it or report
     the conflict. Do not remove it to make tests pass.

3. Implement to the V2 architecture.
   - Write clean, maintainable, modular, typed, scalable, DRY code that follows
     established repository patterns where they satisfy V2 constraints.
   - Keep Route Handlers thin: validate transport input, authenticate/authorize,
     call server-only services/DALs, and return minimal DTOs.
   - Enforce authorization at every server entry point and resource access.
     Never trust a client-provided userId. Return private-resource not-found
     behavior without disclosing another user's resource.
   - Keep secrets server-only. Never log or return database credentials, LLM API
     keys, share passwords, decrypted values, or unrestricted private records.
   - Use the separate PostgreSQL V2 application database for product data.
     Customer databases are external data sources, never product persistence.
   - V2 implements PostgreSQL only and supports SQL databases only. Core product
     code must target capability-based SQL adapter contracts, ProviderQuery with
     explicit dialect, and canonical relational metadata so future SQL adapters
     can be added without rewriting product features. Keep PostgreSQL pools,
     catalogs, quoting, validation, and execution inside the PostgreSQL adapter.
   - Client requests use stable resource IDs such as connectionId, never
     connection URLs. Browser storage is transient UI cache only.
   - Preserve query safety: validation, DB-enforced read-only execution,
     statement timeout, row cap, bounded previews, and bounded concurrency.
   - Bound and paginate list/data operations. Make failures observable without
     exposing sensitive details.

4. Document important non-UI behavior.
   - If you change backend logic, persistence, query generation/safety, chart
     selection logic, data flow, auth, caching, API contracts, or other important
     non-UI behavior, update docs/ENGINEERING_SYSTEM_DESIGN_NOTES.md in the same
     task. Coordinate the serialized edit and include what changed, why,
     tradeoffs/risks, and how to test it.

5. Verify after implementation.
   - Add and run focused tests proportional to the risk and blast radius.
   - Run npm run build after your changes. Fix errors only within owned paths;
     coordinate errors caused by another owner's paths.
   - Review your final diff for correctness, authorization, secret exposure,
     PostgreSQL leakage outside adapter code, unbounded work, regressions,
     accidental unrelated changes, and ownership violations.
   - Update your work log with exact commands/results, changed files, contract or
     migration changes, risks, and integration instructions.

6. Commit atomically.
   - Check git status immediately before committing.
   - Commit only files you own or have an explicit recorded handoff for. Pass
     every path explicitly and quote paths containing brackets or parentheses.
   - For new files, follow AGENTS.md: clear staging, add only intended paths, and
     make an atomic scoped commit. Never amend and never use destructive git
     operations.
   - Report commit hash, exact paths, tests/build results, contracts published or
     consumed, and unresolved risks.

Stop conditions:
- A required dependency checkpoint is not published.
- Completing the task requires editing an unowned path and no handoff exists.
- A contract is ambiguous and a reasonable assumption would create incompatible
  implementations or weaken authorization/secrets/query safety.

When stopped, record the blocker and proposed resolution in your work log and
report it to the coordinator without making speculative cross-owner edits.
```

## Dispatch Checklist

Before sending a prompt, the coordinator must fill in:

- exact owned create/edit paths, including the agent log
- explicit read-only paths and known legacy replacement boundary
- dependency checkpoint IDs and producer commit hashes
- concrete deliverables and acceptance tests
- any one-time shared-file handoff
- whether the task includes an atomic commit

## Completion Report Standard

Every agent's final report must include:

```text
Workstream:
Status:
Commit hash(es):
Changed paths:
Contracts consumed:
Contracts published/proposed:
Migration/environment impact:
Focused tests:
Build:
Diff/ownership review:
Engineering notes update:
Risks/blockers/follow-ups:
```

