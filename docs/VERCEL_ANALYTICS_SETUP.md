# Vercel Analytics Setup

## What Was Added

Vercel Analytics and Speed Insights are now integrated into your Next.js app. These tools provide:

1. **Analytics** - Page views, user behavior, custom events
2. **Speed Insights** - Real User Monitoring (RUM) for Core Web Vitals

## Installation

```bash
npm install @vercel/analytics @vercel/speed-insights
```

## Code Changes

### app/layout.tsx

```typescript
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
```

## How It Works

### Automatic Tracking (No Configuration Needed)

Once deployed to Vercel, analytics automatically track:
- Page views
- Navigation events
- Core Web Vitals (LCP, FID, CLS, TTFB, INP)
- Device types
- Geographic location
- Referrers

### In Development

- Analytics are disabled in `NODE_ENV=development`
- No data sent to Vercel during local development
- Zero impact on dev performance

### In Production

- Automatically enabled when deployed to Vercel
- Lightweight script (~1KB gzipped)
- No configuration required
- Data appears in Vercel Dashboard

## Accessing Analytics

1. Go to your Vercel project dashboard
2. Click on the "Analytics" tab
3. View real-time and historical data

**Dashboard URL:**
```
https://vercel.com/[your-username]/[project-name]/analytics
```

## What You'll See

### Analytics Tab
- Page views over time
- Top pages
- Top referrers
- Devices (desktop, mobile, tablet)
- Browsers
- Countries
- Real-time visitors

### Speed Insights Tab
- Core Web Vitals scores
- Performance over time
- Device-specific metrics
- Geographic performance
- Page-by-page breakdown

## Custom Events (Optional)

If you want to track custom events (e.g., "Query Executed", "Dashboard Created"):

```typescript
import { track } from '@vercel/analytics';

// Track custom event
track('query_executed', {
  provider: 'google',
  model: 'gemini-2.5-flash',
  rowCount: 42,
});
```

### Example Integration Points

**Track Query Execution:**
```typescript
// In app/api/query/route.ts
import { track } from '@vercel/analytics/server';

// After successful query
track('query_executed', {
  provider,
  model,
  rowCount: result.rowCount,
  executionTimeMs: result.executionTimeMs,
});
```

**Track Dashboard Widget Creation:**
```typescript
// In workspace page
import { track } from '@vercel/analytics';

const onSaveWidget = async (message: ChatMessage) => {
  // ... save logic
  track('widget_saved', {
    chartType: message.chartConfig?.type,
  });
};
```

**Track Database Connection:**
```typescript
// After successful connection
track('database_connected', {
  type: connection.type, // 'demo' or 'custom'
});
```

## Privacy & GDPR Compliance

Vercel Analytics is privacy-friendly:
- No cookies used
- No personal data collected
- GDPR compliant
- No third-party tracking
- Data stored in EU (if project is in EU region)

## Performance Impact

- **Bundle size:** ~1KB gzipped
- **Runtime overhead:** Negligible (<1ms)
- **Network requests:** Batched and async
- **Core Web Vitals:** No negative impact

## Pricing

- **Free tier:** 100,000 events/month
- **Pro tier:** 1,000,000 events/month
- **Enterprise:** Unlimited

Your current usage will likely stay within the free tier.

## Verifying Installation

### 1. Check Build Output
```bash
npm run build
```

Look for:
```
✓ Compiled successfully
✓ Analytics enabled
✓ Speed Insights enabled
```

### 2. Check Production
After deploying to Vercel:
1. Open your deployed site
2. Open browser DevTools → Network tab
3. Look for requests to `vitals.vercel-insights.com`
4. Check Vercel dashboard after a few minutes

### 3. Test Custom Events (Optional)
```typescript
import { track } from '@vercel/analytics';

// In a component or API route
track('test_event', { timestamp: Date.now() });
```

Then check Vercel Dashboard → Analytics → Events

## Troubleshooting

### Analytics Not Showing Up

1. **Wait 5-10 minutes** - Data is not real-time, there's a delay
2. **Check deployment** - Must be deployed to Vercel (not localhost)
3. **Check project settings** - Analytics must be enabled in Vercel dashboard
4. **Check ad blockers** - Some ad blockers block analytics scripts

### Speed Insights Not Working

1. **Verify deployment** - Must be on Vercel production
2. **Check browser support** - Requires modern browsers with Web Vitals API
3. **Wait for data** - Needs real user visits to collect metrics

### Development Mode

Analytics are automatically disabled in development. To test:
```bash
npm run build
npm start
# Visit http://localhost:3000
```

Or deploy to Vercel preview branch.

## Best Practices

1. **Don't track sensitive data** - Never send PII, API keys, or connection strings
2. **Use meaningful event names** - `query_executed` not `qe`
3. **Keep event properties minimal** - Only track what you need
4. **Batch related events** - Don't track every keystroke
5. **Monitor quota** - Check usage in Vercel dashboard

## Next Steps

1. Deploy to Vercel
2. Wait 10 minutes
3. Visit your site a few times
4. Check Vercel Dashboard → Analytics
5. (Optional) Add custom event tracking for key user actions

## Resources

- [Vercel Analytics Docs](https://vercel.com/docs/analytics)
- [Speed Insights Docs](https://vercel.com/docs/speed-insights)
- [Web Vitals Guide](https://web.dev/vitals/)
