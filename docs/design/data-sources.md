# Data sources: New Relic, Sentry, and other tools

Author: Ryan (data/analytics advisor). Suggestions only; nothing here was run against real APIs. Env vars are referred to by name only.

## 1. What the app does today

| Piece | Today | Problem |
|---|---|---|
| `lib/newrelic.ts` | One NRQL query on a **custom** event `PageMetrics`, `FACET page`, `SINCE 1 hour ago`, using `average()` for everything | Needs a custom beacon on the site. `average(errorRate)`, `average(throughput)`, `average(apdexScore)` average pre-computed values, which is wrong (rates can't be averaged). Averages hide slow tails; Web Vitals are judged at p75. Account id is interpolated into the query string. Any failure silently returns `{}` (page then shows zeros). |
| `lib/sentry.ts` | One call per page to `/projects/{org}/{project}/issues/?query=is:unresolved url:<path>` | `count` on an issue is **lifetime**, not "last 24h". `url:` tag holds a full URL, so `url:/pricing` likely matches nothing. `errorRate` is "errors per issue", not errors per visit. 5 pages = 5 calls per refresh. `SENTRY_PROJECT_ID` is passed where this endpoint expects a project slug. |
| `app/api/metrics/route.ts` | `useRealAPI = true` hard-coded; refetches both sources on every request | Easy to hit rate limits; no cache; no per-content drill-down. |

## 2. New Relic: recommended queries (Phyllis)

Prefer the **native Browser agent events** over the custom `PageMetrics` event. They exist as soon as the Browser agent is on the site: `PageView`, `PageViewTiming`, `JavaScriptError`, `BrowserInteraction`. Verify units in the NR query builder first (page durations are seconds, timing events are mostly milliseconds).

Use `FACET pageUrl` (or `targetGroupedUrl`) and match tracked pages by path; strip query strings in code.

```sql
-- Load time, TTFB, throughput, Apdex per page (p75, not average)
SELECT percentile(duration, 75) AS loadTime,
       percentile(timeToFirstByte, 75) AS ttfb,   -- or backendDuration if absent
       count(*) AS pageViews,
       apdex(duration, t: 2) AS apdex
FROM PageView
WHERE pageUrl LIKE '%/pricing%'
SINCE 1 hour ago

-- Core Web Vitals (LCP, CLS, INP, FID)
SELECT percentile(largestContentfulPaint, 75) AS lcp,
       percentile(cumulativeLayoutShift, 75) AS cls,
       percentile(interactionToNextPaint, 75) AS inp,
       percentile(firstInputDelay, 75) AS fid
FROM PageViewTiming
WHERE pageUrl LIKE '%/pricing%'
SINCE 1 hour ago

-- Error rate = JS errors / page views (do it in one query)
SELECT filter(count(*), WHERE eventType() = 'JavaScriptError') / filter(count(*), WHERE eventType() = 'PageView') * 100 AS errorRate
FROM PageView, JavaScriptError WHERE pageUrl LIKE '%/pricing%' SINCE 1 hour ago

-- Sparkline / history for the detail page
... TIMESERIES 5 minutes SINCE 24 hours ago
```

Code-level changes:
- **Batch**: one GraphQL call can hold several aliased `nrql(...)` fields, so all pages and all vitals go in one request. Keep `FACET pageUrl LIMIT MAX` for the list view; use `WHERE pageUrl LIKE` + `TIMESERIES` for the detail view.
- Add `INP` to the type (replacing FID in the UI; INP is the current Core Web Vital, FID is retired).
- Pass `accountId` through a GraphQL variable or validate it as digits.
- Return `{ data, error }` rather than `{}` so the UI can show "no data" vs "request failed".
- Cache 60s server-side (`unstable_cache` or a small in-memory TTL) and make `useRealAPI` an env flag (`USE_MOCK_DATA`), not a code edit.
- Per-content rows on `/performance`: add a `?page=<url>` param to the metrics route and run the page-scoped queries above.

## 3. Sentry: recommended calls (Phyllis)

Use the organization endpoints, not the per-project one:

- **Issues for a page, last 24h**: `GET /api/0/organizations/{SENTRY_ORG_SLUG}/issues/?project={SENTRY_PROJECT_ID}&query=is:unresolved url:*/pricing*&statsPeriod=24h&limit=10`. The `*` wildcards matter because the `url` tag is a full URL. Each issue has `title`, `count`, `userCount`, `lastSeen`, `level`.
- **Events per page (for error rate)**: `GET /api/0/organizations/{org}/events/?field=url&field=count()&query=event.type:error&statsPeriod=24h&sort=-count()`. One call returns counts for **all** pages (replaces 5 calls). Divide by New Relic `pageViews` for a real error rate.
- **Web Vitals as a cross-check** (needs Sentry browser performance on): `.../events/?dataset=metrics&field=transaction&field=p75(measurements.lcp)&field=p75(measurements.cls)&field=p75(measurements.inp)&field=p75(measurements.ttfb)`.
- Always send `statsPeriod`; without it counts are lifetime and will never go down.
- Token scopes needed: `event:read`, `project:read`, `org:read` (read-only).

Endpoint and field names above are from memory of the public docs; confirm each against current New Relic and Sentry docs before coding.

## 4. Other tools

| Tool | Data it gives | Maps to content page by | Auth / cost | Effort | Priority |
|---|---|---|---|---|---|
| **CrUX API** (Chrome UX Report) | Real-user LCP, CLS, INP, TTFB at p75 for a URL or origin, 28-day rolling, plus good/needs-work/poor split | URL (`url` or `origin` in request) | Free API key (`CRUX_API_KEY`) via Google Cloud; no billing | Low (1 POST per URL) | **P1**: free benchmark of what Google sees; only for URLs with enough traffic |
| **PageSpeed Insights API** | Lighthouse lab score, LCP/CLS/TBT, opportunities ("what to fix"), and CrUX field data in the same response | URL | Free; key optional but needed for volume (`PSI_API_KEY`) | Low; slow call (10-30s) so run on demand and cache | **P1**: gives the "what to suggest on click" list for each content item |
| **Google Search Console API** | Clicks, impressions, CTR, position per page and query; indexing status | Page URL (`page` dimension) | Free; OAuth or service account added as site user; data lags 2-3 days | Medium (auth setup) | **P2**: shows which content earns search traffic, to rank slow pages by business impact |
| **GA4 Data API** | Sessions, users, engagement, conversions per `pagePath` | `pagePath` | Free; service account with Viewer on the property (`GA4_PROPERTY_ID`) | Medium | **P2**: replaces New Relic throughput as "visitors" and gives conversion impact |
| **Lighthouse CI** (self-run) | Repeatable lab scores in CI | URL | Free, but needs CI and storage | High | P3: PSI covers it for now |
| **Vercel / host analytics** | Only if hosted there | Path | Plan dependent | Low | Skip unless the site is on Vercel |

## 5. Suggested order

1. Fix New Relic (p75, native events, one batched call) and Sentry (org endpoint, `statsPeriod`, wildcard `url`). Real data for the row-click detail view comes from these two.
2. Add PSI + CrUX as the "suggestions on click" and "what Google sees" panels (no OAuth, cheap).
3. Add GSC and GA4 only if the product wants traffic/business impact ranking.

Real data vs revamp: p75 vitals, load time, error count and Apdex can be real from NR/Sentry once the Browser agent and the Sentry browser SDK are installed on the content site. Per-content titles, owners and traffic need GA4/GSC or a content list owned by the product.

## 6. Open questions for Andy

- Is the New Relic Browser agent installed on the tracked site, or only the custom `PageMetrics` beacon? (Decides whether step 1 works unchanged.)
- Does Sentry browser performance monitoring run on that site? (Only needed for the optional vitals cross-check.)
- Which URLs count as "content" beyond the 5 in `lib/trackedPages.ts`?
