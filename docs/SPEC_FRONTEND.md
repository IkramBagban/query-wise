# SPEC_FRONTEND — Agent F

> Read CONTEXT.md fully before starting. You are Agent F.
> Agent S creates types — import from `src/types/index.ts`.
> Agent B1 owns `/api/auth`, `/api/connect`, `/api/schema`.
> Agent B2 owns `/api/query`, `/api/dashboard`, `/api/share`.
> Do NOT touch any files in `src/lib/` or `src/app/api/`.

---

## Your Responsibility

You own everything the user sees:

```
src/app/layout.tsx
src/app/globals.css
src/app/page.tsx                        ← Login page
src/app/workspace/page.tsx              ← Main app (chat + schema + charts)
src/app/dashboard/page.tsx              ← Dashboard builder
src/app/share/[shareId]/page.tsx        ← Public shared dashboard view

src/components/ui/                      ← Base design system components
src/components/chat/                    ← Chat interface components
src/components/charts/                  ← Chart rendering components
src/components/schema/                  ← Schema viewer components
src/components/dashboard/               ← Dashboard builder components
```

---

## Design Direction — "Dark Intelligence"

This is not a generic SaaS dashboard. It is a precision data tool that feels like a premium product. Think: Linear, Vercel dashboard, Raycast. Not: shadcn boilerplate.

**Aesthetic:** Dark. Dense but breathable. Every element has a reason to exist. Motion is functional, not decorative.

**The one thing the grader should remember:** The chat interface feels like talking to a brilliant analyst who instantly responds with beautiful charts.

### Fonts (load via `next/font/google`)
```typescript
import { Syne, Inter, JetBrains_Mono } from "next/font/google"

const syne = Syne({ subsets: ["latin"], variable: "--font-syne" })         // headings
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })       // body
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" }) // SQL
```

### CSS Design Tokens (`globals.css`)
```css
:root {
  --bg:         #0a0a0f;
  --surface:    #13131a;
  --surface-2:  #1c1c27;
  --surface-3:  #252535;
  --border:     rgba(255,255,255,0.06);
  --border-2:   rgba(255,255,255,0.12);
  --accent:     #6366f1;       /* indigo */
  --accent-dim: rgba(99,102,241,0.15);
  --accent-2:   #8b5cf6;       /* purple */
  --success:    #10b981;
  --warning:    #f59e0b;
  --danger:     #ef4444;
  --text-1:     #f1f5f9;
  --text-2:     #94a3b8;
  --text-3:     #475569;
  --radius:     8px;
  --radius-lg:  12px;
  --radius-xl:  16px;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  background: var(--bg);
  color: var(--text-1);
  font-family: var(--font-inter), system-ui, sans-serif;
  font-size: 14px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}

/* Subtle noise texture on bg */
body::before {
  content: "";
  position: fixed;
  inset: 0;
  background-image: url("data:image/svg+xml,..."); /* SVG noise */
  opacity: 0.03;
  pointer-events: none;
  z-index: 0;
}

/* Scrollbar styling */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border-2); border-radius: 3px; }

/* Selection */
::selection { background: var(--accent-dim); color: var(--accent); }
```

### Tailwind Extension (`tailwind.config.ts`)
Map all CSS vars to Tailwind utilities. Add:
```typescript
colors: {
  bg: "var(--bg)",
  surface: "var(--surface)",
  "surface-2": "var(--surface-2)",
  border: "var(--border)",
  accent: "var(--accent)",
  "accent-dim": "var(--accent-dim)",
  success: "var(--success)",
  danger: "var(--danger)",
  "text-1": "var(--text-1)",
  "text-2": "var(--text-2)",
  "text-3": "var(--text-3)",
},
fontFamily: {
  syne: "var(--font-syne)",
  sans: "var(--font-inter)",
  mono: "var(--font-mono)",
},
animation: {
  "fade-in":  "fadeIn 0.2s ease-out",
  "slide-up": "slideUp 0.25s ease-out",
  "spin-slow": "spin 2s linear infinite",
  "pulse-accent": "pulseAccent 2s ease-in-out infinite",
},
keyframes: {
  fadeIn:       { from: { opacity: "0" },                         to: { opacity: "1" } },
  slideUp:      { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "translateY(0)" } },
  pulseAccent:  { "0%,100%": { boxShadow: "0 0 0 0 rgba(99,102,241,0)" }, "50%": { boxShadow: "0 0 0 4px rgba(99,102,241,0.2)" } },
},
```

