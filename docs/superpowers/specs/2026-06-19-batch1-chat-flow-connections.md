# Batch 1 Spec: Chat Start Flow + Connection Form + Connections Page

**Date:** 2026-06-19  
**Status:** Draft  

---

## Overview

This spec covers three tightly related UX improvements that collectively make the onboarding and connection management experience feel polished and intentional:

1. **Chat start flow** — Remove the full-screen "choose a connection" gate; instead surface an inline, mid-page input on first load, with a connection picker embedded directly in the chat composer (like the existing provider/model dropdowns). If a user tries to switch connection mid-conversation, block it with a "start a new chat" prompt.

2. **Connection form redesign** — Replace the single "paste a connection URI" field with a proper multi-field form (host, port, database, username, password + SSL toggle). Add a "Test connection" button before the user commits. Replace the current database-type tile (just PostgreSQL shown awkwardly) with a clean dropdown. Remove the "Edit connection" feature entirely.

3. **Connections page cleanup** — Show the real database-type icon (PostgreSQL elephant, etc.) on connection cards. Remove duplicate actions (the three-dot menu and "Import URL" button do nothing / duplicate "Add connection"). Clean up the expanded card layout. Remove the edit connection flow.

---

## 1. Chat Start Flow

### Current state

`NewConversationView` in [components/v2/WorkspaceView.tsx](components/v2/WorkspaceView.tsx) occupies the full viewport and requires the user to pick a connection before they see any input box. This is a jarring gate-screen anti-pattern.

`ConversationView` in the same file has a `Composer` component at the bottom that already shows provider/model dropdowns. We want to replicate this pattern for connections.

When a user navigates to `/workspace/new`, they see `NewConversationView`. We will replace this with an "empty chat" layout that shows the input centered on the page (similar to ChatGPT / Claude.ai), with the connection picker inside the composer.

### New behaviour

**Empty state (no conversation yet):**

- URL: `/workspace/new`
- Show a centered composer — full-width input area, vertically centered with a welcome headline above it.
- Inside the composer toolbar (alongside provider + model dropdowns), add a **Connection** dropdown.
  - Lists all user connections fetched from `connectionsApi.list()`.
  - Has a "Demo database" option at the top.
  - Has a "+ Add connection" option at the bottom that navigates to `/connections/new`.
  - Default: if the user has a previously used connection in sessionStorage (`CONNECTION_KEY`), pre-select it. Otherwise blank / "Select a database".
- The **Run** button is disabled until both a connection and non-empty input are provided.
- When user submits: create the conversation (`conversationsApi.create(connectionId)`), then immediately submit the query via `conversationsApi.submitStream(...)`. Navigate to `/workspace/[conversationId]`.

**Active conversation (mid-conversation switch attempt):**

- The connection name is shown as a read-only badge/label next to the composer — NOT a dropdown.
- If a user somehow tries to change it (we expose no UI for this), nothing happens.
- We add a small "connection locked" visual indicator: the connection name is displayed as a static pill, not a clickable dropdown.
- If we want to provide discoverability: on hover of the connection pill, show a tooltip: "To use a different database, start a new chat."

**Connection polling during schema sync:**

