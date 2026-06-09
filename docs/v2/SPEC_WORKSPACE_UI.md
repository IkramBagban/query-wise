# SPEC V2-U: Workspace Shell, Connections UI, And Persistent Navigation

## Mission

Build the V2 application experience represented by the approved reference: persistent left navigation, central conversational BI workspace, and contextual right database sidebar.

## Dependencies

- May build components against mock DTOs during Wave 1.
- Must integrate published API contracts from V2-A, V2-C, V2-H, and V2-D.
- Read relevant Next.js 16 guides before changing layouts/data fetching.

## Owned Areas

Suggested ownership:

```text
app/(private)/** pages/layouts
components/v2-shell/**
components/conversations/**
components/connections/**
components/dashboards/** UI only
components/schema/** UI only
client hooks for V2 APIs
responsive/accessibility tests
```

Do not implement feature DALs, persistence, encryption, or authorization rules.

## Required Deliverables

### 1. Persistent Left Sidebar

Sections:

- QueryWise logo
- Home
- Connections
- Settings
- New Chat
- recent dashboards with "See all dashboards"
- recent conversation history with "See all history"
- Clerk user/profile control

Behavior:

- selected route/resource is clearly highlighted
- New Chat asks for a connection when needed
- selecting history opens that conversation
- selecting a dashboard opens it
- lists are compact and paginated/lazy beyond the recent subset

### 2. Main Conversation Workspace

Support:

- empty-state prompt suggestions
- persistent message history
- streamed assistant/query progress
- SQL-backed chart result cards
- save result to an existing/new dashboard
- active model controls already supported by the product
- clear distinction between the active conversation and a new chat

The workspace must use `conversationId`, not browser-only message state, as the durable identity.

### 3. Contextual Right Sidebar

Tabs:

- Schema
- SQL Preview
- DB Summary

Schema tab:

- active connection status/name
- searchable table list
- row-count display when available
- expandable columns/relationships
- refresh schema action

SQL Preview:

- generated SQL for selected/latest query result
- copy/export affordance
- empty state when no SQL exists

DB Summary:

- saved generated summary
- metadata sync status
- link to full connection settings

### 4. Connections Page

Users can:

- view multiple saved connections
- add a PostgreSQL connection
- test and save
- open details
- rename/update/retest/delete
- refresh schema
- see safe connection metadata and sync health

Never render a saved credential after creation.

### 5. Multiple Dashboards UI

Users can:

- list/create/open/rename/delete dashboards
- add a result to a chosen dashboard
- arrange widgets
- open sharing controls

Sharing dialog supports:

- link sharing
- password protection
- direct email sharing
- revoke controls

### 6. Settings Page

Settings contains:

- profile/account link through Clerk
- LLM provider/model/API-key controls
- connection-management entry point
- security/privacy explanation

Detailed schema exploration belongs on the connection detail page and quick schema context remains in the workspace right sidebar.

### 7. State Strategy

- Server data is the source of truth.
- Browser state controls transient UI only.
- Do not persist connection credentials or full conversations in browser storage.
- Use optimistic updates only where rollback/error behavior is clear.

### 8. Responsive Behavior

- Desktop: three-column shell.
- Tablet: collapsible left sidebar and right drawer.
- Mobile: main conversation first; navigation and context panels become sheets/drawers.

## Acceptance Criteria

- Navigation and recent-resource lists persist across page navigation.
- Refreshing restores the active conversation/dashboard from server state.
- Switching conversations restores correct connection, messages, SQL, and charts.
- Right sidebar always reflects the active conversation connection.
- Saving a result allows dashboard selection/creation.
- No credentials are rendered or stored client-side.
- Keyboard navigation, focus management, and empty/loading/error states are implemented.
- `npm run build` passes.

## Tests

- route/navigation state
- conversation switching
- dashboard selection during save
- responsive sidebar/drawer behavior
- loading/error/empty states
- accessibility checks for tabs, dialogs, and navigation

