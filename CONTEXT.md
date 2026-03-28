# QueryWise — Shared Agent Context

> ALL agents must read this file completely before reading their own spec.
> This file defines the contracts, conventions, and boundaries every agent must respect.

---

## What We Are Building

A Conversational BI Platform — users connect a PostgreSQL database, ask questions in plain English, and get SQL-powered answers with auto-generated charts. Includes a pre-seeded demo ecommerce database.

**App name:** QueryWise  
**Tagline:** Ask your database anything.

---

## Tech Stack (Non-Negotiable)

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 14 (App Router) | API routes = backend. One repo, one Vercel deploy. |
| Language | TypeScript (strict) | All files `.ts` or `.tsx` |
| Styling | Tailwind CSS + custom design system | Shadcn for primitives only |
| LLM | Vercel AI SDK (`ai` package) | Providers: `@ai-sdk/google` + `@ai-sdk/anthropic` |
| Database client | `pg` (raw SQL only, no ORM) | pg Pool for connection management |
| Charts | Recharts | Wrapped in custom components |
| Icons | `lucide-react` | No other icon libraries |
| Demo DB | Neon PostgreSQL | Connection string in env |
| Deploy | Vercel | |

---

## Monorepo Structure

```
querywise/
├── CONTEXT.md                  ← this file
├── SPEC_SEED.md
├── SPEC_BACKEND.md
├── SPEC_FRONTEND.md
├── .env.local                  ← never committed
├── .env.example
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
├── package.json
│
├── scripts/
│   └── seed.ts                 ← Agent S owns this
│
└── src/
    ├── types/
    │   └── index.ts            ← Agent S creates, all agents import
    │
    ├── lib/
    │   ├── db.ts               ← Agent B1 owns
    │   ├── schema.ts           ← Agent B1 owns
    │   ├── llm.ts              ← Agent B2 owns
    │   ├── charts.ts           ← Agent B2 owns
    │   └── utils.ts            ← Agent S creates
    │
    ├── app/
    │   ├── layout.tsx          ← Agent F owns
    │   ├── page.tsx            ← Agent F owns (landing/login)
    │   ├── globals.css         ← Agent F owns
    │   │
    │   ├── dashboard/
    │   │   └── page.tsx        ← Agent F owns
    │   │
    │   ├── share/
    │   │   └── [shareId]/
    │   │       └── page.tsx    ← Agent F owns
    │   │
    │   └── api/
    │       ├── auth/
    │       │   └── route.ts    ← Agent B1 owns
    │       ├── connect/
    │       │   └── route.ts    ← Agent B1 owns
    │       ├── schema/
    │       │   └── route.ts    ← Agent B1 owns
    │       ├── query/
    │       │   └── route.ts    ← Agent B2 owns
    │       ├── dashboard/
    │       │   └── route.ts    ← Agent B2 owns
    │       └── share/
    │           └── route.ts    ← Agent B2 owns
    │
    └── components/
        ├── ui/                 ← Agent F owns (shadcn primitives + custom)
        ├── chat/               ← Agent F owns
        ├── charts/             ← Agent F owns
        ├── schema/             ← Agent F owns
        └── dashboard/          ← Agent F owns
```

---

## Environment Variables

```bash
# .env.local (agent must reference these exact names)
DEMO_DATABASE_URL=postgresql://...neon.tech/neondb?sslmode=require
DEMO_USERNAME=demo
DEMO_PASSWORD=querywise2024
NEXTAUTH_SECRET=...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

User-provided values (stored client-side only, never sent to backend except as request headers):
- `llm_api_key` → localStorage key
- `llm_provider` → localStorage key (`"google"` | `"anthropic"`)
- `llm_model` → localStorage key
- `db_connection_string` → sessionStorage key (cleared on tab close)

---

## Shared TypeScript Types (`src/types/index.ts`)

Agent S creates this file. All other agents import from it. Never redefine types locally.

```typescript
// Connection
export type DbType = "demo" | "custom"