- `NewConversationView` currently polls the connection for schema sync status. We keep this logic but move it into the composer: while the selected connection has a non-`ready` schema sync status, show a subtle inline warning in the composer: "Schema syncing — your first query may be slower." The Run button is still enabled (don't block on schema).

### Files to change

| File | Change |
|------|--------|
| `components/v2/WorkspaceView.tsx` | Replace `NewConversationView` full-screen gate with `EmptyWorkspaceView` (centered composer). Modify `Composer` to accept `connectionId` prop + connection picker. Add `ConnectionPicker` sub-component. |
| `app/(private)/workspace/new/page.tsx` | **Create this file** — it does not currently exist. Simple page wrapper rendering `EmptyWorkspaceView`. Also ensure `app/(private)/workspace/[conversationId]/page.tsx` exists and renders `ConversationView`. |
| `components/v2/AppShell.tsx` | "New chat" link already navigates to `/workspace/new` — no change needed |

### ConnectionPicker component spec

```tsx
// Inside WorkspaceView.tsx or extracted to components/v2/ConnectionPicker.tsx
interface ConnectionPickerProps {
  value: string | null;             // selected connectionId
  onChange: (id: string) => void;
  disabled?: boolean;               // true when in an active conversation
}
```

- Renders as a `<Select>` (shadcn) or a custom styled dropdown consistent with the provider/model selectors already in Composer.
- Items: `[Demo, ...connections]` + divider + `[+ Add connection]`.
- Shows a small database icon next to each item (postgresql elephant SVG).
- While connections are loading, show a skeleton/spinner inside the dropdown trigger.
- Error state: if connections fail to load, show "Could not load — retry" option.

---

## 2. Connection Form Redesign

### Current state

`AddConnectionDialog` in [components/v2/ConnectionsView.tsx](components/v2/ConnectionsView.tsx) has:
- A text input for "Connection name"
- A text input for "Connection string" (single URI field)
- A "Connect database" button

The database type selector shows a single tile with "PostgreSQL" and a hardcoded description. This is misleading because it implies more options exist.

### New behaviour

**Database type selector:**

Replace the tile grid with a simple `<Select>` dropdown. Currently only PostgreSQL is supported, so the dropdown has one option: `PostgreSQL — Connect using a PostgreSQL connection string`. This is cleaner and honest. The dropdown is disabled (greyed out) since only one option exists. Label: "Database type".

**Connection fields — two modes:**

Provide a **tabbed or toggle switch** between:
- "Connection URL" mode (single URI field, for power users)
- "Individual fields" mode (host, port, database, username, password, SSL checkbox)

Default to "Individual fields" mode. The toggle lives just below the database type selector.

**Individual fields layout** (inspired by Julius AI / TablePlus):

| Field | Placeholder | Type | Notes |
|-------|-------------|------|-------|
| Connection name | "Production analytics" | text | Required |
| Host | "db.example.com" | text | Required |
| Port | "5432" | number | Default: 5432 |
| Database | "mydb" | text | Required |
| Username | "postgres" | text | Required |
| Password | "••••••••" | password | Required |
| SSL mode | Checkbox "Require SSL" | checkbox | Default: checked |

Below the fields: a helper text: "Credentials are encrypted and never shown again."

**Connection URL mode:**

Single textarea/input: "postgresql://user:password@host:5432/dbname"

**Test connection button:**

Add a prominent **"Test connection"** button BEFORE the "Connect database" / submit button.

- Clicking it calls `connectionsApi.test()` (POST `/api/connections/[id]/test`) — but we don't have an ID yet at creation time. 
- For the creation flow, we need a **pre-save test endpoint**: POST `/api/connect/test` that accepts a raw connection string and returns `{ success, latencyMs?, error? }`. The existing `/api/connect` legacy route already does this — we can reuse/rename it.
- While testing: button shows spinner + "Testing…"
- On success: green checkmark badge + "Connected — 42ms"
- On failure: red badge + error message (e.g., "Connection refused", "Authentication failed")
- The "Connect database" submit button is enabled regardless of test status (user can skip the test), but after a successful test, the button text changes to "Save connection →".

**Remove Edit Connection:**

- Delete the edit connection route `app/(private)/connections/[connectionId]/settings/` and any "Edit connection" buttons from `ConnectionCard` in `ConnectionsView.tsx`.
- The `updateConnection` API and service function can remain (they may be used internally) but we remove all UI surface for it.

### API: pre-save connection test

The existing `POST /api/connect` accepts `{ type: "custom", connectionString }` and returns `{ success, name, error }`. We will:
- Keep this route as-is (it's already correct).
- In the new form, when the user clicks "Test connection" in individual-fields mode, assemble the connection string client-side from the fields: `postgresql://[user]:[pass]@[host]:[port]/[database]?sslmode=[require|disable]` and call POST `/api/connect`.
- In URL mode, call the same endpoint with the raw string.

### Files to change

| File | Change |
|------|--------|
| `components/v2/ConnectionsView.tsx` | Replace `AddConnectionDialog` internals. Add `ConnectionFormFields` component, `TestConnectionButton`, toggle between URL/fields mode. Remove `EditConnectionDialog` entirely. |
| `app/(private)/connections/[connectionId]/settings/page.tsx` | Delete (or redirect to `/connections`) |
| `components/v2/ConnectionsView.tsx` | Remove "Edit connection" from `ConnectionCard` expanded actions |
| `lib/v2/connections/validation.ts` | No change needed — `createConnectionSchema` already accepts `connectionString` |

### Connection string assembly utility

```ts
// lib/v2/connections/assemble-url.ts
export function assemblePostgresUrl(fields: {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
}): string {
  const sslParam = fields.ssl ? "?sslmode=require" : "?sslmode=disable";
  const encodedPass = encodeURIComponent(fields.password);
  const encodedUser = encodeURIComponent(fields.username);
  return `postgresql://${encodedUser}:${encodedPass}@${fields.host}:${fields.port}/${fields.database}${sslParam}`;
}
```

---

## 3. Connections Page Cleanup

### Current state

`ConnectionsListView` in [components/v2/ConnectionsView.tsx](components/v2/ConnectionsView.tsx):
- Shows a generic green database icon for all connections (no provider-specific icon).
- `ConnectionCard` expanded section shows actions twice: once as inline buttons (Open schema, Refresh, Delete) and again inside the expanded section (Open schema, Refresh schema, Edit connection, Delete connection).
- Three-dot menu (`⋮`) exists but does nothing.
- Page header has both **"+ Add connection"** and **"Import URL"** buttons — they do the same thing (open the same form). "Import URL" should be removed.

### New behaviour

**Real database icons:**

- Add a PostgreSQL SVG icon (the blue/teal elephant) to the project at `public/icons/postgresql.svg`.
- In `ConnectionCard`, replace the generic icon with `<img src="/icons/postgresql.svg" />` when `connection.providerId === "postgresql"`.
- Size: 32×32px, rounded corners matching the existing card style.

**Remove duplicate actions:**

- `ConnectionCard` (collapsed state): keep the 3 action buttons — "Open schema", "Refresh", "Delete". Remove the three-dot `⋮` menu entirely.
- `ConnectionCard` (expanded state): the expanded section currently duplicates these buttons at the bottom. Remove the duplicate button row from the expanded section. The expanded section should only show the metadata grid (Host, Readiness, Last tested, Schema status, Database, Provider, Capabilities).
- The "Edit connection" button in the expanded section: remove (per the "no edit connection" decision).

**Remove "Import URL" button:**

- Delete the "Import URL" button from the page header in `ConnectionsListView`.
- Keep only the green **"+ Add connection"** button.

**Improved card design:**

- Connection name: bold, larger text.
- Status badges: `connected` (green dot), `error` (red dot), schema sync status.
- Expandable section: clean two-column metadata grid, no action duplication.
- Hover state on the card: subtle border highlight.

### Files to change

| File | Change |
|------|--------|
| `components/v2/ConnectionsView.tsx` | Remove three-dot menu, remove duplicate buttons in expanded state, remove "Import URL" button, add PostgreSQL icon, remove "Edit connection" button |
| `public/icons/postgresql.svg` | Add PostgreSQL elephant SVG icon |
| `app/(private)/connections/[connectionId]/settings/page.tsx` | Delete file (no edit flow) |

---

## Data Flow Summary

```
User lands on /workspace/new
  → EmptyWorkspaceView renders centered Composer
  → Composer loads connections via connectionsApi.list()
  → User picks connection from ConnectionPicker dropdown
  → User types question, hits Run
  → conversationsApi.create(connectionId) → conversationId
  → conversationsApi.submitStream({ conversationId, question, ... })
  → Navigate to /workspace/[conversationId]
  → ConversationView renders with locked connection pill

User lands on /connections/new
  → NewConnectionView renders AddConnectionDialog
  → User selects Individual Fields mode (default)
  → User fills host/port/database/username/password
  → User clicks "Test connection"
  → client assembles postgres URL → POST /api/connect → { success, latencyMs }
  → Success badge shown
  → User clicks "Connect database"
  → connectionsApi.create({ name, providerId: "postgresql", connectionString })
  → Navigate to /connections
```

---

## Open Questions / Decisions Made

| Decision | Choice | Reason |
|----------|--------|--------|
| Connection field mode default | Individual fields | More approachable for non-technical users |
| Test before save required? | No — optional | Don't block power users who know their URI |
| Edit connection | Removed | Complexity vs. value; delete + re-add is simpler |
| Import URL button | Removed | Duplicate of Add connection |
| Three-dot menu | Removed | Does nothing; clutter |
| Schema sync blocking Run | No | Schema is async; first query may just be slower |
| Connection switch in active chat | Blocked with tooltip | Prevents confusion about which DB is being queried |
