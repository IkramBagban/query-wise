# Custom Events Implementation

## Overview

Custom event tracking has been implemented to monitor key user actions in QueryWise. All events are tracked through Vercel Analytics and are free within the 100k events/month limit.

## Implemented Events

### 1. Query Execution (`query_executed`)

**Location:** `app/api/query/_lib/execute-query-flow.ts`

**Tracked when:** User successfully executes a database query

**Properties:**
- `provider` - LLM provider (google/anthropic)
- `model` - Specific model used
- `chartType` - Visualization type selected
- `rowCount` - Number of results returned
- `executionTimeMs` - Query execution time

**Example:**
```typescript
track("query_executed", {
  provider: "google",
  model: "gemini-2.5-flash",
  chartType: "bar",
  rowCount: 42,
  executionTimeMs: 234,
});
```

### 2. Database Connection (`database_connected`)

**Location:** `app/api/connect/route.ts`

**Tracked when:** User successfully connects to a database

**Properties:**
- `type` - Connection type (demo/custom)

**Example:**
```typescript
track("database_connected", {
  type: "demo",
});
```

### 3. Widget Saved (`widget_saved`)

**Location:** `app/workspace/page.tsx`

**Tracked when:** User saves a query result as a dashboard widget

**Properties:**
- `chartType` - Type of chart saved

**Example:**
```typescript
track("widget_saved", {
  chartType: "pie",
});
```

## Implementation Details

### Server-Side Tracking

Used for API routes (query execution, database connection):

```typescript
import { track } from "@vercel/analytics/server";

track("event_name", { property: "value" });
```

### Client-Side Tracking

Used for browser actions (widget creation):

```typescript
import { track } from "@vercel/analytics";

track("event_name", { property: "value" });
```

### Error Handling

All tracking is wrapped in try-catch to ensure analytics failures don't break functionality:

```typescript
try {
  const { track } = await import("@vercel/analytics/server");
  track("event_name", { data });
} catch {
  // Analytics tracking is optional, don't fail the request
}
```

## Viewing Analytics Data

1. Go to Vercel Dashboard
2. Select your project
3. Click "Analytics" tab
4. Click "Events" sub-tab
5. See all custom events with breakdowns

## What You Can Learn

### Query Execution Metrics
- Total queries per day/week/month
- Most popular LLM provider
- Most popular models
- Average execution time
- Most used chart types
- Average result set size

### Database Usage
- Demo vs custom database ratio
- Connection success rate
- User onboarding funnel

### Dashboard Engagement
- Widget creation rate
- Most saved chart types
- Power user identification

## Cost Tracking

All events count toward the 100k/month free limit:

**Estimated monthly usage:**
- Page views: ~5,000-10,000
- `query_executed`: ~2,000-4,000
- `database_connected`: ~500-1,000
- `widget_saved`: ~200-500

**Total: ~8,000-16,000 events/month** (well within free tier)

## Future Event Ideas

If you want to track more (still within free tier):

```typescript
// Provider change
track("provider_changed", {
  from: "google",
  to: "anthropic",
});

// Model change
track("model_changed", {
  provider: "google",
  model: "gemini-2.5-pro",
});

// Chart type switch
track("chart_type_changed", {
  from: "bar",
  to: "line",
});

// Query error
track("query_failed", {
  errorType: "sql_syntax_error",
  provider: "google",
});

// Schema viewed
track("schema_viewed", {
  tableCount: 6,
});
```

## Testing

### Development
Events are automatically disabled in `NODE_ENV=development`, so no test data pollutes production.

### Production
1. Deploy to Vercel
2. Execute a query → Check for `query_executed` event
3. Connect database → Check for `database_connected` event
4. Save widget → Check for `widget_saved` event
5. Wait 5-10 minutes for data to appear in dashboard

## Best Practices Followed

✅ Minimal properties (only what's needed)
✅ No PII or sensitive data
✅ Error handling (won't break app)
✅ Server-side for API routes
✅ Client-side for browser actions
✅ Meaningful event names
✅ Consistent property naming

## Monitoring Usage

Check your usage in Vercel Dashboard:
- Analytics → Usage
- Shows events used vs 100k limit
- Alerts if approaching limit
