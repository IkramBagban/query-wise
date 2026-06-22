# Batch 2 Spec: Dashboard Loading Skeletons + Drag/Resize + Share Modal Overhaul

**Date:** 2026-06-19  
**Status:** Draft  

---

## Overview

This spec covers the three dashboard-level improvements needed to make the dashboard feature production-quality:

1. **Loading skeletons** — Replace blank/spinner states on the dashboard page with proper content-aware skeleton placeholders that match the grid layout.

2. **Drag, drop, and resize overhaul** — The current `DashboardGrid.tsx` uses a custom implementation that has rough edges: dragging is not smooth, the resize handle icon is awkward, dropping doesn't intelligently reorder other widgets, and resizing only works from the bottom-right corner. We will replace the entire layout engine with **`@dnd-kit`** (drag-and-drop) paired with **`react-resizable-panels`** or a purpose-built grid library. After evaluating the options, the recommendation is **`react-grid-layout`** — it is the most battle-tested solution for dashboard grids (Grafana, Kibana, and most BI tools use it or its fork), supports drag, resize from all edges/corners, auto-packing, and animated reorder.

3. **Share modal overhaul** — Strip out the email share tab, add public link management (create, copy, revoke), add password-protected link creation, improve sizing and visual design of the modal.

---

## 1. Dashboard Loading Skeletons

### Current state

`DashboardDetailView` in [components/v2/DashboardsView.tsx](components/v2/DashboardsView.tsx) and `DashboardGrid` in [components/v2/DashboardGrid.tsx](components/v2/DashboardGrid.tsx) show either nothing or a spinner while loading. Widget data fetched from the API is shown immediately or not at all.

### New behaviour

**Page-level skeleton:**

When the dashboard page is loading (before `dashboardsApi.get(id)` resolves):
- Show the page header area as skeleton: title bar with fake title pill + fake "Edit layout" / "Share" button shapes.
- Below it, show a 2-column skeleton grid: 2–3 fake widget cards with shimmer animation, each occupying realistic proportions (one wide chart at top, two smaller below).

**Widget-level skeleton:**

Each `WidgetCard` should show a skeleton state while its data is loading:
- Card with header skeleton (title pill).
- Chart area: a shimmer rectangle that fills the chart area.
- Once data resolves, fade in the real chart.

**Implementation approach:**

Use the existing `shadcn` `Skeleton` component (`components/ui/skeleton.tsx` — or add it if not present). Compose `DashboardPageSkeleton` and `WidgetCardSkeleton` components.

**Skeleton layout (3 widgets placeholder):**

```
┌─────────────────────────────────────────┐
│  ████████████░░░░░░░░░  [■■■] [■■■■■]   │  ← header skeleton
├────────────────────────┬────────────────┤
│  ░░░░░░░░░░░░░░░░░░░░  │  ░░░░░░░░░░░  │  ← widget skeleton row
│  ░░░░░░░░░░░░░░░░░░░░  │  ░░░░░░░░░░░  │
│  ░░░░░░░░░░░░░░░░░░░░  │  ░░░░░░░░░░░  │
├────────────────────────┴────────────────┤
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │  ← wide widget skeleton
└─────────────────────────────────────────┘
```

### Files to change

| File | Change |
|------|--------|
| `components/v2/DashboardsView.tsx` | Add `DashboardPageSkeleton` component; render it while data loads |
| `components/v2/DashboardGrid.tsx` | Add `WidgetCardSkeleton`; render per-widget while chart data loads |
| `components/ui/skeleton.tsx` | Add if not present (shadcn Skeleton: `bg-muted animate-pulse rounded-md`) |

---

## 2. Drag, Drop, and Resize Overhaul

### Library recommendation: `react-grid-layout`

After evaluating three options:

| Library | Drag | Resize (all edges) | Auto-reorder | Bundle size | Maturity |
|---------|------|-------------------|--------------|-------------|---------|
| `react-grid-layout` | ✅ | ✅ all edges/corners | ✅ | ~45KB | Very mature (Grafana, Kibana) |
| `@dnd-kit` + manual resize | ✅ | ❌ needs custom impl | Partial | ~25KB | Modern but more DIY |
| Custom (current) | Partial | ❌ bottom-right only | ❌ | 0 | Fragile |

**Decision: `react-grid-layout`.**

- Supports drag from anywhere on the widget header.
- Supports resize from **all 8 handle positions** (edges + corners).
- Auto-packs: dragging over other widgets causes them to shift aside (gravity down). Dropping away from grid returns them.
- Provides `Responsive` variant for breakpoints.
- Existing `layout: { x, y, w, h }` on widgets maps 1:1 to react-grid-layout's layout format.
- The library is actively maintained and widely deployed in production dashboards.

