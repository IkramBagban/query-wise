# Batch 3 Spec: Chat Screen — Sidebar Collapsibility + State Sync + Input Bar Cleanup

**Date:** 2026-06-19  
**Status:** Draft  

---

## Overview

This spec covers three improvements to the chat/workspace screen that make it feel polished and intentional:

1. **Left sidebar — collapsible to icon rail:** When the user collapses the left sidebar, it doesn't disappear entirely — it narrows to a slim vertical strip (~52px) that shows only icon buttons for each nav section. Hovering an icon shows the section name in a tooltip. This is the VS Code / Linear / Notion pattern.

2. **Right sidebar (Context Panel) — fully closable:** The right-side schema/SQL/summary panel is closed by default. A small icon button in the top-right of the workspace header toggles it open/closed. This panel fully hides (no icon rail — it's a context tool, not primary nav).

3. **Chat input cleanup + "save to dashboard" state sync:** Remove the "Ready" status word from the input area. When the user saves a result to a dashboard ("Create new and save"), update the sidebar's dashboard list in real time so the new dashboard appears without requiring a page refresh.

---

## 1. Left Sidebar — Collapsible to Icon Rail

### Current state

`AppShell.tsx` in [components/v2/AppShell.tsx](components/v2/AppShell.tsx) renders a full-width sidebar (240px) with:
- Logo at top
- Nav section: Home, Search, Connections, Settings icon+label links
- "New chat" button
- Dashboards list (first 3)
- Chat history (infinite scroll)
- Theme toggle + user control at bottom

The sidebar is always shown at full width. On mobile there is a drawer variant but no desktop collapse.

### New behaviour

**Collapsed state (icon rail, ~52px wide):**

- Shows only icons for each nav item, no labels.
- A small toggle button (chevron-right icon `›`) at the top of the rail, below the logo area. Clicking expands.
- Logo collapses to just the logomark icon (e.g., if there's a standalone icon version of the QueryWise logo; if not, use the first letter "Q" styled).
- Nav items: icon only, with tooltip on hover showing the label.
- "New chat" button: icon only (pencil/edit icon).
- Dashboards and Chat history sections: hidden entirely in collapsed state (they need labels to be useful).
- Theme toggle: icon only.
- User control: avatar icon only.

**Expanded state (full sidebar, 240px wide):**

- Identical to current sidebar, plus a collapse toggle button (chevron-left icon `‹`) at the top.

**Toggle persistence:**

- Store sidebar state in localStorage: `querywise.sidebar.collapsed` = `"true"` | `"false"`.
- Default: `"false"` (expanded) for new users.

**Transition animation:**

- CSS `transition: width 200ms ease` on the sidebar element.
- Icons stay fixed-position during transition (no jitter).
- Main content area adjusts its left margin via the same transition.

**Implementation — layout structure:**

The `AppShell` currently uses a fixed-width left div + a main content div. We make the sidebar width a CSS variable driven by the collapsed state:

```tsx
// In AppShell.tsx
const [collapsed, setCollapsed] = useLocalStorage<boolean>(
  "querywise.sidebar.collapsed",
  false
);

<div
  className={cn(
    "flex-shrink-0 transition-all duration-200 border-r border-border",
    collapsed ? "w-[52px]" : "w-[240px]"
  )}
>
  {/* Sidebar content */}
</div>
```

**Sidebar sections in collapsed mode:**

```
┌────┐
│ [Q]│  ← logomark / initial
├────┤
│ [›]│  ← expand toggle
├────┤
│[🏠]│  ← Home (tooltip: "Home")
│[🔍]│  ← Search chats (tooltip: "Search")
│[🔌]│  ← Connections (tooltip: "Connections")
│[⚙]│  ← Settings (tooltip: "Settings")
├────┤
│[✏]│  ← New chat (tooltip: "New chat")
├────┤
│    │  ← dashboards + history: hidden
├────┤
│[☀]│  ← theme toggle
│[👤]│  ← user avatar
└────┘
```

**Hover tooltip for icon-rail items:**

Use shadcn `<Tooltip>` component (already available). Wrap each icon button:

```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <button>{icon}</button>
  </TooltipTrigger>
  <TooltipContent side="right">{label}</TooltipContent>
</Tooltip>
```

### Files to change

| File | Change |
|------|--------|
| `components/v2/AppShell.tsx` | Add collapsed state, icon-rail render branch, toggle button, localStorage persistence, transition styles |
| `hooks/use-local-storage.ts` | Add if not present — simple hook wrapping localStorage get/set with JSON serialization |

---

## 2. Right Sidebar (Context Panel) — Fully Closable

### Current state

`ContextPanel` inside [components/v2/WorkspaceView.tsx](components/v2/WorkspaceView.tsx) is the right-side panel showing:
- "ACTIVE DATA SOURCE" header
- Schema browser tabs (Schema, SQL, Summary)

It is always visible when in a conversation. It occupies a fixed width on the right side of the workspace. There is no close button.

### New behaviour

**Default state: closed.**

- New users, and any time a new conversation starts, the right panel is closed.
- Persist the open/closed state in localStorage: `querywise.contextPanel.open` = `"true"` | `"false"`.
- Default: `"false"` (closed).

**Toggle button:**

- Position: top-right corner of the workspace content area, inside the header row.
- Icon: `<PanelRightOpen size={16} />` (closed state) / `<PanelRightClose size={16} />` (open state).
- Tooltip: "Show schema panel" / "Hide schema panel".
- Style: small icon button, same style as other header icon buttons.

**Transition:**

- CSS `transition: width 200ms ease` on the right panel.
- Closed: `width: 0; overflow: hidden`.
- Open: `width: 320px` (or current fixed width, keep consistent).

**Conversation header layout (new):**

The workspace header currently doesn't have a dedicated area for the panel toggle. Add it as a flex row:

```
[← Back to home]          [connection pill]          [⊞ Panel toggle]
```

The panel toggle button lives on the far right of the header.

**When closed:**

- The main conversation content (messages list + composer) expands to fill the full width.
- No icon rail — this is not primary navigation.

### Files to change

| File | Change |
|------|--------|
| `components/v2/WorkspaceView.tsx` | Add `contextPanelOpen` state (localStorage), toggle button in conversation header, conditional width on `ContextPanel` wrapper |
| `hooks/use-local-storage.ts` | Shared with Batch 3.1 above |

---

## 3. Chat Input Cleanup + Dashboard State Sync

### 3a. Remove "Ready" from input area

### Current state

The `Composer` component in [components/v2/WorkspaceView.tsx](components/v2/WorkspaceView.tsx) shows a "Ready" text label next to the Run button (or in the composer toolbar). This is a status indicator that adds noise — it doesn't convey useful information to the user.

### New behaviour

- Remove the "Ready" text/badge entirely from the Composer.
- The input area should be clean: just the textarea, the toolbar row (Connection picker / provider / model dropdowns), and the Run button.
- Status is shown contextually only when something is happening (loading spinner during query, error message on failure).

### Files to change

| File | Change |
|------|--------|
| `components/v2/WorkspaceView.tsx` | Remove "Ready" label/badge from Composer render |

---

### 3b. Save-to-Dashboard State Sync

### Current state

`AssistantMessage` in [components/v2/WorkspaceView.tsx](components/v2/WorkspaceView.tsx) has a "Save to dashboard" flow. When the user saves a result, it calls `dashboardsApi.createWidget(...)` or creates a new dashboard. After saving, the sidebar's dashboard list is NOT updated — the user has to refresh to see the new dashboard in the sidebar nav.

The sidebar dashboard list is rendered in `AppShell.tsx`'s `Sidebar` component. It fetches dashboards via `dashboardsApi.list(3)` on mount.

### Root cause

The sidebar and the workspace live in separate component trees, both under `AppShell`. There is no shared signal for "a dashboard was created." The `AppStateProvider` has `addDashboardWidget()` but only updates local state — it doesn't trigger a sidebar re-fetch.

### New behaviour

After a successful "Create new and save" or save-to-existing operation in the workspace, the sidebar should immediately show the updated dashboard list.

**Implementation approach — event-based invalidation:**

Use a simple React context counter (or a `useSWR`/`useQuery` invalidation key) to signal the sidebar to re-fetch:

1. Add a `dashboardVersion` counter to `AppStateProvider` (or a separate lightweight context).
2. When a dashboard is created/modified in the workspace, increment `dashboardVersion`.
3. The sidebar's `SidebarChatHistory` / dashboard list uses `dashboardVersion` as a dependency key for its `useEffect` fetch.

This avoids adding a heavy data-fetching library. Since `AppStateProvider` already wraps both the AppShell and the workspace, this is straightforward.

**Alternative (simpler for this specific case):** 

Since the AppShell's sidebar already fetches dashboards with `useEffect` on mount, add a `key` prop to the dashboard list sub-component that changes when a new dashboard is created. This forces a remount and re-fetch.

**Chosen approach: `dashboardVersion` counter in AppStateProvider.**

```tsx
// store/app-state/types.ts — add:
dashboardVersion: number;
bumpDashboardVersion: () => void;

// store/app-state/provider.tsx — add:
const [dashboardVersion, setDashboardVersion] = useState(0);
const bumpDashboardVersion = useCallback(() => {
  setDashboardVersion(v => v + 1);
}, []);

// In workspace, after successful dashboard create:
bumpDashboardVersion();

// In AppShell sidebar, dashboard list fetch useEffect:
useEffect(() => {
  fetchDashboards();
}, [dashboardVersion]);
```

**Toast message update:**

After successful save, show a toast: "Saved to [Dashboard name]" with a link to the dashboard. Currently there may be a generic success toast — make it specific with a clickable link.

### Files to change

| File | Change |
|------|--------|
| `store/app-state/types.ts` | Add `dashboardVersion: number`, `bumpDashboardVersion: () => void` |
| `store/app-state/provider.tsx` | Implement `dashboardVersion` counter + `bumpDashboardVersion` |
| `components/v2/WorkspaceView.tsx` | Call `bumpDashboardVersion()` after successful dashboard create |
| `components/v2/AppShell.tsx` | Add `dashboardVersion` to sidebar dashboard list `useEffect` dependency |

---

## Full Data Flow Summary

```
User opens app
  → AppShell renders with sidebar collapsed state from localStorage
  → If collapsed: 52px icon rail; if expanded: 240px full sidebar
  → ContextPanel closed by default (from localStorage)

User clicks collapse toggle on sidebar
  → Sidebar transitions 240px → 52px
  → Labels disappear; icons remain
  → localStorage persisted

User is in conversation, opens context panel
  → Clicks panel-right-open icon in workspace header
  → Right panel transitions 0px → 320px
  → localStorage persisted

User saves result to new dashboard
  → dashboardsApi.create("My Dashboard") → dashboardsApi.createWidget(...)
  → bumpDashboardVersion() called in AppStateProvider
  → Sidebar useEffect fires → re-fetches dashboards
  → New dashboard appears in sidebar list immediately
  → Toast: "Saved to My Dashboard →" with clickable link
```

---

## Open Questions / Decisions Made

| Decision | Choice | Reason |
|----------|--------|--------|
| Left sidebar collapse style | Icon rail (not full hide) | Primary nav should remain accessible |
| Icon rail width | 52px | Enough for icon + 8px padding each side |
| Sidebar collapse default | Expanded | First-time UX; user can collapse if they want |
| Right panel default | Closed | Reduces visual noise; advanced users open it |
| Right panel icon rail? | No | It's a context panel, not nav |
| State sync mechanism | `dashboardVersion` counter in AppStateProvider | Simple, no extra libraries, fits existing patterns |
| "Ready" text | Removed | No information value |
| Sidebar dashboards in collapsed | Hidden | Can't show list without labels; nav icons suffice |
| Transition duration | 200ms | Fast enough to not feel sluggish |
| LocalStorage keys | `querywise.sidebar.collapsed`, `querywise.contextPanel.open` | Consistent with existing `querywise.*` namespace |
