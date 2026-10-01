# Plan: /performance click-through, metric suggestions, real data vs revamp

Author: Andy (Product) · Status: DRAFT for human + Kevin decision · Planning only, no code changed.

## 1. Findings (what the code does today)

- `/api/metrics` already pulls real New Relic + Sentry data (`useRealAPI = true`). It returns, per tracked page: `visitors`, `status`, `newRelic{loadTime,lcp,ttfb,cls,fid,errorRate,throughput,apdexScore}`, `sentry{errorCount,errorRate,warningCount,latestErrors[title,count,lastSeen]}`, plus a rolling `history`.
- **The `/performance` pages do not use it.** `HubTable`, `HubMetrics`, and every detail component (`PerformanceKPIs`, `PerformanceCharts`, `HourlyBreakdownTable`, `RelatedErrorsList`) render hard-coded arrays. Only the home dashboard consumes the API (via `lib/dashboardTransforms.ts`).
- Row click works (`/performance/[slug]`), but the detail page ignores the page clicked except for the breadcrumb title: every page shows the same "845ms / 0.12% / 142k" numbers and the same fake errors (e.g. "Redis cache miss spike").
- Tracked pages are 5 fixed entries in `lib/trackedPages.ts` (not "articles"). Unknown slugs render a page of fake data instead of a 404.
- Gaps in real data: history is in-memory (last 20 snapshots, lost on restart); New Relic query is `SINCE 1 hour ago`, so "24h", "hourly breakdown" and "visitors (24h)" cannot be real today; Sentry gives issues, not 5xx server-error rates.

## 2. Problem and users

**Problem:** The hub looks like a working product but shows invented numbers, and clicking a row tells the user nothing specific about that page or what to do.

**Users:** (a) Engineer/on-call: "which page is hurting and why?" (b) Product/marketing owner: "is my page fast enough to protect conversion and SEO?" (c) Team lead: "what changed since yesterday?"

## 3. What a user sees when clicking a content item (target)

1. **Header**: page name, path, status badge, last-updated time, data-source badges (New Relic / Sentry) with a "no data yet" state.
2. **KPI strip (real)**: load time, LCP, TTFB, CLS, FID, Apdex, error rate, throughput, each with a good/needs-work/poor rating against Google Core Web Vitals thresholds and change vs the previous snapshot.
3. **Metric suggestions panel**: one line per metric that is outside threshold: what it means, likely cause, first fix (see section 4).
4. **Trend charts**: last N snapshots per metric (real once history is persisted).
5. **Errors (real, Sentry)**: top issues for this page with count, last seen, link to Sentry.
6. **AI summary (optional)**: Gemini's analysis of this page only, via `/api/analyze`.

## 4. Suggestion per metric (rule-based first, AI second)

| Metric | Good / Poor (Google) | When poor, suggest |
|---|---|---|
| LCP | ≤2.5s / >4s | Optimise hero image/font, preload the LCP element, cut render-blocking CSS/JS |
| TTFB | ≤0.8s / >1.8s | Check server/API latency, add caching/CDN, review slow backend calls |
| CLS | ≤0.1 / >0.25 | Reserve space for images/ads/embeds, avoid late-injected content |
| FID / INP | ≤100ms / >300ms | Break up long JS tasks, defer third-party scripts |
| Load time | page-specific budget (Settings thresholds) | Audit bundle size and third parties |
| Error rate | <1% / >5% (matches `deriveStatus`) | Open top Sentry issue, check last deploy |
| Apdex | ≥0.9 / <0.7 | Treat as summary signal; drill into LCP/TTFB first |
| Throughput | trend only | Sudden drop = possible outage/tracking break; spike = check capacity |

Rules live in one table (config, no AI needed). AI adds page-specific wording on top.

## 5. User stories and acceptance criteria

