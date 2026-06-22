# NL-to-SQL Pipeline — Implementation Plan

## Status And Scope

This document is the implementation plan for QueryWise V2's two core pipelines:
**schema ingestion** (when a user connects a database) and **query answering**
(when a user asks a question). It is grounded in how production systems —
Uber QueryGPT and Pinterest Text-to-SQL — solved the same problems at the scale
we target.

Target scale: a single user database with **200–300 tables**, each with
**40–50+ columns**, hundreds of thousands of rows per table. The design must
also scale across **many users and concurrent requests**.

Data-source scope: **PostgreSQL only** for v2. MySQL and other SQL dialects are
a possible v3 extension. NoSQL, cross-database joins, and any writes to customer
data sources are out of scope.

This plan complements, and does not override, the Wave 0 invariants in
[README.md](README.md) and the ADRs.

---

## Why This Design (Grounded In Production Systems)

Uber and Pinterest independently converged on the **same core pipeline**, which
is strong signal it is correct:

> retrieve candidate tables by vector search → let an LLM **re-select** the few
> tables that matter → **prune columns** to a "skinny" schema → generate SQL →
> execute → explain.

Two lessons drive the most important parts of this plan:

1. **Column pruning is mandatory at our scale (Uber).** Uber found Tier-1 tables
   with 200+ columns consumed **40–60K tokens each**. Dumping full schemas of
   even 5–8 retrieved tables blows the context window and *degrades* accuracy.
   Their fix was a dedicated **Column Prune Agent** that emits a schema
   containing only the columns relevant to the question. At our 50-columns-per-
   table, this is the single highest-leverage step.

2. **Embed tables two ways, not one (Pinterest).** Pinterest indexes each table
   with a **table-summary embedding** (*what data it contains*) **and** a
   **query-summary embedding** (*how it is typically queried*). Matching the
   user's question against "how a table is queried" beats matching against a
   schema description alone.