### Installation

```bash
npm install react-grid-layout
npm install --save-dev @types/react-grid-layout
```

Add CSS import (once, in root layout or dashboard page):
```ts
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
```

### Current layout data model

Each widget has `layout: { x: number; y: number; w: number; h: number }` stored in `DashboardWidgetRecord`. These map directly to react-grid-layout's item format:
```ts
{ i: widgetId, x, y, w, h, minW: 2, minH: 3 }
```

The existing `dashboardsApi.updateWidgetLayouts()` bulk-updates layouts — we keep this API call.

### New `DashboardGrid` behaviour

**View mode (default, `isEditing = false`):**
- Grid is rendered but NOT draggable or resizable.
- `isDraggable={false}` `isResizable={false}` on `<ResponsiveGridLayout>`.
- Widgets render as normal cards.
- No resize handles visible.

**Edit mode (`isEditing = true`, after clicking "Edit layout"):**
- `isDraggable={true}` `isResizable={true}`.
- Each widget shows a subtle "drag here" cursor change on the header area.
- Resize handles appear at all edges and corners (react-grid-layout renders these automatically via `react-resizable`).
- Style the resize handles: thin 4px accent-color border on active corner, no ugly icon. Use CSS to override the default handle appearance:
  ```css
  .react-resizable-handle {
    background: none;
    border: none;
  }
  .react-resizable-handle::after {
    content: '';
    position: absolute;
    right: 4px;
    bottom: 4px;
    width: 8px;
    height: 8px;
    border-right: 2px solid var(--color-primary);
    border-bottom: 2px solid var(--color-primary);
  }
  ```
- **Ghost/placeholder during drag:** react-grid-layout automatically renders a placeholder element where the dragged widget will land. Style this as a semi-transparent dashed outline:
  ```css
  .react-grid-placeholder {
    background: var(--color-primary);
    opacity: 0.1;
    border: 2px dashed var(--color-primary);
    border-radius: 8px;
  }
  ```
- **Auto-reorder:** When dragging a widget over other widgets, react-grid-layout automatically pushes them aside (default behaviour). This gives the "make space" effect. When the user drags away without dropping, widgets return to their previous positions.
- On `onLayoutChange(newLayout)`: debounce 800ms then call `dashboardsApi.updateWidgetLayouts(dashboardId, newLayout.map(...))`.