- **US1** As an engineer, I click a row and see *that page's* real metrics. AC: numbers match `/api/metrics` for the slug; no hard-coded values remain; unknown slug returns 404.
- **US2** As an owner, I see a rating and a suggestion for each poor metric. AC: thresholds come from one config (reuse Settings thresholds); each poor metric shows a suggestion; good metrics show none.
- **US3** As an on-call engineer, I see this page's top Sentry errors. AC: list from `sentry.latestErrors`; empty state "No unresolved errors" when none.
- **US4** As anyone, I understand missing data. AC: pages with no New Relic beacon show "No data yet" instead of 0ms/Healthy (today `EMPTY_NEWRELIC_METRICS` yields zeros and "Healthy").
- **US5** As a lead, I see trends. AC: charts show persisted snapshots; label states the real time window.

## 6. Real data vs revamp

| Area | Verdict |
|---|---|
| Hub table + hub KPIs | **Real**: reuse `/api/metrics`, same transform helpers as home |
| Detail KPIs | **Real** (New Relic) |
| Detail errors | **Real** (Sentry `latestErrors`) |
| Metric suggestions | **Revamp/new**: rule table; AI optional |
| Detail trend charts | Real **after** history is persisted; interim: last-20 in-memory snapshots, labelled |
| Hourly breakdown, "24h visitors" | **Needs new queries** (NRQL `TIMESERIES`, `SINCE 24 hours ago`) or remove; do not fake |
| Page list | Keep 5 fixed pages now; making it configurable is a later phase |
| Visual layout | Revamp only after data is wired (Angela/Kelly) |

## 7. Options

- **A. Wire only (smallest):** replace hard-codes with API data, keep layout. Fast, but still no guidance.
- **B. Wire + suggestions (recommended):** A plus rating badges, per-metric suggestions, real Sentry errors, empty/error states, 404 for unknown slugs. Hourly table is hidden until a real query exists.
- **C. Full revamp:** B plus persisted history (DB/file), 24h NRQL series, AI per-page summary, configurable page list. Highest value, largest effort and new infra decision.

**Recommendation: B now, C's persistence and 24h series as phase 3.**

## 8. Phased scope

- **Phase 1 (wire):** shared data hook for `/api/metrics`; hub + detail read real data; loading/error/no-data states; 404 on bad slug.
- **Phase 2 (guidance):** threshold + suggestion table; rating badges; Sentry errors panel; optional per-page AI summary.
- **Phase 3 (history):** persist snapshots; NRQL 24h `TIMESERIES`; real trend charts and hourly table; configurable pages.

## 9. Who does what

- **Phyllis (dev):** feasibility, Phase 1 implementation, confirm in-memory history limits.
- **Ryan (New Relic/Sentry):** confirm available NRQL fields (INP, 24h series, per-page throughput), Sentry per-page filtering reliability, 5xx source.
- **Angela (UX):** detail page layout, suggestion panel, empty/no-data states.
- **Kelly (presentation):** wording of suggestions and ratings for non-engineers.
- **Toby:** change log/QA notes of what moved on hub and detail.
- **Kevin / human:** pick option, answer open questions.

## 10. Open questions

1. Option A, B or C?
2. Is "5xx error rate" required, or is the New Relic `errorRate` plus Sentry enough?
3. Where should history persist (file, SQLite, hosted DB)? The CLI runs locally via `npx`.
4. Should AI suggestions be on by default (Gemini cost/key required) or rule-based only?
5. Is the beacon (`PageMetrics` custom event) deployed on the real sites? Without it New Relic returns nothing.
6. Do users need to add their own pages, or stay with the 5?

## 11. Risks

- No data shown as "Healthy 0ms" misleads users; fix in Phase 1.
- Sentry URL-tag filtering and 5 parallel calls per refresh may hit rate limits.
- In-memory history resets on restart; charts will look empty after a restart.

## 12. Feasibility input from Phyllis (developer), added 2026-10-02

Confirms section 1. Extra facts: hub stat cards are literals ("24 pages", "1.2s", "84 errors"; real list is 5 pages); detail page name is the capitalised slug ("blog" shows "Blog", not "Blog Core"); `lib/aiAnalysis.ts` exists but is unused on these pages.