---

## Base Components (`src/components/ui/`)

### `button.tsx`
Variants: `primary` (accent bg), `ghost` (transparent + border on hover), `danger`, `icon` (square, icon only).
All have: 150ms transition, hover state, disabled state, loading state (spinner replaces content).

```tsx
// Usage examples:
<Button variant="primary" loading={isLoading}>Run Query</Button>
<Button variant="ghost" size="sm"><Plus size={14} /> Add Widget</Button>
<Button variant="icon"><Settings size={16} /></Button>
```

### `input.tsx`
Dark styled. Focus ring uses accent color. `label` prop. `error` prop shows red message below.
Monospace variant for connection string input.

### `badge.tsx`
Variants: `success`, `warning`, `danger`, `info`, `neutral`.
Tiny pill with dot indicator.

### `card.tsx`
```tsx
// surface bg, border, rounded-lg, optional hover effect
<Card className="p-4" hoverable>...</Card>
```

### `tooltip.tsx`
Use Radix UI `@radix-ui/react-tooltip` (install it). Dark bg, arrow, 200ms delay.

### `dialog.tsx`
Use Radix UI `@radix-ui/react-dialog`. Backdrop blur overlay. Slide-up animation.

### `select.tsx`
Use Radix UI `@radix-ui/react-select`. Dark styled, matches design system.

### `kbd.tsx`
Keyboard shortcut display: `<Kbd>⌘K</Kbd>` renders styled key badge.

### `spinner.tsx`
Simple animated ring using CSS. Used in Button loading state and page loading states.

### `code-block.tsx`
SQL display component. Monospace font, surface-2 bg, syntax-color keywords.
Inline copy button (Clipboard icon → Check icon on success).
```tsx
<CodeBlock sql="SELECT * FROM orders WHERE..." />
```

Syntax highlight these SQL keywords with accent color: `SELECT FROM WHERE JOIN ON GROUP BY ORDER BY LIMIT HAVING WITH AS INNER LEFT RIGHT COUNT SUM AVG MIN MAX DISTINCT`

---

## Page 1 — Login (`src/app/page.tsx`)

**Purpose:** Simple gated entry. Demo credentials are shown on page.

**Layout:**
- Full viewport, centered card
- Left side (60%): Hero copy with animated gradient text, list of example queries that cycle through
- Right side (40%): Login card with username/password

**Copy:**
- Headline: "Ask your database anything." (font-syne, large)
- Sub: "Connect your PostgreSQL database and query it in plain English."
- Demo credentials shown below the form: `demo / querywise2024`

**Behavior:**
- On submit: POST `/api/auth`
- Success: redirect to `/workspace`
- Error: shake animation on card + error message

**Client state (localStorage) setup on first login:**
- Initialize `llm_provider` = `"google"` if not set
- Initialize `llm_model` = `"gemini-1.5-flash"` if not set

---

## Page 2 — Workspace (`src/app/workspace/page.tsx`)

This is the main application. It is a three-panel layout.

```
┌─────────────────────────────────────────────────────────────────┐
│  Header: logo + connection pill + settings button               │
├──────────────┬──────────────────────────────┬───────────────────┤
│              │                              │                   │
│   Schema     │       Chat Interface         │   Result Panel    │
│   Sidebar    │                              │   (chart/table)   │
│   (280px)    │       (flex-1)               │   (380px)         │
│              │                              │                   │
│  Tables +    │  Message history             │  Chart or Table   │
│  columns     │  + input box at bottom       │  + chart switcher │
│              │                              │  + save to dash   │
└──────────────┴──────────────────────────────┴───────────────────┘
```

**On mount:**
1. Check if connected (sessionStorage `db_connection`) — if not, show Connection Modal
2. If connected, fetch schema from `/api/schema`