export interface DbConnection {
  type: DbType
  connectionString?: string // only for custom
  name: string
}

// Schema
export interface SchemaColumn {
  name: string
  type: string
  nullable: boolean
  isPrimaryKey: boolean
  isForeignKey: boolean
  references?: { table: string; column: string }
}

export interface SchemaTable {
  name: string
  columns: SchemaColumn[]
  rowCount?: number
  sampleData?: Record<string, unknown>[]
}

export interface SchemaInfo {
  tables: SchemaTable[]
  relationships: Relationship[]
  summary: string // LLM-generated human readable summary
}

export interface Relationship {
  fromTable: string
  fromColumn: string
  toTable: string
  toColumn: string
}

// Query / Chat
export type MessageRole = "user" | "assistant"

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string       // natural language
  sql?: string          // generated SQL
  result?: QueryResult
  chartConfig?: ChartConfig
  error?: string
  timestamp: number
}

export interface QueryResult {
  columns: string[]
  rows: Record<string, unknown>[]
  rowCount: number
  executionTimeMs: number
}

// Charts
export type ChartType = "bar" | "line" | "pie" | "scatter" | "area" | "table"

export interface ChartConfig {
  type: ChartType
  xKey?: string
  yKey?: string
  nameKey?: string
  valueKey?: string
  title?: string
  availableTypes: ChartType[]
}

// Dashboard
export interface DashboardWidget {
  id: string
  title: string
  sql: string
  result: QueryResult
  chartConfig: ChartConfig
  // grid position
  x: number
  y: number
  w: number
  h: number
}

export interface Dashboard {
  id: string
  name: string
  widgets: DashboardWidget[]
  shareId?: string
  createdAt: number
  updatedAt: number
}

// API request/response shapes
export interface ConnectRequest {
  type: DbType
  connectionString?: string
}

export interface ConnectResponse {
  success: boolean
  name: string
  error?: string
}

export interface SchemaResponse {
  schema: SchemaInfo
}

export interface QueryRequest {
  question: string
  history: ChatMessage[]
  connectionString?: string // undefined = demo db
  provider: "google" | "anthropic"
  model: string
  apiKey: string
}

export interface QueryResponse {
  sql: string
  result: QueryResult
  chartConfig: ChartConfig
  explanation: string
}

export interface DashboardSaveRequest {
  dashboard: Dashboard
}

export interface ShareResponse {
  shareId: string
  url: string
}

