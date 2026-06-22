# Interview Agent Notes (Living Document)

Purpose: agents keep appending concrete implementation notes that help with interview prep.
Rule: append-only updates; do not remove prior decisions without adding a superseding note.

## How Agents Should Update This File

For every meaningful change, append one entry under `## Change Log` using this format:

```md
### [YYYY-MM-DD] <short title>
- Area: <backend|frontend|data|security|infra|llm|ux>
- Decision: <what was chosen>
- Why: <reason/tradeoff>
- Location: <file paths / route names / modules>
- Interview Q: <likely interviewer question>
- Interview A: <tight answer>
- Risks: <known risk>
- Mitigation: <what we did / next step>
```

## Current Architecture Snapshot

- App: QueryWise (Next.js App Router + TypeScript).
- Data access: PostgreSQL via `pg`.
- LLM path: NL query -> schema-aware prompt -> SQL generation -> SQL safety validation -> query execution -> chart recommendation.
- Visualization: chart auto-selection with user override.
- State surfaces:
  - Auth/session flow.
  - DB connection flow (demo/custom).
  - Chat/query flow with follow-up context.
  - Dashboard persistence/sharing flow.

## Security and Safety Notes (Initial)

### SQL Safety Controls
- Read-only SQL intent enforced by validation (allow `SELECT`/`WITH` only).
- Blocklist for destructive or risky statements (`DROP`, `DELETE`, `TRUNCATE`, etc.).
- Row limit enforcement to prevent oversized responses.
- Statement timeout to prevent runaway queries.

### Command and Repo Safety
- No destructive git/file rollback commands without explicit instruction.
- No reverting other agents' work to silence errors.
- Atomic commit policy: commit only touched files with explicit paths.
- No `.env` editing by agents.

### API Key Handling
- User provides LLM API key.
- Key is intended to stay client-side per assignment context.
- No backend persistence of user API keys.

## System Design Decisions to Keep Documenting

Agents should continuously add:
1. Why each major module exists and what it owns.
2. Why a specific library was selected over alternatives.
3. Schema-analysis strategy and failure paths.
4. NL-to-SQL prompting strategy and guardrail design.
5. Chart selection heuristics and override logic.
6. Dashboard storage/share-link design.
7. Performance decisions (pooling, caching, timeout values, limits).
8. Security decisions (auth boundaries, validation, injection resistance).
9. Observability/debug choices (what is logged and what is redacted).

## High-Value Interview Questions to Prepare For

1. How do you prevent destructive or malicious SQL execution?
2. How do you ensure SQL accuracy with ambiguous natural language?
3. How do you handle follow-up questions without losing context?
4. Why this schema introspection depth (sample rows, relationships, etc.)?
5. How do you decide chart type automatically?
6. How do you secure user API keys and database credentials?
7. What happens when model output is invalid SQL?
8. What scalability bottlenecks do you expect first?
9. If this goes multi-tenant, what changes first?
10. What tradeoffs did you make due to delivery speed?

## Change Log

### [2026-03-29] Interview docs bootstrap
- Area: process
- Decision: split interview prep into stable requirements doc + append-only agent notes.
- Why: keeps baseline facts stable while preserving implementation evolution over time.
- Location: `docs/ASSIGNMENT_REQUIREMENTS_CHECKLIST.md`, `docs/INTERVIEW_AGENT_NOTES.md`
- Interview Q: How did you keep project knowledge organized while moving fast?
- Interview A: We separated immutable assignment requirements from a living architecture log so decisions stayed auditable and interview-ready.
- Risks: notes become stale if agents forget to update.
- Mitigation: explicit update template and required append format.
