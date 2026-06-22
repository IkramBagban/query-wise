# Logging Configuration

## Overview

Logging is now environment-aware and only runs in development mode to avoid performance overhead and log file bloat in production.

## Changes Made

### 1. Environment Detection

```typescript
const IS_DEVELOPMENT = process.env.NODE_ENV === "development";
```

Logging is enabled only when `NODE_ENV === "development"`.

### 2. Early Return for Production

```typescript
export function logEvent(event: LogEvent) {
  if (!IS_DEVELOPMENT) {
    return; // No-op in production
  }
  // ... logging logic
}
```

In production, `logEvent()` returns immediately without any file I/O or console output.

### 3. Dual Logging in Development

**Console Logging:**
- Immediate visibility during development
- Truncates long messages (>200 chars) for readability
- Uses `console.error()` for ERROR events
- Uses `console.log()` for other events
- Shows meta field count without dumping full objects

**File Logging:**
- Persistent record in `logs/conversation.log`
- Full JSON event per line
- Useful for post-mortem analysis
- Can be parsed/analyzed with tools

### 4. .gitignore Update

Added `/logs/` directory to `.gitignore` to prevent committing log files.

## Log Event Types

- `USER_QUERY` - User asks a question
- `LLM_RESPONSE` - LLM generates SQL or explanation
- `SQL_QUERY` - SQL executed against database
- `CHART_RENDER` - Chart type selected
- `ERROR` - Any error occurred
- `INFO` - General informational events

## Example Console Output (Development)

```
[USER_QUERY] What were the top 5 products by revenue last month? (4 meta fields)
[LLM_RESPONSE] SELECT p.name, SUM(oi.quantity * oi.price) AS revenue FROM products p JOIN order_items oi ON p.id = oi.product_id JOIN orders o ON oi.order_id = o.id WHERE o.created_at >= CURRENT_DATE - INTERVAL '30 days' GROUP BY p.id, p.name ORDER BY revenue DESC LIMIT 5 (3 meta fields)
[SQL_QUERY] SELECT p.name, SUM(oi.quantity * oi.price) AS revenue FROM products p JOIN order_items oi ON p.id = oi.product_id JOIN orders o ON oi.order_id = o.id WHERE o.created_at >= CURRENT_DATE - INTERVAL '30 days' GROUP BY p.id, p.name ORDER BY revenue DESC LIMIT 5 (3 meta fields)
[CHART_RENDER] bar (2 meta fields)
[INFO] Query completed (4 meta fields)
```

## Example File Log Entry

```json
{"type":"USER_QUERY","timestamp":"2026-04-04T10:30:45.123Z","message":"What were the top 5 products by revenue last month?","meta":{"history":[],"connectionString":"demo","provider":"google","model":"gemini-2.5-flash"}}
```

## Production Behavior

In production (`NODE_ENV=production`):
- All `logEvent()` calls are no-ops
- No console output
- No file I/O
- Zero performance overhead
- No log files created

## Environment Variables

Set in `.env.local` or deployment platform:

```bash
# Development
NODE_ENV=development

# Production
NODE_ENV=production
```

Next.js automatically sets `NODE_ENV=development` when running `npm run dev`.

## Benefits

1. **Performance** - No logging overhead in production
2. **Security** - No sensitive data logged in production
3. **Debugging** - Rich console output during development
4. **Analysis** - Persistent file logs for development debugging
5. **Clean Repo** - Logs directory ignored by git

## Testing

**Development:**
```bash
npm run dev
# Send a query
# Check console for log output
# Check logs/conversation.log for file entries
```

**Production:**
```bash
NODE_ENV=production npm run build
NODE_ENV=production npm start
# Send a query
# Verify no console logs appear
# Verify no logs/ directory is created
```

## Future Enhancements

- Add structured logging library (pino, winston)
- Add log rotation for development
- Add log levels (DEBUG, INFO, WARN, ERROR)
- Add request ID tracking across events
- Add performance metrics logging
- Add optional production logging to external service (Datadog, Sentry)