### Header
- Logo: "QueryWise" in font-syne with small lightning bolt icon
- Center: current connection pill (green dot + db name, or "Not connected")
- Right: Model picker (compact select), Settings icon, Dashboard icon (link to `/dashboard`)

### Connection Modal (shown on first visit or when clicking "Change DB")
Two tabs: "Demo Database" and "Custom Database"

Demo tab:
- Just a "Connect to Demo" button
- Short description of what's in the demo DB

Custom tab:
- Connection string input (monospace, placeholder: `postgresql://user:pass@host:5432/dbname`)
- Test Connection button → shows spinner → success/error state
- Connect button (only enabled after successful test)

### Schema Sidebar (`src/components/schema/`)
- List of tables, each expandable
- Each table shows: row count badge, column list with type and key indicators
- PK columns: key icon (yellow)
- FK columns: link icon (blue)
- Search box at top to filter tables/columns
- "Schema Summary" toggle — shows LLM-generated summary in a panel

Components needed:
```
src/components/schema/SchemaPanel.tsx      ← main container
src/components/schema/TableItem.tsx        ← single table with expand
src/components/schema/ColumnItem.tsx       ← single column row
src/components/schema/SchemaSummary.tsx    ← LLM summary display
```

### Chat Interface (`src/components/chat/`)
- Message list (scrollable, newest at bottom)
- Each message:
  - User: right-aligned, accent bubble
  - Assistant: left-aligned, surface-2 bg, shows thinking animation while loading
- Input area:
  - Textarea (auto-resize, max 4 lines)
  - Send button (or Enter to send, Shift+Enter for newline)
  - Below input: example query chips that auto-fill (5 rotating examples)

**Assistant message structure:**
```
┌────────────────────────────────────────────┐
│ [explanation text — 1-2 sentences]          │
│                                            │
│ [SQL code block with copy button]           │
│                                            │
│ [Result: "42 rows · 127ms"]                │
│ [View chart → ] (opens result panel)        │
└────────────────────────────────────────────┘
```

Components needed:
```
src/components/chat/ChatPanel.tsx           ← main container, manages state
src/components/chat/MessageList.tsx         ← scrollable message list
src/components/chat/MessageBubble.tsx       ← single message (user or assistant)
src/components/chat/QueryInput.tsx          ← textarea + send button + examples
src/components/chat/ThinkingIndicator.tsx   ← animated dots while LLM is working
```

**State managed in `ChatPanel.tsx`:**
```typescript
const [messages, setMessages] = useState<ChatMessage[]>([])
const [isLoading, setIsLoading] = useState(false)
const [activeResult, setActiveResult] = useState<ChatMessage | null>(null)
// activeResult drives the right panel
```

**Send flow:**
```typescript
async function handleSend(question: string) {
  // 1. Add user message to list
  // 2. Set isLoading = true, add thinking message
  // 3. POST /api/query with { question, history: messages, connectionString, provider, model, apiKey }
  // 4. On response: replace thinking message with assistant message
  // 5. Set activeResult to the new message
  // 6. Set isLoading = false
  // 7. On error: show error message in chat
}
```

### Result Panel (`src/components/charts/`)
Shown on the right when a query has results.

```
┌─────────────────────────────────────────┐
│ [Chart type switcher tabs]              │
│ BarChart | LineChart | PieChart | Table │
├─────────────────────────────────────────┤
│                                         │
│         [Chart renders here]            │
│                                         │
├─────────────────────────────────────────┤
│ [42 rows · 127ms]  [Save to Dashboard]  │
└─────────────────────────────────────────┘
```

Components needed:
```
src/components/charts/ResultPanel.tsx     ← container with tabs
src/components/charts/ChartRenderer.tsx   ← routes to correct chart
src/components/charts/BarChartView.tsx
src/components/charts/LineChartView.tsx
src/components/charts/PieChartView.tsx
src/components/charts/AreaChartView.tsx
src/components/charts/TableView.tsx
```

**Chart styling (all charts):**
- Background: transparent (inherits panel bg)
- Grid lines: `var(--border)` (subtle)
- Axis text: `var(--text-3)` 12px
- Data colors: `["#6366f1", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4"]`
- Tooltip: surface-2 bg, border, rounded, accent colored label
- All Recharts: `ResponsiveContainer width="100%" height={320}`

