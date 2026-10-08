# Requirement: show a tool only when its key is provided

Author: Andy (Product) · 2026-10-07 · Status: approved by the human 2026-10-07, with the manager to delegate · No code changed.

## 1. Request (from the human)

If a user has only a New Relic account, show only New Relic data; the Sentry tab stays hidden until Sentry keys are provided, and the other way round. The same rule applies to any tool added later: a tab appears only for a tool whose key is provided.

## 2. What the code does today

- The sidebar lists every tool, always: `components/sidebar/Sidebar.tsx:34` maps over `TOOL_IDS` from `lib/tools.ts` (New Relic, Sentry).
- Setup is all-or-nothing. `isConfigured()` in `lib/env.ts:52` needs all four keys (`NEWRELIC_API_KEY`, `NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID`, `SENTRY_API_KEY`, `SENTRY_DSN`). `POST /api/setup` rejects any missing key as "Required." A New Relic-only user cannot finish setup at all.
- `GET /api/metrics` returns nothing unless all keys are set, and always calls both tools.
- Tracked pages are discovered from New Relic only (`discoverPages`). A Sentry-only user would have no page list.
- `/tools/[tool]` renders for any known tool id, with or without keys.
- Sentry and New Relic numbers are mixed on shared screens: header totals, hub table and stat cards, detail KPIs and errors list, dashboard cards (`components/header/Header.tsx`, `components/PerformanceHub/*`, `components/Analytics/*`, `lib/dashboardTransforms.ts`).

## 3. Problem

A user with one tool is blocked at setup, and the app shows tabs and numbers for a tool they do not have.

## 4. Users

- A team that uses New Relic only.
- A team that uses Sentry only.
- A team that adds the second tool later.

## 5. User stories and acceptance criteria

**US1. Set up with one tool.** As a New Relic-only (or Sentry-only) user, I can finish setup with just that tool's keys.
- `/setup` groups keys by tool; each group is optional; at least one complete group is required to save.
- A half-filled group (e.g. New Relic key without account ID) is rejected with a message naming the missing field.
- Each provided group is validated as today; an empty group is not validated and not written.

**US2. See only my tools.** As a user, I see a sidebar tab only for a tool whose keys are set.
- New Relic keys only: sidebar shows New Relic, not Sentry. Sentry keys only: the reverse. Both: both.
- Opening `/tools/<tool>` for a tool without keys does not show an empty data page: it shows a short "Connect <tool>" state linking to `/setup` (or 404; see open question 1).
- The tab appears after saving keys with no restart.

**US3. No numbers from a tool I do not have.** As a user, shared screens never show values for an unconnected tool.
- Header totals, hub columns and stat cards, detail KPIs, errors list and dashboard cards hide the parts that belong to an unconnected tool. They never show 0, "Healthy" or "No errors" for it.
- `/api/metrics` calls only connected tools and says which tools are connected.

**US4. Add the other tool later.** As a user, I can add the second tool's keys in `/setup` or Settings and its tab and data appear.
- Existing keys are kept; the new tab appears without restart.
- Removing a tool's keys hides its tab again (see open question 3).

**US5. Works for future tools.** As the team, adding a tool means one entry declaring its required keys; sidebar, setup form and visibility follow from it.
- Each tool in `lib/tools.ts` declares its required keys; no per-tool visibility checks scattered in components.

## 6. Scope

In: `/setup` per-tool groups, connected-tools signal from the API, sidebar filtering, `/tools/[tool]` guard, hiding unconnected-tool parts on shared screens, `/connect` showing only relevant snippets, tests, README.

Out: new tools (CrUX, PageSpeed, GA4), changing what each tool shows, hosted storage.

## 7. Open questions (need a decision)

1. **Hidden tool URL:** "Connect <tool>" prompt or 404? Recommend the prompt, so a shared link explains itself.
2. **Sentry-only page list:** pages come from New Relic today. For Sentry-only, build the page list from Sentry's error URLs (pages with no errors would not appear), or show only the Sentry tab and an explanation on Performance? Recommend the first, flagged as limited. This is the largest piece of work; tech lead to size it.
3. **Removing keys:** should users be able to disconnect a tool from the UI? Recommend yes in Settings, later if it adds much effort.
4. **Discoverability:** with a tool hidden, where does the user learn they can add it? Recommend one "Add a tool" link at the bottom of the sidebar group to `/setup`.
5. **AI suggestions:** already optional by key; confirm they follow the same rule.

