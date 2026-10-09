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
| **Avg Apdex (x100)** | New Relic | `apdexScore >= 0.9` (pages passing) | average `apdexScore * 100` across all pages | % | `dashboardTransforms.ts:143` |
| **Pages with Apdex 0.9 or higher** | New Relic | `apdexScore` | count of pages where `apdexScore >= CWV_APDEX_THRESHOLD (0.9)` | count | `dashboardTransforms.ts:146` |
| **Pages Within Load Budget** | New Relic | `loadTime` | count of pages where `loadTime <= LOAD_BUDGET_MS (1000)` | count | `dashboardTransforms.ts:149` |
| **What Moved** | New Relic | `apdexScore` (baseline vs current) | page-by-page delta in apdex score; sorted by improvement/regression | delta | `dashboardTransforms.ts:179-211` |
| **Page Status** | New Relic | `errorRate`, `apdexScore` | "Critical" if errorRate > 5%; "Warning" if errorRate > 1% OR apdexScore < 0.9; else "Healthy" | status | `app/api/metrics/route.ts:84-88` |

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
   - Thresholds are named constants: `CWV_APDEX_THRESHOLD = 0.9`, `LOAD_BUDGET_MS = 1000`
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