**TableView:**
- Styled with alternating row colors (surface / surface-2)
- Sticky header
- Sortable columns (click to sort asc/desc)
- If >50 rows: show only first 50 with "Showing 50 of N rows" note
- Numbers right-aligned
- Dates formatted as "Mar 15, 2024"

---

## Page 3 — Dashboard (`src/app/dashboard/page.tsx`)

The dashboard builder where users can save and arrange query results.

**Layout:**
- Header with dashboard name (editable inline) + Share button + Back to workspace
- Toolbar: "Add Widget" button, layout options
- Grid of widget cards (drag to reorder using CSS grid, no complex drag lib needed)
- Empty state: nice illustration + "Go ask a question and save it here"

**Widget card:**
```
┌────────────────────────────────┐
│ Widget title         [⋮ menu]  │
├────────────────────────────────┤
│                                │
│    [Mini chart - 200px tall]   │
│                                │
├────────────────────────────────┤
│ 42 rows · Last updated 2m ago  │
└────────────────────────────────┘
```

Widget menu (⋮): Edit title, Change chart type, Remove widget, Refresh query

**Share button:**
- POST `/api/share` → get shareId
- Show modal with: shareable URL (copyable), preview of what shared view looks like
- After sharing: button becomes "Shared ✓" with link icon

Components needed:
```
src/components/dashboard/DashboardPage.tsx
src/components/dashboard/WidgetCard.tsx
src/components/dashboard/ShareModal.tsx
src/components/dashboard/EmptyDashboard.tsx
```

**State:**
- Dashboard stored in localStorage as `qw_dashboard` (for persistence across refreshes)
- On save: POST `/api/dashboard` as well (server backup)

---

## Page 4 — Share View (`src/app/share/[shareId]/page.tsx`)

Public page. No auth required.

**Layout:**
- Simple header: "QueryWise" logo + "View only" badge
- Read-only grid of widgets (same widget cards, but no edit controls)
- Footer: "Create your own at querywise.app"

**Data fetching:**
- Server component: fetch `/api/share/[shareId]` on the server
- If not found: show friendly 404 page

---

## Settings Panel (slide-over from Settings icon)

Not a separate page — a slide-over sheet from the right side.

**Sections:**

**1. LLM Configuration**
- Provider select: Google / Anthropic
- Model select: populates based on provider (from `SUPPORTED_MODELS`)
- API Key input (password type, show/hide toggle)
- "Test API Key" button — makes a minimal LLM call
- These are saved to localStorage

**2. Database**
- Current connection info
- "Change Database" button → opens Connection Modal

**3. About**
- Version info
- Link to GitHub

---

## Client State Management

No Redux, no Zustand. Use React state + localStorage + sessionStorage.

```typescript
// Custom hook: src/hooks/useSettings.ts
export function useSettings() {
  const [provider, setProvider] = useLocalStorage("llm_provider", "google")
  const [model, setModel] = useLocalStorage("llm_model", "gemini-1.5-flash")
  const [apiKey, setApiKey] = useLocalStorage("llm_api_key", "")
  return { provider, setProvider, model, setModel, apiKey, setApiKey }
}

// Custom hook: src/hooks/useConnection.ts
export function useConnection() {
  // connectionString in sessionStorage (auto-cleared on tab close for security)
  // dbName, dbType in localStorage
}

// Custom hook: src/hooks/useLocalStorage.ts
// Generic hook that syncs state to localStorage
```

---

## Loading & Error States (every data operation must have these)

| State | What to show |
|---|---|
| Connecting to DB | Spinner + "Connecting..." in connection modal |
| Loading schema | Skeleton loaders in schema sidebar |
| LLM thinking | ThinkingIndicator in chat + disable input |
| Chart loading | Skeleton in result panel |
| Error in query | Red error message in chat bubble with retry button |
| Network error | Toast notification (top right, 4s auto-dismiss) |

**Toast component:**
Simple custom implementation. Variants: success, error, info.
Stack multiple toasts. Auto dismiss after 4 seconds. Manual dismiss X button.