## 8. Priority and suggested order

- **P0:** US1 (setup with one tool) and US2 (sidebar + tool page). Without US1 the request cannot work at all.
- **P0:** US3 for the New Relic-only case (the common one).
- **P1:** Sentry-only page list (open question 2), US4 polish.
- **P2:** disconnect a tool from the UI.

## 9. Suggested owners (manager decides)

Tech lead: tool-to-keys model and the Sentry-only page list approach. Developer: setup route, env, metrics API, sidebar, guards. Designer: grouped setup form, hidden-tool and partial states. Tester: one-tool, both-tools, add-later, half-filled group, hidden URL. Security: review the setup route change (it writes secrets). CLI engineer: check the CLI's setup/connection messages still read correctly with one tool.

## 10. Risks

- Shared types assume both `newRelic` and `sentry` exist on every page; many components read them directly.
- Existing tests (setup API, Cypress states, fresh-install) assume all four keys.
- Status ("Healthy/Warning/Critical") is derived from New Relic; Sentry-only needs its own rule or no status.

## 11. Additions from Product review (2026-10-07, approved by the human)

Checked against the code on `feat/tool-tabs-by-key`. UI detail lives in `docs/plans/tool-tabs-ui-spec.md`; nothing here repeats it.

**A. Gaps in section 2 (more places that need all four keys)**
- `app/api/connect/route.ts:10` returns `configured: false` unless all four keys are set, so `/connect` is dead for a one-tool user.
- `app/performance/[slug]/page.tsx:14` only loads the page when all four keys are set.
- `app/api/setup/route.ts:35` refuses the New Relic Ingest key with "Finish setup first." unless all four keys are set.
- All three, plus `/api/metrics`, call `isConfigured()` in `lib/env.ts`. Fix the rule there once, not in each caller.

**B. Definition of "connected" (add to US2)**
- A tool is connected when all its required keys are present. Nothing else decides it.
- A key that is present but rejected by the tool (expired, revoked) is "connected, request failed": the tab stays and shows an error. It is never hidden, or the user cannot tell a broken key from a missing one.
- A hand-edited `.env.local` with half a tool's keys counts as not connected, and `/setup` shows that group as incomplete.

