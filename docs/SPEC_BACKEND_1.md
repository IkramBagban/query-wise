# SPEC_BACKEND_1 — Agent B1

> Read CONTEXT.md fully before starting. You are Agent B1.
> Agent S creates types and seeds the DB — you import types from `src/types/index.ts`.
> Agent B2 handles LLM, query execution, dashboard, share routes.
> Agent F handles all UI. Do NOT touch frontend files.

---

## Your Responsibility

You own the database layer and connection infrastructure:

| File | Purpose |
|---|---|
| `src/lib/db.ts` | Connection pooling, SQL safety, query execution |
| `src/lib/schema.ts` | Database schema introspection logic |
| `src/app/api/auth/route.ts` | Demo login (POST) |
| `src/app/api/connect/route.ts` | Test DB connection (POST) |
| `src/app/api/schema/route.ts` | Return introspected schema (POST) |

Agent B2 will import and use `executeQuery` and `validateAndSanitizeSql` from your `db.ts`.
Agent B2 will import `introspectSchema` from your `schema.ts`.
Make sure these are exported correctly.

---

## File 1 — `src/lib/db.ts`

### Connection Pool Management

```typescript
import { Pool, PoolClient } from "pg"

// Singleton pools — reuse connections across requests
const pools = new Map<string, Pool>()

function getPool(connectionString?: string): Pool {
  const key = connectionString ?? "demo"
  if (!pools.has(key)) {
    pools.set(key, new Pool({
      connectionString: connectionString ?? process.env.DEMO_DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: connectionString ? 3 : 10,      // fewer connections for user DBs
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    }))
  }
  return pools.get(key)!
}
```

### `validateAndSanitizeSql(sql: string): { valid: boolean; reason?: string }`

Apply these rules in order:
1. Trim whitespace
2. Check starts with `SELECT` or `WITH` (case-insensitive)
3. Blocklist scan (uppercase the sql first):
   ```
   DROP, DELETE, TRUNCATE, UPDATE, INSERT, ALTER, CREATE,
   GRANT, REVOKE, EXECUTE, EXEC, CALL, MERGE, --,  /*, XP_
   ```
4. Return `{ valid: true }` if passes, `{ valid: false, reason: "..." }` if not

### `executeQuery(sql, connectionString?, timeoutMs?): Promise<QueryResult>`

Import `QueryResult` from `@/types`.

```typescript
export async function executeQuery(
  sql: string,
  connectionString?: string,
  timeoutMs = 15_000
): Promise<QueryResult> {
  const validation = validateAndSanitizeSql(sql)
  if (!validation.valid) {
    throw new Error(validation.reason ?? "Query blocked")
  }

  const pool = getPool(connectionString)
  const client: PoolClient = await pool.connect()
  const start = Date.now()

  try {
    // Set query timeout
    await client.query(`SET statement_timeout = ${timeoutMs}`)

    // Wrap in read-only transaction (real safety net)
    await client.query("BEGIN TRANSACTION READ ONLY")

    // Wrap user query to enforce row limit
    const safeSQL = `SELECT * FROM (${sql}) AS _querywise_result LIMIT 500`
    const result = await client.query(safeSQL)

    await client.query("COMMIT")

    return {
      columns: result.fields.map(f => f.name),
      rows: result.rows,
      rowCount: result.rows.length,
      executionTimeMs: Date.now() - start,
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {})
    throw err
  } finally {
    client.release()
  }
}
```

### `testConnection(connectionString?): Promise<{ success: boolean; error?: string }>`

Try to connect and run `SELECT 1`. Return success/error. Used by `/api/connect`.

---

## File 2 — `src/lib/schema.ts`

### `introspectSchema(connectionString?): Promise<SchemaInfo>`

Import `SchemaInfo`, `SchemaTable`, `SchemaColumn`, `Relationship` from `@/types`.

#### Step 1 — Get all tables
```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name
```

#### Step 2 — Get all columns with PK and FK info (single query)
```sql
SELECT
  c.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.ordinal_position,
  CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS is_pk,
  CASE WHEN fk.column_name IS NOT NULL THEN true ELSE false END AS is_fk,
  fk.foreign_table_name,
  fk.foreign_column_name
FROM information_schema.columns c
LEFT JOIN (
  SELECT kcu.table_name, kcu.column_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
  WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public'
) pk ON pk.table_name = c.table_name AND pk.column_name = c.column_name
LEFT JOIN (
  SELECT kcu.table_name, kcu.column_name,
    ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
) fk ON fk.table_name = c.table_name AND fk.column_name = c.column_name
WHERE c.table_schema = 'public'
ORDER BY c.table_name, c.ordinal_position
```