---

## Example Queries to Show in Chat

These chips appear below the input on first load:

```typescript
const EXAMPLE_QUERIES = [
  "What were the top 5 products by revenue last month?",
  "Show me daily order count for the past 30 days",
  "Which customers placed more than 5 orders but never left a review?",
  "Compare revenue by category this quarter vs last quarter",
  "What is the average order value by customer segment?",
  "Show me orders by status breakdown",
  "Who are the top 10 customers by total spend?",
  "What's the revenue trend over the last 12 months?",
]
// Rotate through these, show 3 at a time
```

---

## Key UX Details That Make It Feel Premium

1. **Auto-scroll to bottom** of chat after each message
2. **Ctrl+Enter** to submit query
3. **Escape** to close modals
4. **Copy SQL** button on every code block (with success animation)
5. **Chart type is remembered** per message (if user switches from bar to line, it stays line)
6. **Smooth transitions** on all panel state changes (not jarring jumps)
7. **Empty states are designed** — not blank — for schema sidebar, chat, dashboard
8. **Numbers in tables are formatted** (1234567 → 1,234,567)
9. **Long SQL is collapsible** — show 3 lines, "Show more" button
10. **Connection string is masked** in UI (show only host + dbname)
11. **Thinking indicator** shows actual status: "Analyzing schema..." → "Generating SQL..." → "Executing..."

---

## File Structure to Create

```
src/
├── app/
│   ├── layout.tsx
│   ├── globals.css
│   ├── page.tsx                          ← Login
│   ├── workspace/
│   │   └── page.tsx
│   ├── dashboard/
│   │   └── page.tsx
│   └── share/
│       └── [shareId]/
│           └── page.tsx
│
├── components/
│   ├── ui/
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── badge.tsx
│   │   ├── card.tsx
│   │   ├── tooltip.tsx
│   │   ├── dialog.tsx
│   │   ├── select.tsx
│   │   ├── kbd.tsx
│   │   ├── spinner.tsx
│   │   ├── code-block.tsx
│   │   └── toast.tsx
│   │
│   ├── chat/
│   │   ├── ChatPanel.tsx
│   │   ├── MessageList.tsx
│   │   ├── MessageBubble.tsx
│   │   ├── QueryInput.tsx
│   │   └── ThinkingIndicator.tsx
│   │
│   ├── charts/
│   │   ├── ResultPanel.tsx
│   │   ├── ChartRenderer.tsx
│   │   ├── BarChartView.tsx
│   │   ├── LineChartView.tsx
│   │   ├── PieChartView.tsx
│   │   ├── AreaChartView.tsx
│   │   └── TableView.tsx
│   │
│   ├── schema/
│   │   ├── SchemaPanel.tsx
│   │   ├── TableItem.tsx
│   │   ├── ColumnItem.tsx
│   │   └── SchemaSummary.tsx
│   │
│   └── dashboard/
│       ├── WidgetCard.tsx
│       ├── ShareModal.tsx
│       └── EmptyDashboard.tsx
│
└── hooks/
    ├── useSettings.ts
    ├── useConnection.ts
    ├── useLocalStorage.ts
    └── useToast.ts
```

---

## Completion Checklist

- [ ] Design tokens applied consistently — no hardcoded colors
- [ ] All 4 pages render without errors
- [ ] Login → Workspace flow works
- [ ] Connection modal: demo + custom tabs both work
- [ ] Schema sidebar: tables expand, columns show, search works
- [ ] Chat: send message → get response → chart appears
- [ ] All 5 chart types render correctly with Recharts
- [ ] Chart type switcher works (bar/line/pie/area/table)
- [ ] "Save to Dashboard" adds widget to dashboard
- [ ] Dashboard page shows widgets in grid
- [ ] Share button generates link
- [ ] Share page loads without auth
- [ ] Settings panel: change model/provider/key
- [ ] All loading states implemented
- [ ] Error states implemented with retry
- [ ] Toast notifications work
- [ ] Responsive down to 1280px wide
- [ ] No TypeScript errors
- [ ] No `any` types
- [ ] Fonts load correctly (Syne + Inter + JetBrains Mono)