| Item | Effort (one dev) |
|---|---|
| Hub table + 3 stat cards via one shared fetch hook | S (0.5 day) |
| Detail KPIs + real page name from `TRACKED_PAGES` | S (0.5 day) |
| Related errors from `sentry.latestErrors` | S; Sentry issue link needs a permalink added in `lib/sentry.ts`: S-M |
| Static per-metric suggestion text (rule table) | S |
| AI-generated suggestions via `lib/aiAnalysis.ts` | M |
| Charts from `history[]` | M (only ~20 points, lost on restart) |
| Hourly table / real series (NRQL `TIMESERIES`) | M |
| Persisted history | M-L |

New risks: missing env keys return a 500 with no mock fallback, so the UI needs error/empty states; hub and detail each trigger 6 external calls, so add a short server cache or one shared fetch; check other pages share these components before changing data shapes; no tests exist, Toby needs the file list after each change.

Effect on plan: Phase 1 + 2 with static suggestions is about 2-3 dev days. Recommendation B unchanged.

## 13. Recommended answers to the open decisions (for the human to approve)

1. **Option:** B (wire + suggestions). Phase 3 (persistence, 24h series) after B ships.
2. **5xx rate:** not required. Use New Relic `errorRate` plus Sentry issue counts; revisit if Ryan finds a real 5xx source.
3. **History storage:** a local file/SQLite store in the user's home folder (fits the `npx` CLI, no hosted DB). Phase 3 only.
4. **AI suggestions:** rule-based by default; AI per-page summary is opt-in (needs Gemini key, avoids cost surprises).
5. **Beacon:** must be confirmed by the human/site owner that the `PageMetrics` beacon is live on the real sites; without it New Relic returns nothing and every page shows "No data yet".
6. **Page list:** keep the 5 fixed pages for now.

## 14. Team input

**Ryan (data):**
- INP = `percentile(interactionToNextPaint,75)` on `PageViewTiming`; 24h trend = `TIMESERIES 1 hour SINCE 24 hours ago`; throughput = `count(*)` per page. The current custom `PageMetrics` event has no INP or history unless the beacon sends them. FID is retired, so prefer INP.
- 5xx is not visible from the browser agent or Sentry. It needs New Relic APM or `AjaxRequest` status >= 500. For v1, `errorRate` + Sentry is enough (confirms answer 2).
- **Likely bug:** Sentry's `url` tag holds the full URL, so the current `url:/path` filter probably matches nothing; a wildcard (`url:*/path*`) is needed. Better: one org-level `events` call for all pages, 24h, cached 60s.
- Add CrUX and PageSpeed Insights (free, URL-based, give fix suggestions) as extra sources; GA4/Search Console later. Details in `docs/plans/data-sources.md`.

**Phyllis (build):**
- History: JSON file at `~/.metricflow/history.json` (env-overridable). Skip SQLite (experimental/native build breaks `npx`). Max 1 snapshot per 5 min, keep ~2,000 (about 7 days), write temp file then rename. Same `getHistory()`/`recordSnapshot()` API. Effort S-M (~1 day).
- Cache: 60s in-memory cache sharing one in-flight request across hub and detail; serve last good data flagged stale on failure. Effort S (~0.5 day).

**Angela (layout):** header (real name, path, status, "updated 2 min ago", source chips) → 4x2 KPI cards with text+colour rating badge and change vs previous → suggestions panel beside errors list (only poor/needs-work metrics; "Nothing to fix" if all good) → trend charts labelled with real window; hourly table hidden until real data. States: skeleton loading, error banner with Retry, "No data yet" (never 0ms/Healthy), 404 for unknown slug.

**Kelly (wording):** ratings: Good "Fast, nothing to do"; Needs work "Slower than ideal, worth a look"; Poor "Visitors will notice, fix soon"; none "No data yet". One meaning + one first step per metric, shown only for Needs work/Poor, e.g. LCP "Main content loads slowly. Ask your developer to shrink the biggest image or preload it." Full text goes into the suggestion table at build time.

**Toby (change log/tests):** pending.

**Plan impact:** Phase 1 adds the Sentry filter fix and 60s cache; Phase 3 persistence is confirmed as a ~1 day JSON file, so history could move earlier if the human wants real trends in B. Revised B estimate: about 3-4 dev days including cache and Sentry fix.