**Grid constraints:**
- `cols={12}` (12-column grid, same as current).
- `rowHeight={80}` pixels per row unit.
- `margin={[12, 12]}` gap between widgets.
- `minW={2}` minH={3}` per widget.
- `maxW={12}` (full width).
- `compactType="vertical"` — widgets pack upward when space opens.

**"Edit layout" / "Done" button:**

The current button text and styling is generic. New design:
- In view mode: outline button "Edit layout" with a grid/layout icon (`<LayoutGrid size={14} />`).
- In edit mode: filled primary button "Done editing" with a checkmark icon. Also show a subtle banner at the top of the grid area: "Drag widgets to rearrange · Resize from any edge or corner".

### Files to change

| File | Change |
|------|--------|
| `components/v2/DashboardGrid.tsx` | Full rewrite using `react-grid-layout`. Remove custom drag/resize code. |
| `package.json` | Add `react-grid-layout` and `@types/react-grid-layout` |
| `app/(private)/dashboards/[dashboardId]/page.tsx` | Add CSS imports for react-grid-layout |
| `components/v2/DashboardsView.tsx` | Update "Edit layout" button styling |

### New `DashboardGrid` component interface

```tsx
interface DashboardGridProps {
  widgets: DashboardWidgetRecord[];
  dashboardId: string;
  isEditing: boolean;
  onLayoutSaved?: () => void;
}
```

---

## 3. Share Modal Overhaul

### Current state

`ShareDashboardModal` in [components/v2/ShareDashboardModal.tsx](components/v2/ShareDashboardModal.tsx):
- Has tabs for "Public link", "Password protected", and "Share via email".
- Email share tab exists but we are removing it.
- Modal is small and cramped.
- Links list and creation form compete for space.
- Share password minimum is 10 characters (keep this).

### New behaviour

**Remove email share entirely:**
- Delete the email tab and all associated UI.
- Delete any `type: "grant"` share creation UI from the modal (grants are user-ID grants, not email — these are a backend concept we don't expose in this version).
- The modal only deals with **share links** (`type: "link"`).

**Modal structure (new layout):**

The modal should be wider and taller: `max-w-2xl` (from the current narrow size).

```
┌──────────────────────────────────────────────────┐
│  Share dashboard                            [✕]   │
│  ─────────────────────────────────────────────   │
│  Active share links          [+ Create new link] │
│  ────────────────────────────────────────────── │
│  ┌──────────────────────────────────────────┐   │
│  │  🔗 Public link                           │   │
│  │  https://app.querywise.io/share/abc123    │   │
│  │  Created Jun 19 · 42 views · No password  │   │
│  │  [Copy link]                    [Revoke]  │   │
│  └──────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────┐   │
│  │  🔒 Password protected                    │   │
│  │  https://app.querywise.io/share/xyz789    │   │
│  │  Created Jun 18 · 7 views · Password set  │   │
│  │  [Copy link]                    [Revoke]  │   │
│  └──────────────────────────────────────────┘   │
│  ─────────────────────────────────────────────   │
│  Empty state: "No active links. Create one."     │
└──────────────────────────────────────────────────┘
```

**"Create new link" flow (inline expansion, not a separate page):**

Clicking "+ Create new link" expands an inline form below the header:

```
┌──────────────────────────────────────────────────┐
│  Create share link                                │
│  ─────────────────────────────────────────────   │
│  Password protection                              │
│  ○ None   ● Password required                    │
│                                                   │
│  [Password field, if password required]           │
│                                                   │
│  Link expiry                                      │
│  [Dropdown: Never / 7 days / 30 days / Custom]   │
│                                                   │
│  [Cancel]              [Generate link →]         │
└──────────────────────────────────────────────────┘
```

- After "Generate link →" is clicked: call `dashboardsApi.createShare(dashboardId, { type: "link", password?, expiresAt? })`.
- On success: show the new link at the top of the list with a "Link created!" toast. Collapse the creation form.
- Password field: `type="password"`, minimum 10 characters, show validation error inline.

**Link list items:**

Each link card shows:
- Icon: 🔗 (public) or 🔒 (password protected).
- Truncated URL with full URL on hover tooltip.
- Metadata line: "Created [date] · [N] views · [No password / Password protected]".
- [Copy link] button — copies full URL to clipboard, shows "Copied!" for 2s.
- [Revoke] button — triggers confirmation inline ("Are you sure? This link will stop working." + [Cancel] [Revoke]) within the card, then calls `dashboardsApi.revokeShare(dashboardId, shareId)`.

**Expired links:**

If a link has `expiresAt` in the past, show it with a muted style and "Expired [date]" label. The Revoke button is replaced with a "Remove" button. Copy is hidden.

**Empty state:**

If no links exist: centered message "No active share links" + a description "Share this dashboard with anyone — no login required." + a prominent "Create your first link →" button.

**Share button on dashboard page:**

Current button text is generic. New: icon `<Share2 size={14} />` + "Share" with a green filled style. The badge showing active link count: if any active links exist, show a small green dot on the button (not a number count, just presence indicator).

### Files to change

| File | Change |
|------|--------|
| `components/v2/ShareDashboardModal.tsx` | Full redesign: remove email tab, widen modal, new link list UI, inline create form |
| `components/v2/DashboardsView.tsx` | Update "Share" button styling + active link indicator |
| `app/api/dashboards/[dashboardId]/shares/route.ts` | No change needed |
| `lib/v2/sharing/service.ts` | No change needed |

---

## Data Flow Summary

```
Dashboard page load
  → dashboardsApi.get(dashboardId) starts
  → DashboardPageSkeleton renders immediately
  → Data resolves → skeleton fades out → real grid renders

User clicks "Edit layout"
  → isEditing = true
  → DashboardGrid becomes draggable + resizable
  → User drags widget → react-grid-layout auto-packs others
  → User releases → onLayoutChange fires → debounced API call
  → User clicks "Done editing" → isEditing = false → layout locked

User clicks "Share"
  → ShareDashboardModal opens (wider)
  → dashboardsApi.shares(dashboardId) loads link list
  → User clicks "+ Create new link"
  → Inline form expands
  → User optionally adds password + expiry
  → "Generate link →" → dashboardsApi.createShare(...)
  → New link appears in list
  → User copies link → clipboard write → "Copied!" toast
```

---

## Open Questions / Decisions Made

| Decision | Choice | Reason |
|----------|--------|--------|
| Grid library | `react-grid-layout` | Most mature, 1:1 layout model match, all-edge resize |
| Drag handle location | Widget card header | Natural — users grab cards by their title |
| Edit mode persistence | Button toggle (not auto-save) | Prevents accidental layout saves |
| Layout save debounce | 800ms after layout change | Balances responsiveness vs. API call frequency |
| Email share | Removed | Not implemented; don't tease unbuilt features |
| Password minimum | 10 chars | Existing spec requirement — keep |
| Link count badge | Green dot (presence only) | Simpler, less noise than showing count |
| Expired links | Show muted, no copy | Keep visible so user can remove them |
