# Dashboard Card Calculations

Each card number is computed from real New Relic and Sentry data. This table shows what feeds each card and how.

| Card | Source | API Field(s) | Formula | Unit | Code Location |
|------|--------|--------------|---------|------|----------------|
| **Avg Page Load Time** | New Relic | `duration` (p75) | average `loadTime` across all pages | ms | `dashboardTransforms.ts:40` |
| **Error Rate** | New Relic | `JavaScriptError` count vs `PageView` count | `(errors / views) * 100` per page, then average | % | `dashboardTransforms.ts:41` |
| **Page views (24h)** | New Relic | `PageView` `count(*)` | sum of view counts across all pages | views | `dashboardTransforms.ts:42` |
| **Apdex Score** | New Relic | `apdex(duration, t: 2)` | average `apdexScore` across all pages (0-1) | score | `dashboardTransforms.ts:43` |
| **TTFB** | New Relic | `backendDuration` (p75) | average `ttfb` across all pages, in milliseconds | ms | `dashboardTransforms.ts:86` |
| **LCP** | New Relic | `largestContentfulPaint` (p75) | average `lcp` across all pages, in milliseconds | ms | `dashboardTransforms.ts:87` |
| **CLS** | New Relic | `cumulativeLayoutShift` (p75) | average `cls` across all pages | score | `dashboardTransforms.ts:88` |
| **Apdex Trend** | New Relic | `apdexScore` per snapshot | `apdexScore * 100` per snapshot | % | `dashboardTransforms.ts:124-131` |
| **Avg Apdex (x100)** | New Relic | `apdexScore >=` the Apdex minimum from Settings (default 0.9) (pages passing) | average `apdexScore * 100` across all pages | % | `dashboardTransforms.ts:143` |
| **Pages with Apdex 0.9 or higher** | New Relic | `apdexScore` | count of pages where `apdexScore >=` the user's Apdex minimum (default 0.9, shown in the label) | count | `dashboardTransforms.ts`, rule in `lib/thresholds.ts` |
| **Pages Within Load Budget (1.5s)** | New Relic | `loadTime` | count of pages where `loadTime <=` the user's load time threshold (default 1.5s, shown in the label) | count | `dashboardTransforms.ts`, rule in `lib/thresholds.ts` |
| **Page Status** | New Relic | `loadTime`, `errorRate`, `apdexScore` | the worst of the three, judged against the thresholds from Settings: "Critical" if loadTime or errorRate is above 2x its threshold; "Warning" if loadTime or errorRate is above its threshold OR apdexScore is below the Apdex minimum (Apdex has no Critical step); else "Healthy". No status at all unless all three values are present | status | `lib/thresholds.ts` |
| **Fix first / All pages table order** | New Relic, Sentry | `loadTime`, `errorRate`, `apdexScore`, Sentry error count, traffic | `rankPages`: Critical, then Warning, then pages with Sentry errors but no status, then Healthy, then pages with no status and no errors, then pages with no data. Inside a group: worst overage ratio (the highest of `loadTime / limit`, `errorRate / limit`, `Apdex minimum / apdexScore`), then Sentry errors, then traffic, then name. Home shows the first 5 | order | `lib/thresholds.ts` |

## How Metrics Flow

1. **New Relic Analytics** (`lib/analytics/NewRelicAnalytics.ts`)
   - Fetches 3 NRQL queries: page views (with durations), timing metrics (LCP/CLS/INP/FID), errors
   - Merges query-string variants: groups by normalized path, accumulates view-weighted sums
   - Divides by total views to get per-path averages, converts units (s → ms for durations)
   - Returns `NewRelicPageMetrics` keyed by path

2. **Sentry Analytics** (`lib/analytics/SentryAnalytics.ts`)
   - Fetches one org-level events call: errors (not warnings) from last 24h, grouped by URL
   - Merges query-string variants: sums error counts, keeps 5 latest error titles
   - Returns `SentryPageErrors` keyed by normalized path

3. **Card Computation** (`lib/dashboardTransforms.ts`)
   - Receives current snapshot (pages with NR + Sentry data)
   - Computes aggregates: `avg()` across pages, `sparkline()` from history
   - Thresholds are the user's (Settings, `lib/thresholds.ts`), passed in as an argument; `metricStatus` is the one rule for page status, counts and tile colours
   - Previous snapshot is fetched to show change (delta, % change)

## Adding a New Card

1. Write a compute function in `dashboardTransforms.ts` — takes `(pages, history)`, returns typed card data
2. Add a one-line "how computed" doc comment explaining the formula
3. Add a row to the table above with: card name, source, API field(s), formula, unit, line number
4. Wire it in the component that renders cards (typically `app/performance/page.tsx` or similar)

## Testing a Card's Math

For any card, you can verify:
1. Open `/api/metrics` JSON, inspect the `pages[].newRelic` and `pages[].sentry` fields
2. Manually compute the card value using the formula above
3. Compare against the card's displayed value
4. If a delta is shown, compare against the previous snapshot in `history[history.length - 2]`