#### Step 3 — For each table
- Get approximate row count: `SELECT reltuples::bigint FROM pg_class WHERE relname = $1`
- Get 3 sample rows: `SELECT * FROM "tableName" LIMIT 3`
- Catch errors per-table (don't fail the whole introspection if one table has issues)

#### Step 4 — Build `SchemaInfo.summary`

Build a structured text summary like this (used as LLM context):

```
DATABASE SCHEMA SUMMARY
=======================
This database has 6 tables with the following structure:

TABLE: orders (10,432 rows)
  Columns:
    - id: integer [PRIMARY KEY]
    - customer_id: integer [FK → customers.id]
    - status: character varying (values: 'delivered', 'shipped', 'pending'...)
    - total_amount: numeric
    - created_at: timestamp without time zone

  Sample data:
    id=1, customer_id=42, status='delivered', total_amount=127.50, created_at=2024-03-15

[...repeat for each table...]

RELATIONSHIPS:
  orders.customer_id → customers.id
  order_items.order_id → orders.id
  order_items.product_id → products.id
  reviews.customer_id → customers.id
  reviews.product_id → products.id
  products.category_id → categories.id
```

For enum-like columns (varchar with limited values), show distinct values from sample data.
Include sample data inline in the summary — this is critical for SQL generation accuracy.

---

## File 3 — `src/app/api/auth/route.ts`

**POST `/api/auth`**

Request body:
```typescript
{ username: string; password: string }
```

Logic:
- Compare against `process.env.DEMO_USERNAME` and `process.env.DEMO_PASSWORD`
- If match: set an httpOnly cookie `qw_session=authenticated; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`
- Return `{ success: true }` or `{ success: false, error: "Invalid credentials" }`

Note: This is intentionally simple — the assignment says "fixed username/password for demo access." Do not overcomplicate with JWT or full auth libraries.

```typescript
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

const schema = z.object({
  username: z.string(),
  password: z.string(),
})

export async function POST(req: NextRequest) {
  // validate, compare, set cookie, return
}
```

---

## File 4 — `src/app/api/connect/route.ts`

**POST `/api/connect`**

Request body: `ConnectRequest` (from `@/types`)
```typescript
{ type: "demo" | "custom"; connectionString?: string }
```

Logic:
1. Check session cookie — if not authenticated, return 401
2. If `type === "demo"`, use `process.env.DEMO_DATABASE_URL`
3. If `type === "custom"`, validate that `connectionString` is provided and is a valid postgres URL (basic check: starts with `postgresql://` or `postgres://`)
4. Call `testConnection(connectionString)` from `db.ts`
5. If success, derive a friendly name:
   - Demo: `"QueryWise Demo (Ecommerce)"`
   - Custom: extract database name from connection string
6. Return `ConnectResponse`

Use Zod to validate the request body. Return proper error messages.

---

## File 5 — `src/app/api/schema/route.ts`

**POST `/api/schema`**

Request body:
```typescript
{ connectionString?: string } // undefined = demo db
```

Logic:
1. Check session cookie — 401 if not authenticated
2. Validate body with Zod
3. Call `introspectSchema(connectionString)` from `schema.ts`
4. Return `SchemaResponse`: `{ schema: SchemaInfo }`
5. Handle errors gracefully — if introspection fails, return 500 with details

This route may take 2–4 seconds. That is fine — the frontend will show a loading state.

---

## Auth Middleware Helper

Create `src/lib/auth.ts`:

```typescript
import { cookies } from "next/headers"

export function isAuthenticated(): boolean {
  const cookieStore = cookies()
  return cookieStore.get("qw_session")?.value === "authenticated"
}

export function requireAuth(): Response | null {
  if (!isAuthenticated()) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }
  return null
}
```

Both B1 and B2 routes use `requireAuth()` at the top of each handler.

---

## Error Handling Pattern

All routes must follow this pattern:

```typescript
export async function POST(req: NextRequest) {
  // 1. Auth check
  const authError = requireAuth()
  if (authError) return authError

  // 2. Parse + validate body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: "Validation failed", details: parsed.error.message }, { status: 400 })
  }

  // 3. Business logic in try/catch
  try {
    const result = await doWork(parsed.data)
    return Response.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error"
    console.error("[route-name]", err)
    return Response.json({ error: message }, { status: 500 })
  }
}
```

---

## Completion Checklist

- [ ] `src/lib/db.ts` exports: `executeQuery`, `validateAndSanitizeSql`, `testConnection`
- [ ] `src/lib/schema.ts` exports: `introspectSchema`
- [ ] `src/lib/auth.ts` exports: `isAuthenticated`, `requireAuth`
- [ ] `/api/auth` POST — sets cookie, validates credentials
- [ ] `/api/connect` POST — tests connection, returns name
- [ ] `/api/schema` POST — returns full SchemaInfo with summary
- [ ] All routes check auth cookie
- [ ] All routes validate with Zod
- [ ] `executeQuery` uses READ ONLY transaction
- [ ] `executeQuery` enforces 500 row limit
- [ ] `executeQuery` sets 15s statement timeout
- [ ] No TypeScript errors
- [ ] No `any` types