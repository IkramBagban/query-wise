# SPEC_BACKEND_2 — Agent B2

> Read CONTEXT.md fully before starting. You are Agent B2.
> Agent S creates types — import everything from `types/index.ts`.
> Agent B1 creates `lib/db.ts` and `lib/schema.ts` — import from those.
> Agent F handles all UI. Do NOT touch frontend files.

---

## Your Responsibility

You own the intelligence layer — LLM calls, chart logic, and data persistence:

| File | Purpose |
|---|---|
| `lib/llm.ts` | LLM prompt construction, Gemini/Claude calls, retry logic |
| `lib/charts.ts` | Chart type auto-detection from query results |
| `app/api/query/route.ts` | Main NL→SQL→execute pipeline (POST) |
| `app/api/dashboard/route.ts` | Save/update dashboards (POST) |
| `app/api/dashboard/[id]/route.ts` | Load a dashboard by id (GET) |
| `app/api/share/route.ts` | Generate shareable links (POST) |
| `app/api/share/[shareId]/route.ts` | Load shared dashboard publicly (GET) |

You depend on `executeQuery` from Agent B1's `lib/db.ts`.
You depend on `requireAuth` from `lib/auth.ts` (also B1).
Dashboard persistence: use in-memory Map + file system (`/tmp`) for simplicity — no extra DB needed.

---

## File 1 — `lib/llm.ts`

### Provider Setup

```typescript
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createAnthropic } from "@ai-sdk/anthropic"
import { generateText, CoreMessage } from "ai"
import { SchemaInfo, ChatMessage } from "@/types"

type Provider = "google" | "anthropic"

function getModel(provider: Provider, model: string, apiKey: string) {
  if (provider === "google") {
    return createGoogleGenerativeAI({ apiKey })(model)
  }
  return createAnthropic({ apiKey })(model)
}
```

### `buildSchemaContext(schema: SchemaInfo): string`