**C. New acceptance criteria**
- **US3, one tool fails while both are connected:** the API says which tool failed; that tool's parts show "—" and "Could not load <Tool> data."; the other tool's data still shows.
- **US3, AI suggestions:** the prompt sent to the AI leaves out lines for an unconnected tool. Today `lib/aiAnalysis.ts:73` would send "Errors: undefined errors" for a New Relic-only user.
- **US3, alerts:** the threshold alert, the bell and the Settings notification options (shipped in #66) never show or fire for a metric from an unconnected tool.
- **US4, history:** records saved before the second tool was added have no values for it. Trends show a gap for that period, not 0.
- **US1, Ingest key:** `NEWRELIC_INSERT_KEY` belongs to the New Relic group. A Sentry-only user is never asked for it.
- **US6 (new). Nothing changes for today's users.** A user who already has all four keys upgrades and sees the same tabs, numbers and setup state, with no re-entry of keys.

**D. Done when (for the tester)**
- Fresh install, New Relic keys only: setup saves, dashboard shows data, and the word "Sentry" appears on no screen except `/setup` and "Add a tool".
- Same check the other way for Sentry only (P1).
- Fresh install with all four keys behaves exactly as before this change.

**E. Suggested delivery**
- PR 1 (P0): sections A and B, US1, US2, US3 for New Relic only, US6.
- PR 2 (P1): Sentry-only page list and screens, US4.
- PR 3 (P2): disconnect a tool.

**F. Answers to the open questions (approved by the human)**
1. Hidden tool URL: "Connect <tool>" prompt.
2. Sentry-only page list: build from Sentry error URLs, labelled as limited, in PR 2.
3. Removing keys: yes, in Settings, in PR 3.
4. Discoverability: "Add a tool" link in the sidebar.
5. AI suggestions: follow the same rule (see C).

## 12. Addendum: generic tool contract (2026-10-08)

Extends sections 1-11. Delivered as three new PRs, named C1-C3 here because section 11.E already uses "PR 2" and "PR 3" for other work:

- **C1**: capability mapping, shape only, no behaviour change.
- **C2**: the tool contract and the consumer entry point.
- **C3**: Sentry as a provider of pages and vitals.

### 12.1 Problem

- **Consumer (the developer adding MetricFlow to a site):** "I have to install and configure each vendor's SDK myself, from different snippets." Today `SENTRY_SNIPPET` and `browserSnippet` each start with an `npm i` of a vendor package.
- **Sentry-only user:** "Sentry is connected but every screen tells me to add New Relic" (`NEEDS_NEW_RELIC`).
- **Team:** adding a tool means editing screens, because 14 files read `p.newRelic.*` or `p.sentry.*` directly.

### 12.2 Capabilities

A tool declares its capabilities in its `TOOLS` entry (`lib/tools.ts`). Screens ask "is this capability provided?" and never ask "is this New Relic?".

| Capability | Definition | New Relic today | Sentry today | Sentry after C3 |
|---|---|---|---|---|
| `pages` | The list of pages seen in the last 24h | Yes (`discoverPages`) | No | Yes (from page-load tracing) |
| `traffic` | Page loads per page in 24h | Yes (`throughput`, exact) | No | Yes, flagged **sampled** |
| `loadTime` | 75th-percentile page load duration | Yes | No | No |
| `apdex` | Apdex score, 0-1 | Yes | No | No |
| `vitals` | LCP, CLS, INP, TTFB | Yes (plus FID) | No | Yes (no FID) |
| `ajax` | API call latency and fail rate | Yes (`ajaxLatency`, `ajaxFailRate`) | No | No |
| `errorRate` | JS errors as a share of page views | Yes | No | No |
| `errors` | Error count and latest error titles per page | No | Yes | Yes |

- Sentry's `errorRate: 0` and `warningCount: 0` in `SentryAnalytics.mergeVariants` are hard-coded, not measured. They must never be displayed.
- Sentry does not get `errorRate` in C3: errors are counted in full and page loads are sampled, so the ratio would be wrong.

**Precedence when two connected tools provide the same capability**

1. The first connected tool in `TOOLS` order supplies the capability for every page. New Relic is first, so users with both tools see the same page list and numbers as today.
2. No per-page mixing: a page New Relic has no vitals for does not borrow Sentry's.
3. If the supplying tool's request fails, show "Could not load {Tool} data." There is no silent fallback to the other tool.
4. A tool's own tab (`/tools/<id>`) always shows that tool's own numbers.

### 12.3 Operations

Every tool implements the same five. Two run in the consumer's browser, three in the dashboard server.

| Operation | In user terms | Runs in | Inputs | On failure the user sees |
|---|---|---|---|---|
| `init` | "Start measuring my site." Called once; loads only the vendor code for the tools named. | Consumer's browser | Public identifiers only: Sentry DSN; New Relic browser key (`NRJS-`), application ID, account ID. Optional sample rate. | The site keeps working and `init` never throws. One console warning names the tool and reason. The dashboard shows the "no data yet" state (12.5). |
| `send` | "Record my own event" (today's `emitMetric` in `EMIT_SNIPPET`). | Consumer's browser | Name, numeric value, optional attributes. | Before `init`, or if the tool cannot take it, it does nothing and does not throw. |
| `read` | "Show me my numbers": one fetch of the last 24h per page (today `Analytics.byPath()`). | Dashboard server | That tool's secret keys from `.env.local`. | "—" and "Could not load {Tool} data." on that tool's parts; other tools unaffected (existing `failed` list). Never zeros. |
| `poll` | "Keep the numbers fresh without reloading." A repeated `read` (today every 30s on the home screen, `REFRESH_INTERVAL_MS`). | Dashboard server | Same as `read`. | Last good numbers stay with their old "updated" time, plus the same "Could not load" line. No flicker to empty. |
| `update` | "Change this tool's keys or settings from the dashboard" (today `/setup` and `POST /api/setup`). | Dashboard server | That tool's key group. | Existing behaviour: error under the field, nothing saved for any group. |

Rules for the browser half:

- `init` refuses a value that looks like a secret (`NRAK-` user key, Sentry auth token). It warns in the console and sends nothing.
- No secret is ever accepted by, bundled into, or logged from the browser half.
- `update` never runs in the consumer's browser.

### 12.4 Display rules

General rule: if no connected tool provides the capability, the element is removed. It is never 0, "Healthy" or "No errors". Grids resize to the cards left; a lone stat card folds into the neighbouring card's description (UI spec section 4).

| Screen element | Needs | When not provided |
|---|---|---|
| Home tile "Avg Response Time" | `loadTime` | Removed |
| Home tile "Error Rate" | `errorRate` | Removed |
| Home tile "Throughput" | `traffic` | Removed. If sampled: label "Sampled page loads (24h)", raw count, no scaling |
| Home tile "Apdex Score" | `apdex` | Removed |
| Web-vital cards (TTFB, LCP, CLS) | `vitals` | All three removed |
| "Core Web Vitals Score Trend" chart | `apdex` (it plots Apdex) | Removed |
| Visibility breakdown | `apdex` and `loadTime` | Card removed |
| What moved | `pages`, `apdex`, `loadTime` | Card removed |
| AI suggestions | AI key, plus any of `loadTime`, `vitals`, `errors` | Prompt contains only lines for provided capabilities; no alert for a metric that was not sent |
| "Rankings Moved" (dashboard API timings) | Any connected tool | Unchanged |
| Hub card "Pages Reporting" | `pages` | Removed |
| Hub card "Avg Load Time" | `loadTime` | Removed |
| Hub card "Open Errors" | `errors` | Removed |
| Hub columns Page Name, Path | `pages` | "No data yet" state (12.5) |
| Hub column "Visitors (24h)" | `traffic` | Removed. If sampled: header "Page loads (sampled)" |
| Hub column "Avg Load" | `loadTime` | Removed |
| Hub column "Errors" | `errors` | Removed |
| Hub column "Status" and page status | `loadTime`, `errorRate`, `apdex` (all inputs of `deriveStatus`) | No column and no badge |
| Detail KPI "Average Load Time" | `loadTime` | Removed |
| Detail KPI "Error Rate" | `errorRate` | Removed |
| Detail KPI "Traffic Volume" | `traffic` | Removed; sampled label as above |
| Detail related errors | `errors` | Card removed |
| Tool tab stats and columns | Each stat and column names its capability | Shown only if this tool provides it |
| Header subtitle | `pages` for "n of m pages reporting"; `traffic` for views; `errors` for open errors | Part dropped; the existing join leaves no stray separator |
| Threshold alert and bell | Page status | Never shown or fired |

**Sentry-only after C3**

- **Status:** none. No Healthy, Warning or Critical badge, no Status column, no threshold alert.
- **Load time and Apdex:** absent everywhere, including the home tiles, visibility breakdown, what moved and the trend chart.
- **Throughput:** shown as a sampled count with the word "sampled" in the label. It is never called "visitors" or "views".
- **Home:** tiles "Sampled page loads (24h)" and "Open errors"; web-vital cards; AI suggestions.
- **Hub:** Page Name, Path, Page loads (sampled), Errors.
- **Sentry tab:** gains LCP, CLS, INP, TTFB and Page loads (sampled) columns. "Pages With Errors" becomes "n of m" again.
- **Detail page:** sampled page loads as one line, then related errors.

### 12.5 "No data yet" state

Replaces `NEEDS_NEW_RELIC` and the header text "Sentry connected · add New Relic to list pages". Shown when at least one tool is connected, its `read` succeeded, and no page has arrived.

- **Title:** "{Tool} is connected. No data has arrived yet." With two or more tools: "Your tools are connected. No data has arrived yet."
- **Reason:** "Add MetricFlow to your site and call init once. Then open a page on your site and come back."
- **Extra line when Sentry is the only `pages` provider:** "Sentry records about 1 in 10 page loads by default, so reload a few times or raise the sample rate in init."
- **Button:** "Show the init call", linking to `/connect`.
- **Header subtitle:** "{Tool} connected · waiting for first page load".

A failed `read` shows "Could not load {Tool} data." with Retry, never this state. Loading shows the existing `Skeleton`.

### 12.6 Consumer experience

**US7.** As a developer, I install MetricFlow, call `init` once with my public identifiers, and my pages appear in the dashboard. I install no vendor package.

1. Given a site with no Sentry or New Relic package installed, when it adds MetricFlow and calls `init` for Sentry with a DSN, then page loads, vitals and errors reach Sentry and appear in the dashboard.
2. Given `init` is called for New Relic only, when the page loads, then no Sentry code is downloaded (check the network tab), and the reverse.
3. Given `init` is never called, then no vendor code is downloaded.
4. Given `init` is called twice, then the second call does nothing and warns once.
5. Given `init` runs during server rendering or a build, then it does nothing and the build passes.
6. Given a bad DSN or key, then the site still renders, one console warning explains it, and the dashboard shows 12.5.
7. Given the site already initialises Sentry itself, when MetricFlow's `init` runs, then it does not replace or reconfigure that Sentry and says so once in the console. The site's own error reporting is unchanged. If the site's Sentry uses the DSN saved in `/setup`, its data appears; otherwise 12.5 shows.
8. `/connect` shows one snippet (the `init` call), pre-filled with the public values the dashboard already knows. No snippet contains `npm i @sentry/browser` or `npm i @newrelic/browser-agent`.
9. Demo: on a branch of `~/Documents/mf-demo`, the vendor package is removed from `package.json` and the app calls `init` once. With MetricFlow on port 3000 and the demo on 3001, navigating the demo routes makes those pages appear.

### 12.7 Acceptance criteria per PR

**C1: capability mapping**

1. Each `TOOLS` entry lists its capabilities as in 12.2 ("today" columns).
2. No file under `components/` or `app/` (outside `app/api`) reads `newRelic.` or `sentry.` from a page, or compares a tool id, to decide what to show.
3. With both tools connected, every screen in 12.4 is the same before and after.
4. The same holds for New Relic only, and for Sentry only (still the `NEEDS_NEW_RELIC` state).
5. A test tool added to the registry with only `errors` gets a sidebar tab, a setup group and an Errors column with no component edits.
6. Existing tests pass unchanged.

**C2: contract and consumer entry point**

1. Both tools implement `init`, `send`, `read`, `poll` and `update`; `/api/metrics` and `/api/setup` go through them and name no tool.
2. US7 criteria 1-8 pass (criterion 1 for errors only until C3).
3. The published package can be imported from a consumer app, and that import pulls in no server code or secret.
4. A build check fails if the browser entry references `NEWRELIC_API_KEY`, `SENTRY_API_KEY` or `NEWRELIC_INSERT_KEY`.
5. `init` given an `NRAK-` key or a Sentry auth token sends nothing and warns.
6. `/setup` behaves exactly as section 5 (US1) and the UI spec describe.
7. Users with both tools see unchanged numbers.
8. US7 criterion 9 passes on the demo for New Relic.

**C3: Sentry provides pages, vitals and sampled traffic**

1. Sentry only, demo calling `init`: after navigating three routes at sample rate 1, all three appear on Home, Performance and `/tools/sentry` with LCP, CLS, INP and TTFB. A page with no errors is listed.
2. Sentry only: the screens match "Sentry-only after C3" in 12.4. No "0ms", Apdex, status badge or threshold alert appears anywhere.
3. Sentry only: every traffic figure carries the word "sampled".
4. Sentry only, nothing sent yet: 12.5 shows with its Sentry line. `NEEDS_NEW_RELIC` is gone from the code.
5. Both tools: page list, vitals, traffic and status are identical to before C3, and the Sentry tab gains its new columns.
6. Both tools, New Relic `read` fails: New Relic parts show "Could not load New Relic data."; Sentry values do not appear in their place.
7. Sentry `read` covers the same pages as New Relic (local dev only, see `LOCAL_ONLY_NRQL`), the same 24h window, and the `MAX_PAGES` limit.
8. A vital Sentry has no value for shows "—", not 0.
9. The AI prompt for a Sentry-only user has no load-time or error-rate line.

### 12.8 Edge cases

- Sampled count is 0 but errors exist for a page: list the page, show "—" for traffic and vitals.
- History recorded before C3 has no Sentry vitals: trends show a gap, not 0 (section 11.C).
- A second tool is added later and precedence switches the supplier: numbers may step. The trend must not draw this as a regression.
- Consumer ad-blocker blocks the vendor endpoint: the site is unaffected and the dashboard shows 12.5.
- Phone width: column rules from UI spec section 7 apply to the new sampled column.

### 12.9 Out of scope

- New tools (CrUX, PageSpeed, GA4).
- Sentry `loadTime`, `apdex`, `ajax`, `errorRate`, and any status rule for Sentry-only.
- Scaling sampled counts up to estimates.
- Disconnecting a tool from the UI (section 11.E "PR 3"), unless Q1 changes that.
- Persisted history and hosted storage.
- Renaming existing mislabelled cards: the "Throughput" tile's "k/s" on a 24h count, and "Pages Passing Core Web Vitals", which is an Apdex check.
- Sentry session replay, profiling, source maps.

### 12.10 Contradictions with the approved documents

1. **Sentry-only page list.** Sections 7.2 and 11.F.2, and the UI spec's "limit line", build the list from error URLs. C3 builds it from tracing, so error-free pages appear. Retire these UI spec strings: "Sentry-only limit line", the "Pages with errors" table title, "No pages to show yet … after its first error", and the "Sentry-only" column of UI spec section 4.
2. **Scope.** Section 6 lists "changing what each tool shows" as out; C3 changes what Sentry shows.
3. **PR numbering.** Section 11.E's PR 2 (Sentry-only page list) is replaced by C3; its PR 3 (disconnect) is untouched and still pending.
4. **`/connect`.** The UI spec's numbered snippets ("1. New Relic Browser agent, 2. emitMetric() helper, 3. Verify"; "1. Sentry errors, 2. Verify") become one `init` snippet plus Verify.
5. **US5.** It said a tool is "one entry declaring its required keys". It is now keys, capabilities and five operations.
6. **UI spec open point 5.** Sentry-only home hidden until confirmed is resolved by 12.4.
7. **`AGENTS.md`.** Its metrics shape (`newRelic`, `sentry` per page) is named by vendor. If C1 changes the response shape, that reference needs a matching edit, which needs the user's approval.

### 12.11 Existing behaviour found while reading (not run)

1. Both tools: a page with Sentry errors and no New Relic views shows "0ms" and "Warning". `hasData` is true, `EMPTY_NEWRELIC_METRICS` has Apdex 0, and `deriveStatus` treats Apdex below 0.9 as Warning. See Q4.
2. `deriveStatus` exists twice with different rules: `app/api/metrics/route.ts` (error rate 1% and 5%) and `lib/thresholds.ts` (user thresholds). `useMetrics` overwrites the first with the second; the home screen fetches directly and gets the first.
3. A New Relic page with views but no timing rows shows LCP, CLS and INP as 0. The "—" branch for INP in `lib/tools.ts` can never run, because `mergeVariants` always returns a number.
4. `SentryAnalytics` does not filter to local pages; New Relic does.
5. mf-demo depends on `@karan171996/metricflow` `^0.2.2`; this repo is 0.5.0.

### 12.12 Open questions

| # | Question | Recommendation |
|---|---|---|
| Q1 | Confirm `update` means "change a tool's keys or settings from the dashboard" (today's `/setup`), and nothing in the consumer's browser. Does it include removing keys? | Yes to the meaning. Removing keys stays in the separate disconnect PR. |
| Q2 | Does C2 bundle the New Relic browser agent behind `init` too, or Sentry only? | Both, so `/connect` has one snippet and the "no vendor SDK" decision holds for every tool. |
| Q3 | Default Sentry sample rate in `init`? | 0.1, as in today's snippet, overridable in `init`, with the hint in 12.5. Choose 1.0 instead if first-run "nothing appears" matters more than Sentry quota. |
| Q4 | Fix item 12.11.1 (the "0ms / Warning" page for users with both tools)? It is the one visible change for existing users. | Yes, in C3, noted in the release notes. |
| Q5 | Consumer already runs Sentry with a different DSN: skip (US7 criterion 7), or run a second isolated client? | Skip. A second client risks double-reporting and conflicts. |
| Q6 | Should `poll` also refresh Performance, detail and tool tabs? Today only Home refreshes every 30s. | Yes, same 30s, in C2. Drop it if Sentry rate limits bite. |
| Q7 | Should the import path be the existing package name with a browser sub-path, or a second package? | One package, one sub-path. Tech lead to name it. |
| Q8 | Fold the two `deriveStatus` rules into one (12.11.2)? | Yes, keep `lib/thresholds.ts`, in C1 only if it changes no visible status; otherwise C3. |