## 15. Human direction (via Ryan, 2026-10-02): no demo data, first-run setup

Source: `docs/plans/setup-and-event-emitter.md` (Ryan). Direction: no demo/mock data; first run asks for New Relic and Sentry keys; app runs locally; a page explains how to attach the event emitter so metrics appear.

**Effect on this plan**
- Strengthens Phase 1: delete `lib/mockData.ts` use, every `/performance` view must have a real empty state ("No data yet" + link to `/connect`). Already required by US4.
- The page list should come from New Relic discovery, not the fixed 5 (moves "configurable pages" from Phase 3 into the setup work). Open: how to name/slug discovered pages.
- New Relic needs a User key (query) and a separate Insert key (send events); `/setup` must say which is which.
- `/setup` writes `.env.local` in the user's folder: localhost only, keys never shown back, validate each key with one read call.

**Product decision (Andy): `npx performance-dashboard init` is NOT in v1.** A `/connect` page with copy-paste snippets (Browser agent, `emitMetric()` helper, Sentry init), a "send test event" button and a live "events received" status gives the same result with no code-copying CLI to maintain. Add `init` only if users report copy-paste friction.

**Priorities:** P0 empty states + `/setup` key entry; P0 `/connect` page; P1 page discovery; P2 `init` command.

## 16. Revised phasing and estimate (supersedes section 8 ordering)

**Phase 0 (prerequisite, no demo data):** empty states replace mock data (~1 day); `/setup` key entry and validation, writes `.env.local` (~1-1.5 days); page auto-discovery from New Relic (~1 day); `/connect` emitter page with snippets, test event, live status (~1.5 days). Subtotal ~4-5 dev days (Andy's estimate from Ryan's scope; Phyllis to confirm).
**Phase 1-2:** wire hub/detail, suggestions, Sentry fix, 60s cache, ~3-4 days (section 14).
**Phase 3:** persisted history file (~1 day), 24h series, `init` command only if needed.

**Option B total: about 7-9 dev days** (was 3-4 before the no-demo-data direction). Option A shrinks only the Phase 1-2 part; Phase 0 is required by the human's direction in every option.

## 17. Approved scope: option C (final build order)

Approved by the human 2026-10-02. Option C on top of Phase 0. Assumption: the New Relic beacon is NOT live, so `/connect` is the path to first data. No demo data anywhere. Every phase ends with: Toby's tests pass, Meredith gates the commit/push, Kelly updates README/screenshots, Creed re-tests install after push.

Owners: **Phyllis** build · **Angela** design/review · **Ryan** NRQL/Sentry · **Toby** tests + changed-file list · **Kevin** hooks · **Meredith** commit gate · **Kelly** README/presentation · **Jim** CLI (localhost bind fix first) · **Andy** sequencing/acceptance.

### Phase 0: no demo data, setup, connect (~4-5 days; starts now)
| # | Task | Owner | Est |
|---|---|---|---|
| 0.1 | Screens: empty, no-data, error, setup, connect | Angela | 1 d |
| 0.2 | Remove mock use; empty states on hub/detail/dashboard | Phyllis | 1 d |
| 0.3 | `/setup`: validate NR User key + Sentry key (one read call each), write `.env.local` in cwd, localhost only, keys never echoed | Phyllis (Ryan: validation calls) | 1-1.5 d |
| 0.4 | Page discovery from NR (`FACET pageUrl SINCE 1 day ago LIMIT 20`) replacing fixed 5; page-name/slug rule | Phyllis, Ryan | 1 d |
| 0.5 | `/connect`: Browser agent snippet, `emitMetric()`, Sentry init, send-test-event, live events-received status; explain User vs Insert key | Phyllis, Ryan | 1.5 d |
| 0.6 | Hooks: `.env.local` gitignored, no key logging, no secrets in fixtures | Kevin | 0.5 d |
| 0.7 | CLI binds localhost only | Jim | 0.5 d |
| 0.8 | Tests for all changed files | Toby | 1 d |