Returns the schema summary formatted for LLM consumption.
Use `schema.summary` as the base (built by Agent B1's introspection).
Prepend this header:

```
You are a SQL expert. You generate PostgreSQL SELECT queries based on natural language questions.

IMPORTANT RULES:
- Return ONLY the SQL query. No explanations, no markdown, no code fences.
- Only write SELECT queries. Never write INSERT, UPDATE, DELETE, DROP, ALTER, or any DDL.
- Always use table aliases (e.g., o for orders, c for customers).
- Use explicit JOINs, never implicit.
- For date filtering, use CURRENT_DATE and intervals (e.g., CURRENT_DATE - INTERVAL '30 days').
- Think step by step: (1) identify needed tables, (2) determine joins, (3) apply filters, (4) write SQL.

DATABASE SCHEMA:
[schema.summary goes here]
```

### `generateSQL(params): Promise<string>`

```typescript
interface GenerateSQLParams {
  question: string
  schema: SchemaInfo
  history: ChatMessage[]  // conversation history for follow-up support
  provider: Provider
  model: string
  apiKey: string
}

export async function generateSQL(params: GenerateSQLParams): Promise<string>
```

Build the messages array for conversation context:
```typescript
const systemPrompt = buildSchemaContext(params.schema)

// Convert history to LLM messages
// For user messages: use the natural language question
// For assistant messages: use the SQL that was generated (not the explanation)
// Only include last 10 messages to avoid token overflow
const historyMessages: CoreMessage[] = params.history
  .slice(-10)
  .map(m => ({
    role: m.role,
    content: m.role === "user" ? m.content : (m.sql ?? m.content)
  }))

const messages: CoreMessage[] = [
  ...historyMessages,
  { role: "user", content: params.question }
]
```

Call Vercel AI SDK:
```typescript
const { text } = await generateText({
  model: getModel(params.provider, params.model, params.apiKey),
  system: systemPrompt,
  messages,
  maxTokens: 1000,
  temperature: 0.1,  // low temperature = more deterministic SQL
})
```

Clean the output — strip any markdown code fences if the model adds them anyway:
```typescript
function cleanSQL(raw: string): string {
  return raw
    .replace(/```sql\n?/gi, "")
    .replace(/```\n?/g, "")
    .trim()
}
```

### Retry Logic

Wrap the `generateText` call with retry (max 3 attempts, exponential backoff):

```typescript
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt === maxAttempts) throw err
      await sleep(Math.pow(2, attempt) * 500) // 1s, 2s, 4s
    }
  }
  throw new Error("Unreachable")
}
```

Import `sleep` from `@/lib/utils`.

### `generateExplanation(params): Promise<string>`

After SQL is generated and results come back, generate a brief 1-2 sentence natural language explanation of what was found. This is a separate LLM call — keep it short.

```typescript
interface GenerateExplanationParams {
  question: string
  sql: string
  rowCount: number
  provider: Provider
  model: string
  apiKey: string
}

// System: "You are a data analyst. Explain query results in 1-2 sentences. Be specific about numbers."
// User: "Question: {question}\nSQL executed: {sql}\nRows returned: {rowCount}\nWrite a brief explanation."
```

---

## File 2 — `lib/charts.ts`

### `detectChartConfig(result: QueryResult): ChartConfig`

Import `QueryResult`, `ChartConfig`, `ChartType` from `@/types`.
Import `isDateColumn`, `isNumericColumn` from `@/lib/utils`.

**Detection logic (apply in order):**

```typescript
export function detectChartConfig(result: QueryResult): ChartConfig {
  const { columns, rows } = result

  // Edge case: no data or single cell
  if (rows.length === 0 || columns.length === 0) {
    return makeConfig("table", columns, { availableTypes: ["table"] })
  }

  // Single value result (e.g. "total revenue") → show as big number in table
  if (columns.length === 1 && rows.length === 1) {
    return makeConfig("table", columns, { availableTypes: ["table"] })
  }

  const firstCol = columns[0]
  const secondCol = columns[1]
  const firstColType = inferColumnType(rows, firstCol)
  const secondColType = columns[1] ? inferColumnType(rows, secondCol) : null

  // Has a date/time column → Line chart
  const dateCol = columns.find(c => isDateColumn(c, firstColType))
  if (dateCol && secondCol) {
    const numericCol = columns.find(c => c !== dateCol && isNumericColumn(inferColumnType(rows, c)))
    return makeConfig("line", columns, {
      xKey: dateCol,
      yKey: numericCol ?? secondCol,
      availableTypes: ["line", "bar", "area", "scatter", "table"],
    })
  }

  // Exactly 2 columns: one categorical, one numeric
  if (columns.length === 2) {
    const isSecondNumeric = secondCol && isNumericColumn(inferColumnType(rows, secondCol))
    if (isSecondNumeric) {
      // Few rows (≤8) → Pie chart (good for proportions)
      if (rows.length <= 8) {
        return makeConfig("pie", columns, {
          nameKey: firstCol,
          valueKey: secondCol,
          availableTypes: ["pie", "bar", "scatter", "table"],
        })
      }
      // Many rows → Bar chart
      return makeConfig("bar", columns, {
        xKey: firstCol,
        yKey: secondCol,
        availableTypes: ["bar", "line", "area", "scatter", "table"],
      })
    }
  }

  // Multiple numeric columns → Grouped bar chart
  const numericCols = columns.slice(1).filter(c => isNumericColumn(inferColumnType(rows, c)))
  if (numericCols.length >= 2) {
    return makeConfig("bar", columns, {
      xKey: firstCol,
      yKey: numericCols[0],
      availableTypes: ["bar", "table"],
    })
  }

  // Default → Table
  return makeConfig("table", columns, { availableTypes: ["table", "bar"] })
}
```

Helper functions:
```typescript
function inferColumnType(rows: Record<string, unknown>[], col: string): string {
  // Look at first non-null value to infer JS type
  const val = rows.find(r => r[col] != null)?.[col]
  if (val instanceof Date) return "timestamp"
  if (typeof val === "number") return "numeric"
  if (typeof val === "string") {
    if (!isNaN(Date.parse(val)) && val.length > 8) return "timestamp"
    if (!isNaN(Number(val))) return "numeric"
  }
  return "text"
}

function makeConfig(type: ChartType, columns: string[], overrides: Partial<ChartConfig>): ChartConfig {
  return {
    type,
    availableTypes: ["bar", "line", "pie", "scatter", "area", "table"],
    title: undefined,
    ...overrides,
  }
}
```

---

## File 3 — `app/api/query/route.ts`

**POST `/api/query`**

This is the most important route. It orchestrates the full pipeline.

Request body: `QueryRequest` from `@/types`
```typescript
{
  question: string
  history: ChatMessage[]
  connectionString?: string
  provider: "google" | "anthropic"
  model: string
  apiKey: string
}
```

Zod schema — validate all fields. `apiKey` must be non-empty string. `question` max 500 chars.

**Pipeline:**

```typescript
export async function POST(req: NextRequest) {
  // 1. Auth
  const authError = requireAuth()
  if (authError) return authError

  // 2. Validate body
  const parsed = QueryRequestSchema.safeParse(await req.json())
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 })

  const { question, history, connectionString, provider, model, apiKey } = parsed.data

  try {
    // 3. Get schema (introspect the connected DB)
    //    Introspection is called fresh each time — consider caching by connectionString
    //    For now: call introspectSchema() directly (import from @/lib/schema)
    const schema = await introspectSchema(connectionString)

    // 4. Generate SQL via LLM
    const sql = await generateSQL({ question, schema, history, provider, model, apiKey })

    // 5. Execute SQL safely
    //    executeQuery handles: validation, read-only transaction, row limit, timeout
    const result = await executeQuery(sql, connectionString)

    // 6. Detect chart type
    const chartConfig = detectChartConfig(result)

    // 7. Generate natural language explanation (non-blocking — if it fails, that's ok)
    let explanation = ""
    try {
      explanation = await generateExplanation({
        question, sql,
        rowCount: result.rowCount,
        provider, model, apiKey,
      })
    } catch {
      explanation = `Found ${result.rowCount} result${result.rowCount !== 1 ? "s" : ""}.`
    }

    // 8. Return
    const response: QueryResponse = { sql, result, chartConfig, explanation }
    return Response.json(response)

  } catch (err) {
    const message = err instanceof Error ? err.message : "Query failed"
    console.error("[api/query]", err)
    // Return structured error — frontend will display it in the chat
    return Response.json({ error: message }, { status: 500 })
  }
}
```

**Schema caching:**
Introspecting schema on every query is slow. Add a simple in-memory cache:

```typescript
const schemaCache = new Map<string, { schema: SchemaInfo; cachedAt: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

async function getCachedSchema(connectionString?: string): Promise<SchemaInfo> {
  const key = connectionString ?? "demo"
  const cached = schemaCache.get(key)
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
    return cached.schema
  }
  const schema = await introspectSchema(connectionString)
  schemaCache.set(key, { schema, cachedAt: Date.now() })
  return schema
}
```

---

## File 4 — `app/api/dashboard/route.ts`

Dashboards are stored server-side in memory (Map) with file backup in `/tmp/querywise-dashboards.json`.

```typescript
// In-memory store (lost on serverless cold start — acceptable for demo)
const dashboards = new Map<string, Dashboard>()

// Load from file on module init
function loadFromDisk() { /* read /tmp/querywise-dashboards.json if exists */ }
function saveToDisk() { /* write dashboards map to JSON */ }
```

**POST `/api/dashboard`** — save or update dashboard
- Body: `{ dashboard: Dashboard }`
- Auth required
- If `dashboard.id` exists in map → update. Else → insert.
- Save to disk after update
- Return: `{ success: true, dashboard }`

**GET `/api/dashboard/[id]`** — load dashboard
- Auth required
- Return dashboard or 404
- Create `/api/dashboard/[id]/route.ts` for this

---

## File 5 — `app/api/share/route.ts`

**POST `/api/share`** — create share link
- Body: `{ dashboardId: string }`
- Auth required
- Generate a `shareId` using `nanoid(12)`
- Store mapping: `shareId → dashboardId` in a separate Map
- Update the dashboard with `shareId`
- Return: `{ shareId, url: process.env.NEXT_PUBLIC_APP_URL + "/share/" + shareId }`

**GET `/api/share/[shareId]`** — public, no auth required
- Look up `shareId → dashboardId → dashboard`
- Return dashboard or 404
- This is the only route without auth — it's intentionally public

Create `app/api/share/[shareId]/route.ts` for the GET.

---

## Models to Support

Export this constant — frontend will use it to populate the model picker:

```typescript
// lib/llm.ts
export const SUPPORTED_MODELS = [
  { provider: "google",    model: "gemini-1.5-pro",   label: "Gemini 1.5 Pro",   tier: "powerful" },
  { provider: "google",    model: "gemini-1.5-flash",  label: "Gemini 1.5 Flash", tier: "fast"     },
  { provider: "anthropic", model: "claude-sonnet-4-5", label: "Claude Sonnet",    tier: "powerful" },
  { provider: "anthropic", model: "claude-haiku-4-5-20251001", label: "Claude Haiku", tier: "fast" },
] as const
```

---

## Error Handling for LLM Failures

In `/api/query`, handle these specific error cases with user-friendly messages:

| Error | Return message |
|---|---|
| API key invalid (401 from provider) | "Invalid API key. Please check your settings." |
| Rate limited (429) | "Rate limit reached. Please wait a moment and try again." |
| SQL generated is invalid/blocked | "I couldn't generate a safe query for that question. Try rephrasing." |
| Query timeout | "Query took too long to execute. Try a more specific question." |
| Zero results | Not an error — return empty result with explanation |

---

## Completion Checklist

- [ ] `lib/llm.ts` exports: `generateSQL`, `generateExplanation`, `SUPPORTED_MODELS`
- [ ] `lib/charts.ts` exports: `detectChartConfig`
- [ ] `/api/query` POST — full pipeline works end to end
- [ ] `/api/dashboard` POST — saves dashboard
- [ ] `/api/dashboard/[id]` GET — loads dashboard
- [ ] `/api/share` POST — creates share link
- [ ] `/api/share/[shareId]` GET — public, no auth, returns dashboard
- [ ] Schema caching implemented (5 min TTL)
- [ ] Retry logic on LLM calls (3 attempts)
- [ ] All routes validate input with Zod
- [ ] All error cases return user-friendly messages
- [ ] `SUPPORTED_MODELS` exported from `llm.ts`
- [ ] No TypeScript errors
- [ ] No `any` types

