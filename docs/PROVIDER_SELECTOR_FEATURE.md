# Provider Selector in Input Area

## Feature Overview

Added LLM provider selection directly in the chat input area, alongside the model selector. When users change the provider, the model dropdown automatically updates to show only models for that provider.

## Changes Made

### 1. Updated Components

**ChatPanel.tsx**
- Added `providerOptions` prop
- Added `onProviderChange` prop
- Passes both to `QueryInput`

**QueryInput.tsx**
- Added provider selector dropdown (left side)
- Model selector moved to be next to provider selector
- Both dropdowns styled consistently
- Layout: `[Provider] [Model] ... [Search Button]`

**workspace/page.tsx**
- Created `handleProviderChange` function that:
  - Updates provider
  - Auto-selects first model for new provider
- Passes `providerOptions` and handler to `ChatPanel`
- Settings sheet also uses same handler for consistency

### 2. User Experience

**Before:**
- Model selector only (in input area)
- Provider selection only in Settings
- Had to open Settings to switch between Google/Anthropic

**After:**
- Provider + Model selectors (in input area)
- Quick switching without opening Settings
- Model list automatically filters based on provider
- First model auto-selected when provider changes

### 3. Layout

```
┌─────────────────────────────────────────────────────────┐
│ [Example chips...]                                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Textarea for query input                               │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ [Google ▼] [gemini-2.5-flash ▼]        [🔍 SEARCH]    │
└─────────────────────────────────────────────────────────┘
```

When user clicks Google → Anthropic:
- Provider changes to "Anthropic"
- Model dropdown instantly shows only Claude models
- First Claude model auto-selected (claude-opus-4-6)

### 4. Supported Providers & Models

**Google:**
- gemini-3.1-pro-preview
- gemini-3-flash-preview
- gemini-2.5-pro
- gemini-2.5-flash
- gemini-2.5-flash-lite
- gemini-2.0-flash
- gemini-1.5-pro
- gemini-1.5-flash

**Anthropic:**
- claude-opus-4-6
- claude-sonnet-4-6
- claude-sonnet-4-5
- claude-haiku-4-5-20251001

### 5. Styling

Both dropdowns use consistent styling:
- Height: 36px (h-9)
- Rounded: 12px (rounded-xl)
- Background: #f2f9ed
- Border: #174128/24
- Font size: 13px
- Font weight: medium
- Menu opens upward (menuSide="top")

Provider dropdown: min-width 128px (min-w-32)
Model dropdown: min-width 160px on mobile, 208px on desktop (min-w-40 sm:min-w-52)

### 6. Behavior

1. User changes provider dropdown
2. `handleProviderChange` fires
3. Provider state updates
4. Model options recalculate (useMemo)
5. First model of new provider auto-selected
6. Both Settings and Input area stay in sync (same state)

### 7. Benefits

- Faster workflow (no Settings modal needed)
- Clear visibility of current provider
- Prevents invalid provider/model combinations
- Consistent with modern AI chat UX patterns
- Settings still available for API key management

## Testing

1. Open workspace
2. See provider dropdown (Google) and model dropdown in input area
3. Change provider to Anthropic
4. Verify model dropdown shows only Claude models
5. Verify first Claude model is auto-selected
6. Send a query and verify it uses the selected provider/model
7. Open Settings and verify provider/model match input area
8. Change provider in Settings and verify input area updates

## Future Enhancements

- Add provider icons (Google logo, Anthropic logo)
- Show model tier badges (Pro, Flash, etc.)
- Add tooltips with model descriptions
- Remember last-used model per provider