**Acceptance:** fresh install with no keys shows setup, not fake numbers; invalid key shows a clear error and is never logged or shown back; valid keys persist to `.env.local` (gitignored); discovered pages replace the fixed list; `/connect` test event appears in "events received"; no import of `mockData` in app code.

### Phase 1: real data on /performance (~3 days)
| # | Task | Owner | Est |
|---|---|---|---|
| 1.1 | One shared fetch hook; 60 s cache with shared in-flight request, serve stale flagged on failure | Phyllis | 0.5 d |
| 1.2 | Hub table + stat cards real (page count, avg load, errors) | Phyllis | 0.5 d |
| 1.3 | Detail KPIs real for the clicked page, real name, 404 on unknown slug | Phyllis | 1 d |
| 1.4 | Fix Sentry url filter (wildcard / one org-level `events` call) | Ryan advice, Phyllis | 0.5 d |
| 1.5 | KPI layout per Angela's spec, no-data badges | Angela review | 0.5 d |
| 1.6 | Tests | Toby | 1 d |

**Acceptance:** numbers on hub and detail equal `/api/metrics`; no literal values remain in `components/Analytics` or `components/PerformanceHub`; missing data shows "No data yet", never 0ms or Healthy; API/key failure shows one error banner with Retry.

### Phase 2: suggestions and Sentry errors (~2.5 days)
| # | Task | Owner | Est |
|---|---|---|---|
| 2.1 | Threshold table (Google CWV, Settings overrides) + rating badges | Phyllis | 0.5 d |
| 2.2 | Suggestion text per metric (wording) | Kelly (copy), Phyllis | 0.5 d |
| 2.3 | Suggestions panel (only Needs work/Poor; "Nothing to fix" otherwise) | Angela, Phyllis | 0.5 d |
| 2.4 | Errors list from Sentry with "Open in Sentry" permalink | Phyllis | 0.5-1 d |
| 2.5 | Tests | Toby | 0.5 d |

**Acceptance:** each poor/needs-work metric shows rating text + colour and one suggestion; good metrics show none; errors list shows title, count, last seen, working Sentry link, or "No unresolved errors".

### Phase 3: history, 24h series, AI summary, configurable pages (~6-7 days)
| # | Task | Owner | Est |
|---|---|---|---|
| 3.1 | History to `~/.metricflow/history.json` (env override, 1 per 5 min, ~2,000 kept, temp-file + rename) behind same `getHistory()/recordSnapshot()` | Phyllis | 1 d |
| 3.2 | NRQL `TIMESERIES` 24h (+ INP via `PageViewTiming`); real trend charts, hourly table, "visitors (24h)" | Ryan (queries), Phyllis | 2 d |
| 3.3 | AI per-page summary via `lib/aiAnalysis.ts` on detail page, button-triggered, cached | Phyllis | 1.5 d |
| 3.4 | Configurable pages: add/hide/rename in Settings on top of discovery | Phyllis, Angela | 1.5 d |
| 3.5 | CrUX / PageSpeed Insights as optional extra source (stretch) | Ryan | 1 d |
| 3.6 | Tests, README, screenshots | Toby, Kelly | 1.5 d |

**Acceptance:** history survives restart; charts labelled with the real window; hourly table is real or absent; AI summary needs a Gemini key and degrades to a clear message; page list edits persist.

### Effort total
Phase 0 ~4-5 d · Phase 1 ~3 d · Phase 2 ~2.5 d · Phase 3 ~6-7 d = **about 16-18 dev days of build (one developer), roughly 3.5 weeks**; Angela, Ryan, Toby and Kelly run in parallel and are included per task. Estimates are rough; Phyllis to confirm per phase before starting it.

### Needs another human decision
1. AI summary: default off (button-triggered, user's Gemini key) or auto-on? Recommend off.
2. Include CrUX / PageSpeed Insights in Phase 3 or defer? Recommend defer.
3. Confirm the 5xx rate stays out of scope (needs New Relic APM).
4. Is Phase 3 persistence file-only (local, single machine) acceptable, with no hosted DB?