See [References](#references-issues-and-learnings) for the full list and the
issues each system hit.

---

## Architecture At A Glance

```text
INGESTION (async, per connection)
  connect → introspect (tables, columns, datatypes, FKs)
          → LLM table + column descriptions (batched)
          → LLM sample questions per table (bootstrap, no query log yet)
          → dual embeddings (table-summary + question-summary)
          → vector store (namespaced per connection) + schema fingerprint
          → status: connecting → introspecting → describing → embedding → ready

QUERY (synchronous request)
  question (+ N turns history)
          → rewrite to standalone question
          → embed → vector retrieve top ~20–30 tables
          → LLM RE-SELECT top K (5–8) tables
          → LLM COLUMN-PRUNE → skinny schema + FK join paths
          → generate SQL (few-shot with sample queries)
          → execute in READ-ONLY transaction + LIMIT + statement_timeout
          → explain the (already small) result set
```

---

## Pipeline 1 — Schema Ingestion (User Connects A Database)

Runs entirely in a background worker. Nothing in this pipeline happens in a
request. Ingestion of 300 tables is minutes-long work.

### Decision — queue technology: BullMQ on Redis

**Decided: ingestion runs on BullMQ backed by Redis, processed by a dedicated
worker.** BullMQ is a mature, standard job-queue with first-class concurrency,
retries/backoff, delayed jobs, and dead-letter handling. Redis is already a
hard dependency (rate limits and concurrency leases, ADR-004), so this adds no
new infrastructure class.

This **supersedes ADR-003** (which specified a durable PostgreSQL queue) and
relaxes the Node.js-only worker assumption in ADR-002. Because those ADRs are
Accepted and owned by other roles, this change must be recorded as a superseding
ADR (or an amendment) so the architecture docs do not disagree silently —
**action: file that ADR before/with the worker implementation.**

Two guarantees the Postgres-queue design gave for free must now be rebuilt on
BullMQ. They are required, not optional:

1. **Enqueue/state consistency (no transactional enqueue).** Redis cannot enqueue
   inside the same DB transaction that writes the `connection` / `ingestion_run`
   rows. Use a **transactional outbox**: write the job intent to a DB row inside
   the transaction, and a relay publishes it to BullMQ. The consumer stays
   idempotent on `(connectionId, schemaFingerprint)` so an at-least-once double
   enqueue is harmless.
2. **Per-tenant fairness.** ADR-003 capped schema work at "2 jobs/user, 10
   global." Rebuild this with a BullMQ worker concurrency limit plus per-user
   grouping (BullMQ groups, or a per-user concurrency lease via the existing
   ADR-004 Redis limiter) so one user's 300-table ingestion cannot starve others.

### Steps

1. **Persist the connection + enqueue a job.**
   - On connect, create a `connection` row and an `ingestion_run` row in the app
     DB. Store credentials **encrypted at rest** (invariant 5; only adapters
     touch secrets, invariant 3).
   - Enqueue an idempotent ingestion job keyed by `(connectionId, schemaFingerprint)`
     (invariant 7).

2. **Introspect the full schema (one pass).**
   - Read tables, columns, datatypes from `information_schema`.
   - Read **foreign keys** from `pg_catalog` / `information_schema` — the FK graph
     is first-class data, not an afterthought. Wrong joins are the most common
     text-to-SQL failure; the planner needs the join paths.
   - Compute a **schema fingerprint** (hash over table/column/FK structure).

3. **Describe tables and columns (batched LLM calls).**
   - Pass a batch of tables (with their columns + datatypes + FK references) to
     an LLM; get a one-line description per table and per column.
   - Use a **fast/cheap model** — descriptions do not need a frontier model.
   - Batch to control cost/latency across 300 tables; persist per-table so a
     crash mid-run resumes (invariant 7) rather than restarting from zero.

4. **Generate bootstrap sample questions per table (Pinterest's query-summary,
   bootstrapped).**
   - We start with a fresh user DB and have **no query log**. Generate a few
     synthetic natural-language questions each table could answer (reuse the
     same enrichment LLM pass).
   - Later, log **real successful queries** and feed them back in — this is
     Pinterest's flywheel (cold-start synthetic → warm real usage).

5. **Create dual embeddings and index.**
   - **Table-summary embedding:** table name + description + summarized columns.
   - **Question-summary embedding:** the bootstrap questions (and later, real
     queries).
   - Store vectors **namespaced per connection** (isolation; future multi-tenant
     safety). Keep full column metadata + FK edges in the row payload for
     post-retrieval expansion.

6. **Advance status through stages.**
   - `connecting → introspecting → describing → embedding → ready`, plus
     `failed` with a reason. Resumable per table.
   - User may only query once status is `ready`.

7. **Incremental re-ingest.**
   - On reconnect, diff the new schema fingerprint against the stored one.
     Re-describe/re-embed **only changed tables**. Never re-embed 300 tables on
     every connect.

---

## Pipeline 2 — Query Answering (User Asks A Question)

Synchronous request. This is the Uber/Pinterest core pipeline with our safety
gate at execution.

### Steps

1. **Rewrite to a standalone question.**
   - Include the last *N* conversation turns. Resolve pronouns/context ("those
     users", "same as before") into a self-contained question.
   - **Fast model.** This is cheap and latency-sensitive.

2. **Retrieve candidate tables (vector search).**
   - Embed the rewritten question; similarity search the **per-connection**
     namespace against both embedding types. Take top ~20–30 tables.

3. **LLM re-selects the top K tables.** *(Uber Table Agent / Pinterest
   Table Re-selection.)*
   - Give the LLM the ~30 candidate **summaries** and the question; have it
     return the **5–8 tables actually needed**. This removes vector-search noise
     before the expensive step.

4. **Column-prune to a skinny schema.** *(Uber Column Prune Agent — the key
   scale step.)*
   - For the selected K tables, have an LLM keep only columns relevant to the
     question. Emit a compact schema (table → relevant columns + datatypes) plus
     the **FK join paths** between the selected tables.
   - This is what keeps us inside the context window at 50 columns/table and
     improves accuracy by removing distractor columns.

5. **Generate SQL (few-shot).**
   - **Strong model here.** Prompt with: the skinny schema, FK join paths, and
     relevant **sample queries** retrieved from the query-summary index
     (few-shot demonstrations, as both Uber and Pinterest do).
   - Use an M-Schema / MAC-style compact schema representation (the survey notes
     these outperform raw DDL in prompts).

6. **Execute safely.** *(Our invariant 4.)*
   - Run inside a **database-enforced read-only transaction**
     (`BEGIN TRANSACTION READ ONLY`). Postgres rejects any write/DDL at execution
     — this is the primary safety guarantee, so no separate write-blocking
     validator is required for *safety*.
   - **Single-statement policy** via a parser (reject multi-statement input) — for
     a clean early error and to refuse stacked statements (UX + defense-in-depth,
     not the primary gate).
   - Enforce a **`statement_timeout`**, a **row `LIMIT`** (cap ~1,000), and a
     **concurrency lease** (invariant 4, ADR-005). Optionally `EXPLAIN` first to
     reject runaway plans.

7. **Explain the result.**
   - The result set is already small — analytical SQL aggregates server-side
     (`GROUP BY`, `COUNT`, `AVG`) and the `LIMIT` caps rows. Pass the capped
     result to a **fast model** for a natural-language explanation / chart
     framing. Never stream large raw row sets to an LLM (it won't happen in
     practice given aggregation + LIMIT).

---

## Model Tiering (Cost & Latency)

The query pipeline has up to five LLM touchpoints. Do not use a frontier model
for all of them.

| Step | Model tier | Rationale |
| --- | --- | --- |
| Rewrite question | fast/cheap | short, latency-sensitive |
| Re-select tables | fast/cheap | classification over summaries |
| Column prune | fast/cheap | filtering, not reasoning |
| **Generate SQL** | **strong** | correctness-critical |
| Explain result | fast/cheap | summarization of small data |

Add **semantic caching** of repeated/near-identical questions per connection to
cut cost and latency on common queries.

---

## Cross-Cutting Concerns

- **Per-connection vector namespacing** — retrieval must never cross
  connections; required for isolation and future multi-tenant safety.
- **Credential encryption at rest** — the one piece of genuinely sensitive data
  we hold (invariant 5).
- **Worker concurrency + per-tenant fairness** — one user's 300-table ingestion
  must not starve other users' jobs; use leases and per-tenant limits
  (ADR-004).
- **Bounded payloads** — schema metadata and result payloads are capped and
  measured against [PERFORMANCE_BUDGETS.md](PERFORMANCE_BUDGETS.md) (invariant 8).
- **Idempotency** — ingestion jobs and retried mutations use stable idempotency
  keys (invariant 7, [FAILURE_RETRY_IDEMPOTENCY.md](FAILURE_RETRY_IDEMPOTENCY.md)).

---

## Implementation Sequence

1. **Introspection + persistence** — connect, encrypt credentials, introspect
   tables/columns/FKs, compute fingerprint, stage status. No LLM yet.
2. **Ingestion worker** — batched descriptions, bootstrap questions, dual
   embeddings, namespaced vector store, resumable per-table, incremental
   re-ingest. (BullMQ worker + transactional outbox; file the superseding ADR.)
3. **Retrieval + selection** — vector retrieve → LLM re-select → column-prune.
   Testable in isolation against a seeded large schema.
4. **SQL generation + safe execution** — few-shot generation, read-only
   transaction, single-statement policy, timeout, LIMIT, lease.
5. **Explanation + caching + model tiering** — explain small results, semantic
   cache, route each step to the right model tier.
6. **Query-log flywheel** — replace bootstrap questions with real successful
   queries in the query-summary index.

---

## Issues, Learnings, And References

These are the concrete problems the production systems hit and how they solved
them — each maps to a decision above.

### Uber QueryGPT
- **Naive RAG didn't scale.** v1 vectorized the prompt and KNN'd to ~3 tables;
  it broke on large schemas and complex queries. It took **20+ iterations** to
  reach a multi-agent pipeline → *we adopt the multi-agent decomposition from the
  start.*
- **Large tables blew token limits.** Tier-1 tables with 200+ columns =
  **40–60K tokens each** → the **Column Prune Agent** (skinny schemas) → *our
  step 4.*
- **Domain narrowing before retrieval.** The **Intent Agent** maps a question to
  a curated **Workspace** before searching → *for a single user DB this is
  optional in v1; revisit as user-defined table groups / FK-cluster scoping.*
- **Few-shot sample queries** (≈7 tables + 20 SQL samples) guide generation →
  *our query-summary index + few-shot prompt.*
- Reported **70% reduction** in query authoring time (10 min → 3 min).
- Source: [Uber — QueryGPT: NL to SQL using Generative AI](https://www.uber.com/us/en/blog/query-gpt/)

### Pinterest Text-to-SQL
- **Three phases:** indexing → retrieval → augmentation & generation.
- **Two embedding types:** table-summary (*what data*) + query-summary
  (*how queried*, built from real sample SQL) → *our dual embeddings, step 5 of
  ingestion.*
- **LLM table re-selection:** vector returns top N, an LLM picks top K from the
  summaries → *our query step 3.*
- **Table tiering:** index only top-tier/curated tables to keep retrieval
  high-quality → *our analogue is incremental re-ingest + (future) user table
  grouping.*
- Sources:
  - [Pinterest Engineering — How we built Text-to-SQL at Pinterest](https://medium.com/pinterest-engineering/how-we-built-text-to-sql-at-pinterest-30bad30dabff)
  - [Pinterest Engineering — Unified Context-Intent Embeddings for Scalable Text-to-SQL](https://medium.com/pinterest-engineering/unified-context-intent-embeddings-for-scalable-text-to-sql-793635e60aac)
  - [Wren AI — Deep dive into Pinterest's Text-to-SQL solution](https://medium.com/wrenai/what-we-learned-from-pinterests-text-to-sql-solution-840fa5840635)

### Academic / survey guidance
- **Schema linking is critical:** show the model only relevant schema; large
  prompts add noise *and* cost, but over-pruning hurts — retrieval + re-selection
  + column-prune balance this.
- **Schema representation matters:** M-Schema / MAC-style compact representations
  outperform raw DDL in prompts → *use a compact schema format in step 5.*
- **Business context beats raw names:** descriptions, relationships, and sample
  values help the model map user language to structure → *our LLM descriptions +
  FK graph + sample questions.*
- Sources:
  - [Next-Generation Database Interfaces: A Survey of LLM-based Text-to-SQL (arXiv 2406.08426)](https://arxiv.org/pdf/2406.08426)
  - [A Survey of Text-to-SQL in the Era of LLMs (arXiv 2408.05109)](https://arxiv.org/pdf/2408.05109)
  - [EllieSQL: Cost-Efficient Text-to-SQL with Complexity-Aware Routing (arXiv 2503.22402)](https://arxiv.org/pdf/2503.22402)
  - [Awesome-LLM-based-Text2SQL (curated list)](https://github.com/DEEP-PolyU/Awesome-LLM-based-Text2SQL)