// Errors
export interface ApiError {
  error: string
  details?: string
}
```

---

## API Contract (Routes)

All routes are under `/api`. All accept and return JSON.

| Method | Route | Owner | Purpose |
|---|---|---|---|
| POST | `/api/auth` | B1 | Validate demo username/password |
| POST | `/api/connect` | B1 | Test DB connection, return name |
| POST | `/api/schema` | B1 | Introspect and return schema |
| POST | `/api/query` | B2 | NL → SQL → execute → return result |
| POST | `/api/dashboard` | B2 | Save dashboard to server (file or memory) |
| GET | `/api/dashboard/:id` | B2 | Load saved dashboard |
| POST | `/api/share` | B2 | Generate shareable link for dashboard |
| GET | `/api/share/:shareId` | B2 | Load shared dashboard (public, no auth) |

**Auth:** All routes except `/api/share/:shareId` check for a session cookie set by `/api/auth`.

---

## SQL Safety Rules (Agent B1 implements, Agent B2 uses)

Every SQL string must pass through `validateAndSanitizeSql()` from `src/lib/db.ts` before execution.

Rules (in order):
1. Must start with `SELECT` or `WITH` (case-insensitive after trim)
2. Blocklist check (uppercase): `DROP`, `DELETE`, `TRUNCATE`, `UPDATE`, `INSERT`, `ALTER`, `CREATE`, `GRANT`, `REVOKE`, `EXECUTE`, `EXEC`, `CALL`, `--`, `/*`
3. Wrap in read-only transaction at execution time
4. Wrap in subquery: `SELECT * FROM (user_sql) AS _q LIMIT 500`
5. Set `statement_timeout = 15000` (15 seconds) per connection

---

## LLM Prompt Conventions (Agent B2 implements)

### System prompt must always include:
- Full schema context (from `SchemaInfo.summary` + structured table definitions)
- Instruction: return SQL only, no markdown, no explanation
- Instruction: think step by step (identify tables → joins → filters → SQL)
- Instruction: always use table aliases
- Instruction: never use DROP/DELETE/UPDATE/INSERT

### Conversation history format:
```typescript
// Pass as messages array to Vercel AI SDK generateText()
const messages = history.map(m => ({
  role: m.role,
  content: m.role === "user" ? m.content : m.sql ?? m.content
}))
```

### Model initialization:
```typescript
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createAnthropic } from "@ai-sdk/anthropic"
import { generateText } from "ai"

const model = provider === "google"
  ? createGoogleGenerativeAI({ apiKey })("gemini-1.5-pro")
  : createAnthropic({ apiKey })("claude-sonnet-4-5")
```

---

## Design System (Agent F implements)

### Color palette
```css
--color-bg:        #0a0a0f       /* near black */
--color-surface:   #13131a       /* cards */
--color-surface-2: #1c1c27       /* elevated cards */
--color-border:    #2a2a3a       /* subtle borders */
--color-border-2:  #3a3a52       /* hover borders */
--color-accent:    #6366f1       /* indigo — primary action */
--color-accent-2:  #8b5cf6       /* purple — secondary */
--color-success:   #10b981       /* emerald */
--color-warning:   #f59e0b       /* amber */
--color-danger:    #ef4444       /* red */
--color-text-1:    #f1f5f9       /* primary text */
--color-text-2:    #94a3b8       /* secondary text */
--color-text-3:    #475569       /* muted text */
```

### Typography
- Display: `Syne` (Google Fonts) — headings, logo
- Body: `Inter` — all UI text
- Mono: `JetBrains Mono` — SQL display, code

### Key UI principles
- Dark theme only
- Subtle grain texture on backgrounds (CSS noise)
- Glassmorphism for floating panels (backdrop-blur + semi-transparent bg)
- Accent color for ALL interactive elements consistently
- Micro-animations on every state change (150ms ease)
- SQL always rendered in a styled code block with syntax highlighting
- Charts have dark backgrounds with bright accent-colored data series

---

## Coding Conventions

- All API routes: validate input with Zod, return typed responses
- All async functions: try/catch, never let errors bubble unhandled
- No `any` types — use `unknown` and narrow
- Exports: named exports only (no default exports except Next.js pages)
- File naming: kebab-case for files, PascalCase for components
- Comments: only for non-obvious logic, not for obvious things
- Each file max ~200 lines — split if longer

---

## What Each Agent Owns

| Agent | Code Label | Owns | Does NOT touch |
|---|---|---|---|
| Seed + Types | **S** | `scripts/seed.ts`, `src/types/index.ts`, `src/lib/utils.ts` | Everything else |
| Backend 1 | **B1** | `src/lib/db.ts`, `src/lib/schema.ts`, `/api/auth`, `/api/connect`, `/api/schema` | LLM code, frontend |
| Backend 2 | **B2** | `src/lib/llm.ts`, `src/lib/charts.ts`, `/api/query`, `/api/dashboard`, `/api/share` | DB connection code, frontend |
| Frontend | **F** | All of `src/app/`, all of `src/components/` | API route logic, lib files |

---

## Demo Database Schema (what Seed agent will create)

Tables: `customers`, `categories`, `products`, `orders`, `order_items`, `reviews`

10,000+ orders spanning the last 12 months. Agent S owns creating this. Agent B1 connects to it. Agent B2 queries it. Agent F displays it.