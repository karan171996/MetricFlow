# Design: generic analytics-tool contract (C1, C2, C3)

Tech-lead design for `docs/plans/tool-tabs-by-key.md` section 12. Design only; no product code changed.
Written against v0.5.0 on `docs/tool-contract-design`. Items marked **UNVERIFIED** were not proven against running code or real data.
Revision 2: incorporates the eight required changes from the security review; recommended follow-ups are listed separately in section 12.1 and are not in scope unless stated.

## 0. Summary of decisions

| # | Decision | Rejected alternative |
|---|---|---|
| D1 | Each page carries `metrics` (merged view, fields named after capabilities, all optional) and `byTool` (each tool's own numbers). The response carries `sources` (capability -> supplying tool). | Supplier per page: there is no per-page mixing, so it would repeat one value 20 times. |
| D2 | `newRelic` / `sentry` stay in the `/api/metrics` JSON through C1 and C2, and are removed in C3. | Removing in C1: breaks "existing tests pass unchanged" and the `AGENTS.md` reference. |
| D3 | `lib/tools.ts` stays the client-safe registry (labels, icons, keys, capabilities, columns). The server half is the existing `Analytics` subclasses, registered in `lib/analytics/index.ts`, guarded by `import 'server-only'`. | Putting `read` on the `TOOLS` entry: drags `lib/env.ts` and `node:fs` into client components. |
| D4 | `read()` is today's `byPath()` plus the page list; `poll()` is a 25 s in-process memo of `read()` on the base class; `update()` validates one key group and returns what to write. The route does the single all-or-nothing write. | A scheduler or background poller on the server. |
| D5 | One package, sub-path `@karan171996/metricflow/browser`, built with `tsc` only (already installed), ESM only, `.mts` sources. | A second package (`metricflow-browser`); a bundler. |
| D6 | Vendor code is loaded with literal `import()` calls inside per-tool modules. `@sentry/browser` and `@newrelic/browser-agent` become real `dependencies`. | Pre-bundling vendors into `dist`; loading the New Relic agent from its CDN. |
| D7 | Existing Sentry is detected by `window.__SENTRY__` **before** our import, so nothing is downloaded when we skip. | `Sentry.getClient()` alone: carriers are per SDK version, so it misses a consumer on another version. |
| D8 | The route's `deriveStatus` stays untouched until C3; `lib/thresholds.ts` becomes the neutral one in C1. No visible status changes. | Folding in C1: changes the `status` value in the JSON and spoils the byte-identical proof. |
| D9 | C3 ships one Sentry query path, chosen after real trace data exists. No runtime fallback between datasets. | Shipping `spans` with an automatic `transactions` fallback: two unverified paths instead of one. |

Three points disagree with, or add to, the approved recommendations. They are collected in section 13.

---

## 1. Neutral page shape

### 1.1 Types (C1)

`lib/tools.ts` (vocabulary; client-safe):

```ts
export const CAPABILITIES = ['pages', 'traffic', 'loadTime', 'apdex', 'vitals', 'ajax', 'errorRate', 'errors'] as const;
export type Capability = (typeof CAPABILITIES)[number];
```

`lib/metricsHistory.ts` (next to `MetricsPage`, where the shape lives today):

```ts
/**
 * One tool's numbers for one page, or the merged view. Every field is named after
 * its capability and is optional: absent means "not provided or not measured".
 * A missing value is never written as 0.
 */
export interface PageMetrics {
  /** `sampled: true` = raw sampled count (Sentry). Never scaled, never called visitors. */
  traffic?: { count: number; sampled?: true };
  /** p75 page load, ms. */
  loadTime?: number;
  /** 0-1. */
  apdex?: number;
  /** ms, except cls (unitless). Each vital is optional on its own. */
  vitals?: { lcp?: number; cls?: number; inp?: number; ttfb?: number; fid?: number };
  ajax?: { latency: number; failRate: number };
  /** 0-100. */
  errorRate?: number;
  /** A counted capability: `count: 0` is a real zero when the supplier answered. */
  errors?: { count: number; latest: { title: string; count: number; lastSeen: string }[] };
}

export type Sources = Partial<Record<Capability, ToolId>>;

export interface MetricsPage {
  name: string;
  slug: string;
  url: string;
  visitors: string;
  /** Absent unless loadTime, errorRate and apdex are all provided. */
  status?: PageStatus;
  /** Merged view: each capability taken from `sources[capability]`. Shared screens read only this. */
  metrics: PageMetrics;
  /** Each connected, non-failed tool's own numbers. `/tools/<id>` reads only this. */
  byTool: Partial<Record<ToolId, PageMetrics>>;
  recordedAt: string;
  /** @deprecated Removed in C3. No screen may read these. */
  newRelic?: NewRelicPageMetrics;
  /** @deprecated Removed in C3. */
  sentry?: SentryPageErrors;
}

export interface MetricsSnapshot {
  timestamp: string;
  sources: Sources;          // so a supplier switch is not drawn as a regression (12.8)
  pages: MetricsPage[];
}
```

There is no `pages` field in `PageMetrics`: `pages` is the capability of supplying the list itself.

Why `byTool` exists: precedence rule 4 says a tool's own tab always shows that tool's own numbers. After C3 both tools provide `vitals`, New Relic wins in `metrics`, and the Sentry tab still needs Sentry's. It is also the natural input of the merge (section 3), so it costs nothing extra to send.

### 1.2 `/api/metrics` JSON

Today: `{ configured, tools, failed, project, pages[], history[], timestamp }`.

| PR | Change |
|---|---|
| C1 | Adds top-level `sources`; adds `metrics` and `byTool` on every page; adds `sources` on every history snapshot. Everything that exists today is byte-identical, including `newRelic`, `sentry` and `status`. |
| C2 | No shape change. `history` grows only on a fresh read (section 4.3), so it stops filling with duplicates. |
| C3 | Removes `newRelic`, `sentry` and server-side `status` from pages. Sentry-only returns pages for the first time. |

`newRelic` and `sentry` are kept for two releases, not one, because C3 is the first point where they cannot be honest: a Sentry-only page has no New Relic numbers and the old type would force zeros.

**Needs the user's approval:** `AGENTS.md` documents the vendor-named metrics shape. It stays true through C1 and C2. C3 must edit that paragraph (12.10.7). The edit is one bullet; it is listed in the C3 file list as "blocked on approval".

### 1.3 Legacy zeros in C1

C1 must change nothing on screen, so the New Relic adapter copies numbers as they are, including the zeros from `EMPTY_NEWRELIC_METRICS` and the `0` LCP/CLS/INP for a page with views but no timing rows (12.11.1, 12.11.3). The type allows absent; the adapter starts using it in C3 together with the Q4 fix. The Sentry adapter drops `errorRate` and `warningCount` from day one: they are hard-coded and nothing displays them (confirmed by grep).

```ts
// lib/analytics/NewRelicAnalytics.ts
export const toPageMetrics = (nr: NewRelicPageMetrics): PageMetrics => ({
  traffic: { count: nr.throughput },
  loadTime: nr.loadTime,
  apdex: nr.apdexScore,
  vitals: { lcp: nr.lcp, cls: nr.cls, inp: nr.inp, ttfb: nr.ttfb, fid: nr.fid },
  ...(nr.ajaxLatency !== undefined && { ajax: { latency: nr.ajaxLatency, failRate: nr.ajaxFailRate ?? 0 } }),
  errorRate: nr.errorRate,
});
// lib/analytics/SentryAnalytics.ts
export const toPageMetrics = (s: SentryPageErrors): PageMetrics => ({ errors: { count: s.errorCount, latest: s.latestErrors } });
```

---

## 2. Registry

### 2.1 The `TOOLS` entry (client-safe, `lib/tools.ts`)

```ts
export interface Tool {
  label: string;
  icon: LucideIcon;
  description: string;
  /** Shown on /tools/<id> when not connected (replaces CONNECT_REASON in app/tools/[tool]/page.tsx). */
  connectReason: string;
  /** Optional line under the group on /setup (replaces `id === "new-relic" && ...` in SetupForm). */
  setupNote?: string;
  /** `derived`: names this tool's `update()` may ask the route to persist (New Relic: NEWRELIC_REGION). Nothing else is ever written for it. */
  keys: { required: readonly string[]; optional: readonly string[]; derived?: readonly string[] };
  capabilities: readonly Capability[];
  stats: (live: MetricsPage[]) => { label: string; value: string }[];
  /** `needs` names the capability; `header` may depend on sampling (C3). */
  columns: { needs: Capability; header: string; cell: (p: MetricsPage) => string }[];
}
```

- C1 values: `new-relic` -> `pages, traffic, loadTime, apdex, vitals, ajax, errorRate`; `sentry` -> `errors`. C3 adds `pages, traffic, vitals` to Sentry.
- `KEY_LABELS` grows into `KEY_FIELDS: Record<string, { label; secret; help }>` (the data in `SetupForm`'s `FIELDS`), with `KEY_LABELS` still exported, derived from it. `SETUP_KEYS` in `lib/env.ts` becomes `TOOL_IDS.flatMap(id => TOOLS[id].keys.required)` (same values, same order). These two moves are what let a test tool get a setup group with no component edit (C1.5).
- `stats` keeps its signature and return shape. `test/tools.test.mjs` does a strict `deepEqual` on `stats(pages)[0]` and passes pages that have only `newRelic` / `sentry`, so in C1 the cells in `lib/tools.ts` keep reading the deprecated fields. They switch to `p.byTool[id]` in C3, when that test's fixture changes with the shape. `lib/tools.ts` is not under `components/` or `app/`, so C1.2 holds.
- Stats are not tagged with a capability. A tool's entry only declares stats for what that tool provides, so the tag would always be true. Columns get `needs` because it is one word each and the tab filters on it. This is a deliberate reading of "each stat and column names its capability" (12.4); say so if it must be literal.

Two pure helpers live beside `TOOLS`, used by the server and by tests:

```ts
/** First connected tool in TOOLS order that declares the capability. Failure does not change the answer. */
export function sourcesFor(connected: readonly ToolId[]): Sources;
/** Copies metrics[cap] from byTool[sources[cap]] for every sourced, non-failed capability. */
export function mergeMetrics(byTool: MetricsPage['byTool'], sources: Sources, failed: readonly string[]): PageMetrics;
```

### 2.2 The server half (`lib/analytics/`)

The server half is the existing class hierarchy. `lib/analytics/index.ts` becomes the server registry:

```ts
import 'server-only';
export const SERVER_TOOLS = {
  'new-relic': new NewRelicAnalytics(),
  sentry: new SentryAnalytics(),
} satisfies Record<ToolId, Analytics<any>>;   // a tool id with no server half is a compile error
```

How server code stays out of the client bundle:

1. **Direction of imports.** `lib/tools.ts` imports nothing from `lib/env.ts` or `lib/analytics/*`. `lib/env.ts` already imports `lib/tools.ts`, not the reverse; this keeps that direction. Client components import only `lib/tools.ts`.
2. **`import 'server-only'`** at the top of `lib/env.ts` and `lib/analytics/index.ts` (C2). Next handles this import itself, no package needed (`node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`, "Preventing environment poisoning"). A client import of either file then fails `next build`.
3. The node tests have no bundler, so `test/alias-hooks.mjs` resolves `server-only` to an empty module (two lines). The npm `server-only` package must not be installed for this: it throws outside the `react-server` condition.
4. The consumer browser entry is a separate tree (`browser/`) with its own tsconfig. The tsconfig's missing `paths` does **not** seal it: that blocks `@/` imports only, and `tsc` follows a relative import out of `include`, so `import '../lib/sentryDsn.js'` would compile and carry `axios` and the token-taking `orgSlugForDsn` into the consumer's bundle. Two things seal it: `rootDir: "browser"`, which makes any file outside the tree a compile error, and the build check in section 10, which resolves every specifier to a path. See 5.2.

---

## 3. Precedence and merge

One function in `app/api/metrics/route.ts`. It names no tool.

```
connected = connectedTools()                         // TOOLS order
if connected is empty      -> { configured: false, pages: [] }

sources = sourcesFor(connected)                      // per capability: first connected tool that declares it
pagesTool = sources.pages
if pagesTool is undefined  -> { configured: true, tools, sources, pages: [] }      // today's Sentry-only answer (C1, C2)

settled = await Promise.allSettled(connected.map(id => SERVER_TOOLS[id].poll()))    // C1: the two existing calls
failed  = ids whose promise rejected

if pagesTool in failed     -> HTTP 500 { error: "Could not load {Tool} data." }     // no rows can be listed; existing error card + Retry

pageList = buildPages(result[pagesTool].pages)       // existing: normalise, merge variants, top MAX_PAGES, slugs

pages = pageList.map(page => {
  byTool = {}
  for id in connected, id not in failed:
    byTool[id] = result[id].byPath[page.url] ?? emptyFor(id)
  metrics = mergeMetrics(byTool, sources, failed)    // capability by capability, never value by value
  return { ...page, visitors, metrics, byTool, recordedAt }
})

if this was a fresh read (not the memo): recordSnapshot(pages, sources)
return { configured: true, tools: connected, failed, sources, pages, history, timestamp }
```

Rules this encodes:

- **First connected tool in `TOOLS` order.** `sources` is computed from what is connected, not from what succeeded. A failed supplier leaves its capabilities empty with the tool named in `failed`; the next tool is never promoted (12.2 rule 3).
- **No per-page mixing.** `mergeMetrics` copies whole capabilities from one tool. A page the supplier has no row for gets nothing for that capability, even if another tool has it.
- **`emptyFor(id)`**: what "no row" means. For `errors` it is a real zero (`{ count: 0, latest: [] }`), because errors are counted in full. For measured capabilities it is absent. Through C1 and C2 New Relic's empty value is the legacy zeros (section 1.3); C3 makes it `{}`.
- **Rejection reasons are discarded.** The route uses only "fulfilled or rejected" from `Promise.allSettled`. A reason is never logged, returned or attached as a `cause` (section 4.4). The 500 body is the fixed string built from `TOOLS[id].label`.
- **Failure of a non-pages supplier** (Sentry today): pages still list, its capabilities are absent, `failed` names it. Unchanged from today.
- **Failure of the pages supplier**: stays a 500, as today, with the tool named. Screens already show the error card with Retry. Known limit: when New Relic fails, the Sentry tab is empty too, because rows are keyed by the pages supplier's list. That is today's behaviour and C3.6 asks for nothing more.

Client side, one helper replaces `showsSentry` and every `tools.includes("new-relic")`:

```ts
// lib/useMetrics.ts
export const provides = (s: { sources: Sources; failed: string[] }, cap: Capability): boolean =>
  s.sources[cap] !== undefined && !s.failed.includes(s.sources[cap]!);
```

`hasData` becomes `(m.traffic?.count ?? 0) > 0 || (m.loadTime ?? 0) > 0 || (m.errors?.count ?? 0) > 0` on `p.metrics`: the same truth table as today.

---

## 4. Contract interfaces

### 4.1 Browser half (`browser/`, runs in the consumer's site)

```ts
// browser/index.mts - public API
export type Attrs = Record<string, string | number | boolean>;
export interface InitOptions {
  sentry?: { dsn: string; tracesSampleRate?: number };
  'new-relic'?: { browserKey: string; applicationId: string; accountId: string; region?: 'us' | 'eu' };
}
/** Never throws, never rejects. No-op without `window`. */
export function init(options: InitOptions): Promise<void>;
/** No-op before init, and for a tool that cannot take the event. Never throws. */
export function send(name: string, value: number, attrs?: Attrs): void;

// what every tool module (browser/sentry.mts, browser/newrelic.mts) exports
export interface BrowserTool<O> {
  /** Returns a reason string if a value is malformed or looks like a secret. Runs before any vendor code loads. */
  check(options: O): string | null;
  init(options: O): Promise<void>;          // may throw; index.mts catches and warns once
  send(name: string, value: number, attrs: Attrs): void;
}
```

The option keys are the tool ids from `TOOLS`, so one id is used in the snippet, the console warnings and the dashboard.

`send` per tool: New Relic calls `agent.recordCustomEvent('MetricFlowEvent', { name, value, page: location.pathname, ...attrs })`, exactly today's `EMIT_SNIPPET`. Sentry's `send` is a no-op in C2: the dashboard reads no custom events from Sentry, and 12.3 allows "if the tool cannot take it, it does nothing".

### 4.2 Server half (`lib/analytics/Analytics.ts`)

```ts
export interface ToolRead {
  /** Present only for a tool with the `pages` capability. Raw rows; the route runs buildPages once. */
  pages?: { url: string; views: number }[];
  byPath: Record<string, PageMetrics>;
}
export interface ToolUpdate {
  results: Record<string, KeyResult>;       // per field, as validateKeys returns today
  /** Extra values to persist when every result is ok. Only names declared in TOOLS[id].keys.derived are accepted; others are dropped. */
  derived?: Record<string, string>;
}

export abstract class Analytics<TRaw extends Record<string, unknown>> {
  abstract readonly id: ToolId;
  /** One fetch of the last 24h. Throws on any failure (fixed text, no `cause`): an empty result must mean "no data", never "request failed". */
  abstract read(): Promise<ToolRead>;
  /** Shared default: read(), memoised for POLL_TTL_MS and de-duplicated while in flight. Failures are not cached. */
  poll(): Promise<ToolRead>;
  /** Checks this tool's key group against the vendor. Writes nothing. */
  abstract update(values: Record<string, string>): Promise<ToolUpdate>;
  // unchanged helpers: aggregateRows, groupByPath, pathOf, weightedAverage, percent, safeDivide
}
```

Relation to today's code:

- **`read()` is `byPath()`** with two changes. It returns the page rows too: New Relic's `read()` runs the existing `discoverPages()` query and the existing metrics query in parallel, with no NRQL change, so numbers cannot move. And it always throws on failure. Today the base class swallows a New Relic metrics failure and returns `{}`, which renders as zeros for every page; Sentry already overrides `onError` to rethrow. After C2 both throw and `onError` is deleted. This is a deliberate change in one failure path: zeros become "Could not load New Relic data." (12.3: "never zeros").
- Classes read their keys with `env()` at call time instead of taking them in the constructor, so one instance per tool can hold the memo. `aggregateMetrics()` and the `aggregate()` method used by `test/aggregate-metrics.test.mjs` are unaffected.
- **`update()`** is `checkNewRelic` / `checkSentry` from `lib/validateKeys.ts`, moved onto the classes. New Relic's also carries the `NRAK-` refusal for its optional Ingest key. `POST /api/setup` keeps everything that is already generic: the local-request check, the unsafe-character check, the half-filled-group rule over `TOOLS[id].keys`, and one `writeEnvLocal` call for all groups, made only if every tool's `update` passed. A tool never writes `.env.local` itself; that keeps "nothing saved for any group" and one file writer. The Insert-key branch becomes "a body with only optional keys of a connected tool", with the same responses. `validateKeys()` stays as a thin loop over `SERVER_TOOLS` so its callers and tests do not move.
- `discoverPages()` and its 60 s memo stay as New Relic's internal helper. The detail page's 404 check stops calling it directly and uses `SERVER_TOOLS[sources.pages].poll()` through one server helper (section 9).

### 4.3 What `poll` is, concretely

Client: a 30 s interval inside `useMetrics`, so Performance, detail and tool tabs refresh as Home does (Q6). Home moves onto `useMetrics` (which gains `history` and `sources`), so the interval exists in one place and Home gets the same threshold-based status as every other screen. On a failed tick the hook keeps the last good state and its old timestamp and sets a `stale` flag; it never goes back to `loading` (no flicker to empty).

Server: yes, one thing changes. `useMetrics` is mounted three times on most screens today (`Header`, `ThresholdAlert`, the screen), and every `GET /api/metrics` calls both vendors and pushes a history snapshot. Add a 30 s timer to that and one open tab makes about 12 vendor calls a minute and fills the 20-slot history ring with duplicates in under five minutes. So:

- `poll()` on the base class memoises `read()` for `POLL_TTL_MS = 25_000`, keyed by the tool's key values (a key change through `update` misses the memo). Same pattern as the existing `discoverCache`.
- `recordSnapshot` runs only when at least one tool did a fresh read.
- `/api/metrics` and the detail page's 404 check call `poll()`, never `read()` directly. Retry after a failure refetches, because failures are not cached.

No background timer, no scheduler, no new endpoint. The memo is per process, the same ceiling as `metricsHistory`.

### 4.4 Error hygiene (C2a)

An axios error carries the request config, and so the key, in its own properties. The rule for the server half:

- `read()` and `update()` catch everything and throw `new Error('<fixed text>')`: a literal string per tool, no interpolated vendor text, no `cause`, no rethrow of the caught object.
- The only thing logged is `console.error('[tool] <id> read failed', status)` where `status` is the HTTP status number or the literal `'no response'`. Never the error, never `error.message`, never the memo key.
- `update()` returns the fixed per-field messages `validateKeys.describe()` produces today; that function already follows this rule.
- Three existing places break the rule and are fixed in C2a:
  - `app/api/metrics/route.ts:75-77`: logs the raw error and echoes `error.message` in the 500 body. Becomes the fixed "Could not load {Tool} data." and a status-only log.
  - `lib/analytics/Analytics.ts:39-41`: `onError` logs the raw error. Deleted with the swallow.
  - `lib/analytics/NewRelicAnalytics.ts:180-182`: same override. Deleted.
- The tests assert on captured `console.error` / `console.log` output as well as on the response body (section 10).

### 4.5 `writeEnvLocal` becomes the guard (C1)

C1 replaces the compile-time `SetupKey` union with names derived from `TOOLS`, so the type no longer limits what can be written. The limit moves inside `writeEnvLocal`, the single writer:

- **Allow-list of names**, checked at run time: every `TOOLS[id].keys.required`, `.optional` and `.derived`, the `AI_PROVIDERS[*].key` names, and `AI_PROVIDER_KEY`. Any other name throws before the file is opened. `NEWRELIC_REGION` and `NEWRELIC_INSERT_KEY` stop being special constants in the allow-list and come from New Relic's entry (`derived` and `optional`).
- **Unsafe-character check on every value**: the `UNSAFE` pattern (whitespace, NUL, `#`, quotes, backtick, backslash, `$`) moves to `lib/env.ts` and is exported; it is today only in `app/api/setup/route.ts`. The route keeps its own check for the per-field message; `writeEnvLocal` throws if one ever gets past it, including through `derived`.
- The generic `POST /api/setup` reads `body[name]` only for names declared in `TOOLS`. It never iterates `Object.keys(body)`, so an unknown name in the body is ignored, not written.

---

## 5. Consumer entry point and packaging

### 5.1 One package, one sub-path

`@karan171996/metricflow/browser`, as Q7 recommends. Reason: the consumer already installs this package to run the dashboard (mf-demo lists it in `dependencies`), one publish and one version stay in step with the dashboard that reads the data, and the repo has no workspace set-up to host a second package.

The cost, stated plainly: the package's `dependencies` are `next@16.3.8`, `react@19.2.8`, `react-dom`, `axios`, and after C2 the two vendor SDKs. A consumer on another Next or React version gets a second, nested copy on disk. It is never bundled into their site, because the browser entry imports none of them, but it is install weight and `npm audit` surface. Revisit with a separate package if a consumer runs the dashboard through `npx` only and objects.

### 5.2 Layout and build

```
browser/
  index.mts        init, send, double-init guard, window guard, secret check; no static vendor import
  sentry.mts       BrowserTool for Sentry; the only file that names @sentry/browser
  newrelic.mts     BrowserTool for New Relic; the only file that names @newrelic/browser-agent
tsconfig.browser.json   include: browser/**; rootDir: browser; outDir: dist/browser; declaration: true; sourceMap: false;
                        module/moduleResolution: nodenext; types: []; lib: ["ES2022", "DOM"]; no "paths"
```

- **Tool:** `tsc -p tsconfig.browser.json`. The repo has no bundler other than Next's, and a library entry does not need one: the consumer's bundler does the bundling and the splitting.
- **Format:** ESM only. Sources are `.mts` so `tsc` emits `.mjs` and `.d.mts`, which are ESM whatever `package.json` says about `type` (it has none, and adding it would touch the CLI). No CommonJS build; add one when a consumer needs `require`.
- **What the tsconfig does and does not enforce:**
  - `rootDir: "browser"`: a relative import that leaves the tree (`../lib/sentryDsn.js`) is a compile error. Without it `tsc` follows the import silently.
  - no `paths`: `import '@/lib/env'` does not resolve.
  - `types: []`: `@types/node` is not loaded, so `process`, `Buffer` and `node:` modules do not type-check.
  - `lib: ["ES2022", "DOM"]`: browser globals only.
  - `sourceMap: false`: no map, so no embedded sources in the tarball.
- **The root tsconfig does not help.** It includes `**/*.mts` with the `@/` alias and Node types, so the pre-push `pnpm exec tsc --noEmit` passes on a `browser/` file that imports `lib/`. Therefore `pnpm run build:browser` runs in `.githooks/pre-push` (before the existing `tsc --noEmit` line) **and** in CI. The build check in section 10 is the third layer.

`package.json` changes (C2):

```jsonc
"exports": {
  "./browser": { "types": "./dist/browser/index.d.mts", "default": "./dist/browser/index.mjs" },
  "./package.json": "./package.json"
},
"files": [ "bin", "public", "dist/browser", ".next", ... ],
"scripts": {
  "build:browser": "tsc -p tsconfig.browser.json",
  "build": "next build && pnpm run build:browser",
  "prepublishOnly": "pnpm run build"
},
"dependencies": { ..., "@sentry/browser": "<exact, see below>", "@newrelic/browser-agent": "1.323.0" }
```

- The two SDKs must be `dependencies`, not `devDependencies` like `lucide-react`: the dashboard is shipped pre-built, but the browser entry is resolved by the consumer's bundler from this package's `node_modules`.
- Adding `exports` closes every other deep import of the package. Nothing uses one (the `bin` field is not subject to `exports`; the CLI reads `../package.json` by relative path).
- `test/package.test.mjs` asserts `prepublishOnly === "next build"`; it changes with this. `.gitignore` and the ESLint ignores gain `dist/`. CI and `.githooks/pre-push` gain a `pnpm run build:browser` step before the tests.
- **Exact pins for both SDKs, no caret.** The lockfile is not published, so a range would let a consumer install an SDK version nobody here reviewed. Consequences to accept:
  - pnpm `overrides` in `pnpm-workspace.yaml` do not reach consumers. An SDK advisory is fixed only by bumping the direct dependency and publishing; that is a release, not a config change.
  - Neither SDK may bring an install script. `allowBuilds` in `pnpm-workspace.yaml` stays as it is (checked in the pre-publish list, section 10).
- **Blocking item for C2b: choose the `@sentry/browser` major before the first publish, not after.** npm's latest is 11.5.0; the lockfile has `@sentry/core` 10.75.2 (through the dev-only `@sentry/node`), which is the only version whose global carrier I read. To decide:
  1. Does the 10.x line still receive security fixes? If not, 10 is out.
  2. In 11, are these unchanged: `init`, `getClient`, `browserTracingIntegration({ beforeStartSpan })`, `sendDefaultPii`, and the `globalThis.__SENTRY__` carrier that 5.4 relies on?
  3. In the chosen major, where do LCP, CLS and INP land (page-load span or standalone spans)? This feeds 8.2.
  Rule: take 11 if (2) holds; take 10 only if (1) holds and (2) fails. Record the answer and the exact version in the C2b PR description.

### 5.3 Lazy loading

```ts
// browser/index.mts
const LOADERS = {
  sentry: () => import('./sentry.mjs'),
  'new-relic': () => import('./newrelic.mjs'),
};
// browser/sentry.mts, inside init()
const Sentry = await import('@sentry/browser');
// browser/newrelic.mts, inside init()
const { BrowserAgent } = await import('@newrelic/browser-agent/loaders/browser-agent');
```

Every specifier is a string literal inside `import()`, which webpack, Turbopack, Vite and Rollup all turn into a separate chunk. `index.mts` has no static import of a vendor or of a tool module, so a site that never calls `init` downloads nothing, and a New Relic-only site never requests the Sentry chunk (US7.2, US7.3). Section 10 has the test that keeps it that way.

### 5.4 Behaviour of `init`

In order, all inside one `try`:

1. `typeof window === 'undefined'` -> return. Nothing at module top level touches `window`, so importing the entry during SSR or `next build` is safe (US7.5; the current snippet's comment records the `NREUM` build failure this avoids).
2. Already called -> one `console.warn`, return (US7.4). The flag is set on the first browser call whatever its outcome.
3. For each tool named in the options, run its `check()`. **If any check fails, start nothing** and warn once (C2.5).
4. Load and start each named tool in parallel. A failure in one is caught, warned once with the tool name, and does not stop the other or the page (US7.6).

`check()` runs the deny rules first, then the allow-list. Both must pass.

Deny rules, applied to every string value in the options **and to each part of the DSN separately** (user part, password part, host, path). A whole-string anchored pattern would let a token sitting in the DSN's user part through:

- any `NR??-` prefix other than `NRJS-`: `/^NR(?!JS-)[A-Z]{2}-/i` (NRAK, NRII, NRRA, NRIQ, NRAA and any other);
- `/^sntry[su]_/i` (Sentry org and user tokens);
- `/NRAL$/i` (New Relic ingest licence key);
- `/^[a-f0-9]{64}$/i` (legacy Sentry token).

Allow-list:

- New Relic: `browserKey` matches `/^NRJS-[a-z0-9]+$/i` (fully anchored); `applicationId` and `accountId` match `/^\d+$/`; `region`, if given, is exactly `'us'` or `'eu'`.
- Sentry: `dsn` parses as an http(s) URL whose user part matches `/^[a-f0-9]{32}$/i`, with an **empty password part** (legacy DSNs carried a secret there) and a numeric project path; `tracesSampleRate`, if given, is a finite number from 0 to 1.

Warnings:

- Every warning is a **fixed string** chosen by tool and rule. Nothing caught is ever passed to `console`: not the error object, not `e.message` (Firefox's `new URL()` error text contains the input), not the option value.
- A deny-rule hit uses a distinct text: "MetricFlow: a secret key was passed to init for {tool}. Nothing was sent. This key is already in your site's public JavaScript: revoke it now and create a new one." Refusing at run time does not undo the leak, so the message has to say so.

**Sentry start-up**

```ts
if ('__SENTRY__' in window) { warn once: "Sentry is already running on this page; MetricFlow left it as it is."; return; }
const Sentry = await import('@sentry/browser');
if (Sentry.getClient()) { same warning; return; }                    // covers a de-duplicated copy that started while we loaded
Sentry.init({
  dsn,
  sendDefaultPii: false,                                              // explicit, not left to the SDK default
  tracesSampleRate: options.tracesSampleRate ?? defaultRate(),        // see 13.2
  integrations: [Sentry.browserTracingIntegration({
    beforeStartSpan: (ctx) => ({ ...ctx, name: window.location.pathname }),   // pins the page name; see section 8
  })],
});
```

- The check runs before the import, so a skipped site downloads no second Sentry. `@sentry/core` 10.75.2 creates `globalThis.__SENTRY__` in `getSentryCarrier` and keys clients under the SDK version; that is why `getClient()` from our copy cannot see a consumer on a different version, and why the global is the test. Known false positive: a page that loaded a Sentry SDK and never initialised it is also skipped. That errs on the side of not double-reporting. **UNVERIFIED** in a browser with a second, real Sentry.
- Order matters and cannot be fully solved: if the consumer's own `Sentry.init` runs **after** ours, we cannot see it. The README must say "call MetricFlow's `init` after your own Sentry". In a Next app that uses `withSentry`, Next imports injected instrumentation modules before the project's `instrumentation-client` file (`instrumentationClientInject` doc), so the documented placement below is already in the right order.
- **Privacy defaults, stated in code:** `sendDefaultPii: false`; the integrations list is the SDK defaults plus `browserTracingIntegration` only. No replay, no feedback, no profiling integration is imported, so that code is never in the chunk.
- Never use `@sentry/nextjs` here: it names page loads by route pattern (`/posts/[slug]`) and would collapse pages.

**New Relic start-up**

```ts
if ('NREUM' in window || 'newrelic' in window) { warn once: "New Relic is already running on this page; MetricFlow left it as it is."; return; }
const { BrowserAgent } = await import('@newrelic/browser-agent/loaders/browser-agent');
agent = new BrowserAgent({
  init: {
    distributed_tracing: { enabled: true },
    session_replay: { enabled: false },
    privacy: { cookies_enabled: false },
  },
  info: { beacon, errorBeacon: beacon, licenseKey: browserKey, applicationID: applicationId, sa: 1 },
  loader_config: { accountID: accountId, trustKey: accountId, agentID: applicationId, licenseKey: browserKey, applicationID: applicationId },
});
```

- **Existing agent:** the check mirrors the Sentry one and runs before the import, so a site that already has New Relic's copy-paste snippet or its own agent does not get a second agent, and downloads nothing from us. If that agent reports to the account saved in `/setup`, its data appears; otherwise 12.5 shows. Same false positive as Sentry (global present, agent never started), same reasoning.
- **Privacy defaults:** session replay is off explicitly. `cookies_enabled` changes from today's snippet (`true`) to `false`: the dashboard reads page views, timings, AJAX and JS errors, none of which need the session cookie. **UNVERIFIED** that `PageView`, `PageViewTiming`, `AjaxRequest` and `JavaScriptError` counts are identical with it off; check in the demo before C2b merges, and if they are not, keep `true` and say so in the README.
- `beacon` is chosen by `region`: `bam.nr-data.net`, or `bam.eu01.nr-data.net` for `'eu'`. The EU host is **UNVERIFIED**; today's snippet is US-only, so EU users are no worse off.
- Double start through MetricFlow is covered by the entry's own flag.

### 5.5 What the consumer writes

```ts
// instrumentation-client.ts  (Next.js 15.3+; any browser-only entry file works elsewhere)
import { init } from '@karan171996/metricflow/browser';

init({
  sentry: { dsn: 'https://<public-key>@o<org>.ingest.sentry.io/<project>' },
  'new-relic': { browserKey: 'NRJS-xxxxxxxxxxxxxxxxxxx', applicationId: '123456789', accountId: '1234567' },
});
```

Custom events: `import { send } from '@karan171996/metricflow/browser'; send('checkout_step', 2, { step: 'payment' });`

`instrumentation-client` is the right place in Next: it runs in the browser only, before hydration, and its doc says asynchronous work started there is fire-and-forget, which is what `init` is. `/connect` renders this one snippet with only the connected tools' blocks, pre-filled from `/api/connect` (application ID and browser key are already returned; the DSN is added, local requests only). The route's comment "never returns key values" is reworded to "never returns secrets".

The DSN is public only in its modern form, so two rules apply (C2a):

- `parseSentryDsn` (`lib/sentryDsn.ts`) rejects a DSN with a password part: "This is a legacy DSN that contains a secret key. Copy the DSN from Project settings > Client Keys." It then also returns `publicKey` (the user part) and `host`. This runs on `/setup`, so a legacy DSN can no longer be saved. A user who saved one earlier sees Sentry as "request failed" until they replace it; release note.
- `/api/connect` never returns `env('SENTRY_DSN')`. It returns a DSN re-serialised from the parsed parts, `${protocol}//${publicKey}@${host}/${projectId}`, and nothing if parsing fails.

---

## 6. History

Confirmed: nothing is persisted. `lib/metricsHistory.ts` is a module-level array of at most 20 snapshots. The only disk writes in the app are `.env.local` (`lib/env.ts`) and the settings file (`app/api/settings/route.ts`). A restart, which every upgrade implies, empties the ring. **No conversion is needed.**

What does change:

- `MetricsSnapshot` gains `sources` (C1).
- The transforms stop averaging missing values as 0. `avg` runs over the values that are present, and a sparkline point with none present is `null`, which Recharts draws as a gap (C1; identical output while New Relic supplies everything, because its legacy values are always present).
- A "previous" comparison is used only when `prev.sources[cap] === current.sources[cap]`; otherwise the tile says "No prior data yet", which `buildChange` already supports (C3, the first PR where a supplier can switch).

---

## 7. Status

Readers of `page.status`: `HubTable` and `ThresholdAlert`, both through `useMetrics`, which overwrites the server's value with `lib/thresholds.deriveStatus` and the user's thresholds. Home fetches `/api/metrics` directly but never renders a status. So the rule in `app/api/metrics/route.ts` is never displayed anywhere; it only fills the JSON and the history.

- **C1:** `lib/thresholds.deriveStatus(m: PageMetrics, t): PageStatus | undefined`. It returns `undefined` unless `loadTime`, `errorRate` and `apdex` are all present; otherwise the same arithmetic as today. `ThresholdAlert` drops `tools.includes("new-relic")` and skips pages with no status; `HubTable` hides the Status column when no page has one. The route's own `deriveStatus` is not touched, so the JSON is byte-identical. No visible status changes for any set of keys.
- **C3:** the route's copy and the `status` field in the JSON are deleted, in the same PR that removes `newRelic` and `sentry`. One rule remains.

Folding could be done in C1 without changing a pixel (the answer Q8 asks for), at the price of one allowed difference in the C1 JSON proof. I recommend C3 so that proof has no exceptions.

---

## 8. Sentry as a provider (C3)

Capabilities become `pages, traffic, vitals, errors`. `SentryAnalytics.read()` runs the existing errors query and one page-load query in parallel, and caches the org slug in process (today `orgSlugForDsn` is one extra request on every read).

### 8.1 Page-load query

Target, following the spike, with every field name **UNVERIFIED** against data:

```
GET {apiBase}/organizations/{slug}/events/
  dataset      = spans
  project      = {projectId}
  statsPeriod  = 24h
  query        = span.op:pageload is_transaction:true
  field        = transaction, count_sample(), p75(measurements.lcp), p75(measurements.cls),
                 p75(measurements.inp), p75(measurements.ttfb)
  per_page     = 100
```

Fallback candidate, also unverified: `dataset=transactions`, `query = event.type:transaction transaction.op:pageload`, `count()` in place of `count_sample()`.

- **`count_sample()`, not `count()`, on `spans`.** There `count()` is extrapolated from the sample rate, and scaling sampled counts is out of scope (12.9). On `transactions`, `count()` is the raw count.
- The query parameters are built by one function. Exactly one dataset ships. The spans dataset answered 200 to invented attribute names, so a runtime "try spans, then transactions" would only hide a wrong name behind a second unverified path.
- Mapping: `traffic = { count, sampled: true }`; each p75 that comes back `null` is left out, never 0 (C3.8); CLS is unitless, the rest are milliseconds, the same units as New Relic's adapter.
- Page list: the union of page-load paths and error paths, with `views` = sampled count or 0, through the existing `buildPages` (`MAX_PAGES`, slugs, names). That is how a page with errors and no sampled load is still listed with "—" for traffic and vitals (12.8).
- Local pages only (C3.7, 12.11.4): the errors query already returns `url`, so both queries are filtered to `localhost` / `127.0.0.1` hosts. The same clause is added to the errors query; with both tools connected this can lower error counts for a project that also receives production errors. That is a visible change for existing users: put it in the release notes with the Q4 fix.
- Page name: `init` pins it to `window.location.pathname`, which `normalizePath()` already handles. Data from a consumer's own Sentry (the skip case in 5.4) may be named by route pattern; those pages will appear as patterns. Accepted; noted in the README.

### 8.2 Must be re-checked once real trace data exists

C3 cannot be called done before this list is closed, and generating traces in the demo is blocked on the user's approval.

1. Which dataset actually holds this plan's page loads, and whether `transactions` is populated at all on a spans-billed plan.
2. The real attribute names on `spans` for LCP, CLS, INP, TTFB and for the page URL / host.
3. **INP.** From SDK v8 the browser SDK reports INP as a standalone interaction span, not on the page-load transaction. `p75(measurements.inp)` filtered to `span.op:pageload` may always be empty; INP may need its own query grouped by page. This is the most likely surprise.
4. Whether LCP and CLS are still attached to the page-load span in the pinned SDK major, or have also moved to standalone spans.
5. That a p75 with no measurements comes back `null`, not `0`.
6. That `count_sample()` equals the number of page loads made at sample rate 1.
7. That `transaction` equals `location.pathname` with the `beforeStartSpan` pin, for hard loads and for client-side navigations.
8. That page-load vitals are still captured when Sentry starts late, after a lazy `import()`. The SDK reads buffered performance entries, so it should; not proven.
9. The host filter syntax on the chosen dataset.
10. Rate limits with three tool-tab screens polling: with the 25 s memo it is at most about five Sentry requests a minute per dashboard process.

### 8.3 Known semantic gap: client-side navigation

Page loads are full loads only. A route reached by an in-app link is a `navigation` span and is not counted. New Relic's `PageView` has the same rule, so the two tools agree, but C3.1 ("after navigating three routes ... all three appear") only passes if the demo routes are opened by full load. Either the tester reloads on each route, or the query widens to `span.op:[pageload,navigation]` for the page list and traffic (vitals stay page-load only). I recommend the first for parity with New Relic; it is question U4 in section 13.

### 8.4 For the security review

- The saved Sentry token works for these queries and carries admin and write scopes far beyond the `org:read` + `event:read` needed (`project:read` too when the DSN has no org id). The dashboard cannot narrow a token. Change the `/setup` help text to name the minimal scopes, and consider a warning when the token can do more. Not in C3's scope unless security asks.
- The plan and quota facts came from an internal billing endpoint. Nothing in this design calls it.

### 8.5 Also in C3

- Q4 fix: New Relic's "no row" becomes absent, so the "0ms / Warning" page becomes "—" with no badge. Release note.
- `lib/aiAnalysis.ts` reads `page.metrics`; each prompt line is written only when its value is present, and alerts whose `metric` was not sent are filtered (generalising today's `errorCount` filter). C3.9.
- `NEEDS_NEW_RELIC` is deleted; the 12.5 state takes over, using `TOOLS[sources.pages].label`.
- Tool cells in `lib/tools.ts` move to `p.byTool[id]`; Sentry gains its vitals and "Page loads (sampled)" columns.

---

## 9. File-by-file change list

### C1: capability mapping (no behaviour change)

**Fix first, in one small commit, so both people can start:** `Capability`, `CAPABILITIES`, `PageMetrics`, `Sources`, `MetricsPage`, `MetricsSnapshot`, the response type (`MetricsResponse` with `sources` and `failed`), and the signatures of `provides()`, `sourcesFor()`, `mergeMetrics()`. The dev builds against a fixture JSON in that shape while the senior-dev makes the route produce it.

| Order | File | Change | Who |
|---|---|---|---|
| 1 | `lib/tools.ts`, `lib/metricsHistory.ts` | Types above; `capabilities`, `connectReason`, `setupNote`, `needs` on columns, `KEY_FIELDS`; `sourcesFor`, `mergeMetrics` | senior-dev (contract commit) |
| 2a | `lib/analytics/NewRelicAnalytics.ts`, `SentryAnalytics.ts` | `toPageMetrics` adapters | senior-dev |
| 2a | `lib/env.ts` | `SETUP_KEYS` derived from `TOOLS`; `writeEnvLocal` accepts string keys and gains the run-time name allow-list and unsafe-character check (4.5) | senior-dev |
| 2a | `app/api/metrics/route.ts` | Add `sources`, `metrics`, `byTool`; snapshot gets `sources`. Fetching, status and legacy fields untouched | senior-dev |
| 2a | `lib/pageList.ts` (new, server) | The detail page's "does this slug exist" lookup, so the page file names no tool | senior-dev |
| 2a | `lib/thresholds.ts` | Neutral `deriveStatus` (section 7) | senior-dev |
| 2a | `lib/dashboardTransforms.ts` | Read `p.metrics`; average present values; each builder returns only the cards whose capability is provided | senior-dev |
| 2b | `lib/useMetrics.ts` | `sources` in state, `provides`, `hasData` on `metrics`; `showsSentry` removed; `NEEDS_NEW_RELIC` kept as the "no pages provider" state | dev |
| 2b | `components/header/Header.tsx`, `ThresholdAlert.tsx` | Subtitle parts and alert gated by `provides` / `status` | dev |
| 2b | `components/PerformanceHub/*`, `components/Analytics/PerformanceDetail.tsx`, `RelatedErrorsList.tsx` | Read `p.metrics`; columns, cards and KPIs gated by `provides` | dev |
| 2b | `components/ToolInsights/ToolInsights.tsx`, `app/tools/[tool]/page.tsx` | Columns filtered by `needs`; `connectReason` from `TOOLS` | dev |
| 2b | `components/Setup/SetupForm.tsx` | Fields and note from `TOOLS` / `KEY_FIELDS` | dev |
| 2b | `app/page.tsx`, `app/performance/[slug]/page.tsx` | Gate by `sources`; use `lib/pageList.ts` | dev |
| 3 | tests (section 10) | | senior-dev: node; dev: Cypress |

2a and 2b run in parallel. Not touched in C1: `lib/aiAnalysis.ts` (the legacy fields it reads are still posted to it), `components/Connect/*` (see 13.4).

### C2: contract and consumer entry point

**Fix first:** `ToolRead`, `ToolUpdate`, the `Analytics` abstract signatures (4.2), and `InitOptions` / `BrowserTool` (4.1). After that the server half and the browser half share no file.

| Order | File | Change | Who |
|---|---|---|---|
| 1 | `lib/analytics/Analytics.ts` | `read`, `poll` (memo), `update`; `onError` swallow removed | senior-dev (contract commit) |
| 2a | `NewRelicAnalytics.ts`, `SentryAnalytics.ts`, `lib/validateKeys.ts` | Implement `read` (with page rows) and `update`; keys read at call time; `validateKeys` becomes a loop | senior-dev |
| 2a | `lib/analytics/index.ts`, `lib/env.ts`, `test/alias-hooks.mjs` | `SERVER_TOOLS`; `import 'server-only'`; test stub | senior-dev |
| 2a | `app/api/metrics/route.ts`, `app/api/setup/route.ts`, `lib/pageList.ts` | The loop in section 3; generic optional-key branch; `poll()` | senior-dev |
| 2a | `lib/sentryDsn.ts`, `app/api/connect/route.ts` | Reject a DSN with a password part; return `publicKey` and `host`; `/api/connect` returns the re-serialised DSN (5.5) | senior-dev |
| 2a | `app/api/metrics/route.ts`, `Analytics.ts`, `NewRelicAnalytics.ts` | Error hygiene (4.4): fixed-text errors, status-only logs, the three raw logs removed | senior-dev |
| 2b | `browser/index.mts`, `sentry.mts`, `newrelic.mts`, `tsconfig.browser.json` | Section 5 | dev |
| 0 | (decision) | Sentry major and exact versions of both SDKs (5.2). **Blocks 2b.** | senior-dev |
| 2b | `package.json`, `pnpm-lock.yaml`, `.gitignore`, `eslint.config.mjs`, `.github/workflows/ci.yml`, `.githooks/pre-push`, `test/package.test.mjs` | Exports, `files` (`dist/browser`), scripts, two exactly pinned dependencies, `dist/` ignores, `build:browser` in CI and pre-push | dev |
| 3 | `lib/useMetrics.ts`, `app/page.tsx` | 30 s interval, keep-last-good, `history`; Home uses the hook | dev (needs 2a merged or a fixture) |
| 3 | `components/Connect/snippets.ts`, `ConnectPage.tsx` | One `init` snippet from the connected tools; no `npm i <vendor>` line | dev |
| 4 | `README.md` | Consumer section: install, the `init` call, "after your own Sentry" | dev |
| 5 | mf-demo branch | Remove `@newrelic/browser-agent`, call `init` once. Not our repo and it holds the user's uncommitted work: needs the user's go-ahead (13, U5) | tester |

### C3: Sentry provides pages, vitals, sampled traffic

**Fix first:** the verification list in 8.2. Until it is closed only the display work can start.

| Order | File | Change | Who |
|---|---|---|---|
| 0 | (data) | Real traces in the demo; close 8.2 | senior-dev, after approval |
| 1a | `lib/analytics/SentryAnalytics.ts` | Page-load query, page rows, slug memo, local filter | senior-dev |
| 1a | `lib/analytics/NewRelicAnalytics.ts`, `app/api/metrics/route.ts` | "No row" = absent (Q4); drop `newRelic`, `sentry`, `status` and the route's `deriveStatus` | senior-dev |
| 1a | `lib/aiAnalysis.ts`, `lib/dashboardTransforms.ts` | Prompt by capability; supplier-switch guard | senior-dev |
| 1b | `lib/tools.ts` | Sentry capabilities and columns; cells read `byTool`; sampled header | dev |
| 1b | `lib/useMetrics.ts`, `components/EmptyState` callers, `Header.tsx`, hub, home, detail | 12.5 state replaces `NEEDS_NEW_RELIC`; sampled labels; "—" for absent vitals | dev |
| 2 | `docs/plans/tool-tabs-ui-spec.md` | Retire the strings listed in 12.10.1 | dev |
| 2 | `AGENTS.md` | Metrics-shape bullet. **Blocked on the user's approval.** | senior-dev |
| 3 | `test/tools.test.mjs`, `test/tool-tabs.test.mjs` | Fixtures move to the neutral shape | senior-dev |

---

## 10. Test plan

Node tests follow `test/tool-tabs.test.mjs`: `mockAxios`, `FAKE` keys, `load()` of the route modules, a temp env file.

### C1

- **No-behaviour-change proof.** On `main`, before any change, run the route with three fixed axios fixtures (both tools; New Relic only; Sentry only), with the clock mocked, and commit the outputs as `test/fixtures/c1-*.json`: the `/api/metrics` body, and the return values of `computeStats`, `computeWebVitals`, `computeCwvTrend`, `computeVisibilityBreakdown`, `computeWhatMoved` for two consecutive snapshots. The C1 test asserts: (a) the new body, with `sources`, `metrics` and `byTool` deleted, deep-equals the committed body; (b) every transform output deep-equals the committed one. The fixtures must include a page with no New Relic row and a page with no timing rows, so the legacy zeros are covered.
- `sourcesFor`: both -> all New Relic except `errors: 'sentry'`; Sentry only -> `{ errors: 'sentry' }`; none -> `{}`.
- `mergeMetrics`: a capability copies from its supplier only; a failed supplier leaves it absent; a tool that has the value but is not the supplier is ignored.
- `deriveStatus`: returns `undefined` when any of the three inputs is missing; same results as today for the existing cases.
- `writeEnvLocal`: an undeclared name throws and the file is untouched; a value with an unsafe character throws; every declared tool, derived and AI key name is accepted. `POST /api/setup` with an extra undeclared name in the body saves the declared ones and writes nothing for the extra.
- **C1.5:** a test builds a registry with a third tool declaring only `errors` and one Errors column, and asserts `TOOL_IDS`, `SETUP_KEYS` and the filtered columns include it. No component is imported.
- **C1.2 as a test:** grep `components/` and `app/` (excluding `app/api` and, until C2, `components/Connect`) for `.newRelic`, `.sentry`, `"new-relic"`, `"sentry"`; expect none.
- All existing tests unchanged and green.
- Cypress: the existing specs pass unchanged. Add to `tool-tabs.cy.ts` one visit per key set (both, New Relic only, Sentry only) with `/api/metrics` intercepted, asserting the same headings, column headers and tiles as on `main`.

### C2

- `read` throws on a vendor error for both tools; the route answers with `failed` (non-pages supplier) or 500 with the tool's name (pages supplier). `console.error`, `console.log` and `console.warn` are captured for the whole test: neither the response body nor any captured line contains a `FAKE` key value or the text of the thrown error (the existing `httpError` helper puts a fake key in its message for exactly this). The thrown error has no `cause`.
- `/api/connect`: with a DSN saved, the response contains the re-serialised DSN and none of `FAKE.NEWRELIC_API_KEY`, `FAKE.SENTRY_API_KEY` or an Insert key value; a legacy `public:secret@` DSN in the environment yields no DSN in the response. `parseSentryDsn` rejects the legacy form.
- `poll`: two calls inside 25 s make one vendor request; a failure is not cached; changing a key misses the memo; no snapshot is recorded on a memo hit.
- `update`: the existing setup tests in `tool-tabs.test.mjs` pass unchanged (C2.6). Add: a registry with a third tool goes through `POST /api/setup` with no route edit.
- **Browser entry, `test/browser-entry.test.mjs`** (`mock.module` for the two SDKs, `globalThis.window` set and removed per test):
  - no `window` -> returns, no import attempted;
  - New Relic only -> the Sentry mock is never loaded, and the reverse; never called -> neither;
  - second `init` -> nothing started, one warning;
  - refused, nothing loaded, one fixed warning that tells the user to revoke: `NRAK-`, `NRII-`, `NRRA-`, `NRIQ-`, `NRAA-` keys; a `sntrys_` token; a 64-hex string; a value ending `NRAL`; **a token placed in the DSN's user part**; a DSN with a password part;
  - refused as malformed: DSN user part that is not 32 hex; `browserKey` of `NRJS-` followed by a space or symbol; non-numeric IDs; `tracesSampleRate` of `2`, `-1`, `NaN` or a string; `region: 'apac'`;
  - in every refusal the captured console text is one of the known fixed strings and contains no part of the input; a `new URL()` failure is covered by passing a secret-looking non-URL as the DSN;
  - `window.__SENTRY__` present -> the Sentry module is not imported, one message; `window.NREUM` or `window.newrelic` present -> the New Relic module is not imported, one message;
  - the options passed to the SDK mocks include `sendDefaultPii: false`, `session_replay.enabled === false`, and no replay integration;
  - the SDK mock throws in `init` -> `init` resolves, one warning, the other tool still starts;
  - `send` before `init` -> no throw; after -> `recordCustomEvent('MetricFlowEvent', ...)` with the expected payload.
- **Build check (C2.4), one function `checkBrowserTree(dir)` in the same file**, run on three trees: `browser/` (source), fresh `tsc -p tsconfig.browser.json --outDir <tmp>` output, and `dist/browser` inside an extracted `npm pack` tarball. For every file:
  - **Forbidden names are derived, not listed.** The set is every name in `TOOLS[*].keys.required`, `.optional` and `.derived` that does not start with `NEXT_PUBLIC_`, plus every `AI_PROVIDERS[*].key` (`GEMINI_API_KEY`, `CLAUDE_API_KEY`, `OPENAI_API_KEY`) and `AI_PROVIDER`. A new tool's secret is covered the day it is added to the registry.
  - No match for `process.env`, `node:`, `axios`, `lib/env`, or a specifier starting `@/`.
  - **Every import specifier is resolved, not string-matched.** Static and dynamic specifiers are collected; a relative one is resolved with `path.resolve(dirname(file), spec)` and must lie inside the tree being checked (`./x/../../lib/y.js` starts with `./` and still fails); a bare one must be exactly `@sentry/browser` or `@newrelic/browser-agent/loaders/browser-agent`.
  - `index.mjs` has no static `import ... from` at all.
  - It runs under `test:cli`, so CI and pre-push fail on it. Negative cases are part of the test: a temp tree containing each violation must be rejected.
- `tsc -p tsconfig.browser.json` fails on a fixture file that imports `../lib/sentryDsn.js` (proves `rootDir`).
- **Package check:** extend `test/package.test.mjs`: under `dist/` the pack list contains only `dist/browser/*.mjs` and `*.d.mts` (no `.map`, no `.ts` sources, nothing else), and `exports["./browser"]` points at files in that list.
- `next build` itself is the check that `server-only` holds for the dashboard's own client bundle.
- Cypress: `/connect` shows one snippet containing `@karan171996/metricflow/browser` and `init(`, and the page text contains neither `npm i @sentry/browser` nor `npm i @newrelic/browser-agent` (US7.8); with one tool connected, only that tool's block. With `cy.clock`, a second `/api/metrics` request is made after 30 s on Performance and on a tool tab; when that second request fails, the old numbers and the old "updated" time stay on screen with the "Could not load" line.
- Manual, in the demo (US7.1, 7.2, 7.7, 7.9): network tab shows no Sentry chunk for a New Relic-only `init`; a page that already runs Sentry keeps one client.

**Pre-publish checklist for the first release that contains `./browser`** (C2b; items a, b, d, e are automated above or here, c and f are manual and recorded in the PR):

- (a) `npm pack`, extract, run `checkBrowserTree` on the extracted `dist/browser`.
- (b) The tarball has only `dist/browser/*.mjs` and `*.d.mts` under `dist`, no `.env*` anywhere, and no source map with embedded sources.
- (c) Install the tarball into a scratch consumer app outside the repo, build it, and grep its client bundle for the derived secret names, `axios` and `node:`. Also confirm there that a New Relic-only `init` produces no Sentry chunk request.
- (d) Neither SDK, nor anything they bring, declares an install script; `allowBuilds` in `pnpm-workspace.yaml` is unchanged in the diff.
- (e) The CLI still starts with `exports` present: the existing `test/cli.test.mjs` run against the packed, installed tarball, not only the working tree.
- (f) Publish from CI with npm provenance, on an account with 2FA. Today publishing is a local `prepublishOnly`; moving it to CI is a change to how the user releases and needs their agreement (U8).

### C3

- `SentryAnalytics.read` with mocked page-load rows: paths normalised; `null` p75 -> field absent; `traffic.sampled === true`; a path with errors and no page load is listed with no traffic; more than `MAX_PAGES` paths are cut; non-local hosts are dropped; a failing page-load request rejects the whole `read`.
- Route: Sentry only -> pages listed, no `loadTime`, `apdex`, `errorRate`, no `status`. Both -> `metrics.vitals` equals New Relic's while `byTool.sentry.vitals` is Sentry's. Both with New Relic failing -> 500 naming New Relic, no Sentry value in its place.
- Transforms: a history whose `sources.vitals` changes between snapshots gives "No prior data yet" and a gap, not a delta.
- `aiAnalysis`: the Sentry-only prompt has no "Load Time" or "Error Rate" line (C3.9).
- A grep test: `NEEDS_NEW_RELIC` appears nowhere (C3.4).
- Cypress, Sentry-only fixture: no "0ms", no "Apdex", no status badge, no threshold alert; every traffic figure's label contains "sampled"; the 12.5 state with its Sentry line when `pages` is empty; phone width for the sampled column.
- A live test under `test/live/` for the real query, run only by `test:real`, added once 8.2 is closed.

---

## 11. Risks, and what to cut from C2

| Risk | Effect | Mitigation |
|---|---|---|
| C3's Sentry field names are wrong | Sentry-only shows no vitals, or the wrong ones | 8.2 is a gate; one query builder; do not merge on unverified names |
| INP is not on the page-load span | INP column always "—" | 8.2 item 3; a second query if needed |
| Consumer's Sentry starts after ours | Two clients, double reporting | README ordering rule; `instrumentation-client` placement; not detectable in code |
| `exports` added to `package.json` | Any deep import of the package breaks | None is known; ship as a minor with a release note |
| Two SDKs in `dependencies`, pinned exactly | Larger install; two more packages in `pnpm audit --prod`, which CI enforces at `high`; an SDK advisory needs a MetricFlow release, overrides do not reach consumers | Accept; watch advisories; bump and publish |
| Site already runs New Relic | Without the check, two agents and doubled page views | `window.NREUM` / `window.newrelic` skip (5.4) |
| `cookies_enabled: false` for New Relic | Possible change in what the agent reports | Demo check before C2b merges (5.4) |
| Legacy DSN rejected | A user who saved one sees Sentry fail until replaced | Clear `/setup` message; release note |
| New Relic and Sentry agents on one page both wrap `fetch`/XHR | Possible duplicate tracing headers | Demo check with both tools; not seen, not tested |
| `read` now throws for New Relic | A metrics failure shows "Could not load" where it showed zeros | Intended; release note |
| 25 s memo | Retry can show data up to 25 s old | Failures are not cached; acceptable for a 24 h window |
| Local-only filter on Sentry errors (C3) | Error counts can drop for users with both tools | Release note, with Q4 |
| C1 touches about 20 files with a "no change" promise | A missed read shows 0 or hides a card | The committed before/after fixtures and the grep test |

**If C2 is too large, cut in this order:**

1. Split it. **C2a**: server contract (`read`, `poll`, `update`, both routes generic, polling). **C2b**: browser entry, packaging, `/connect`. They share no file after the contract commit, so this is free and I would do it regardless.
2. Drop Q6 (polling on every screen). Keep the memo; Home keeps its own interval.
3. Ship C2b for Sentry only; New Relic keeps today's snippet for one release. This breaks Q2 and US7.8 for one release, so it needs the user's agreement.
4. Do not cut: the secret check, the `window` guard, the build check on the tarball, `rootDir`, `server-only`, error hygiene, the `writeEnvLocal` allow-list, the existing-agent checks. They are the security rule.

---

## 12. Security

### 12.0 Required controls, and where each is specified

| Control | Section | PR |
|---|---|---|
| Browser tree sealed: `rootDir`, `types: []`, DOM-only `lib`; `build:browser` in pre-push and CI | 2.2, 5.2 | C2b |
| Build check: resolved import paths, derived forbidden names, `node:` and `axios`, run on the packed tarball; `files` lists `dist/browser` | 5.2, 10 | C2b |
| `init` value checks: per-part deny rules, anchored allow-list, sample rate and region validated, fixed-string warnings that say "revoke" | 5.4 | C2b |
| Legacy DSN rejected; `/api/connect` returns a re-serialised DSN; response tested for secrets | 5.5, 10 | C2a |
| Fixed-text errors, no `cause`, status-only logs, three raw logs removed; tests assert on console output | 4.4, 10 | C2a |
| `writeEnvLocal` run-time name allow-list and value check; declared `derived` keys; route reads declared names only | 2.1, 4.5 | C1 |
| Privacy defaults for both SDKs; existing New Relic agent is skipped | 5.4 | C2b |
| Exact SDK pins; Sentry major decided before first publish; pre-publish checklist | 5.2, 10 | C2b |
| `import 'server-only'` on `lib/env.ts` and the server registry | 2.2 | C2a |

### 12.1 Security follow-ups (recommended; not in C1-C3 scope unless marked)

These came from the security review as recommendations. Each is listed with the PR I would put it in. None is added to an existing PR's acceptance criteria silently; the ones marked "fold in" are small enough that I recommend the manager add them to that PR explicitly.

| # | Follow-up | Where | Note |
|---|---|---|---|
| F1 | Local-Host check on every `/api/*` route when the dashboard is not exposed, and reject `Sec-Fetch-Site: cross-site` in `isLocalRequest`. DNS rebinding can read `/api/metrics` today; a cross-site page can trigger `POST /api/analyze` on the user's AI key. | **Its own PR, before C2a** | Existing exposure, unrelated to the contract. C2 raises its value: polling makes `/api/metrics` a steady feed. |
| F2 | Require an https DSN except for `localhost`; tell the user on `/setup` when the Sentry token will be sent to a host that is not `sentry.io`. The server sends the bearer token to whatever host the DSN names, now every 25 s. | Fold into C2a (same edit to `parseSentryDsn` as the password rule) | A non-blocking notice, not a refusal: self-hosted Sentry is legitimate. |
| F3 | Build the New Relic agent from `loaders/agent` with only the needed features (page view, timings, AJAX, JS errors, generic events) instead of `BrowserAgent`. Smaller chunk, no session-replay code shipped at all. | C2b if the demo check passes in the time available; otherwise the PR after | **UNVERIFIED** which feature modules `PageViewTiming` and `recordCustomEvent` need. It replaces "replay disabled" with "replay absent", which is the stronger form. |
| F4 | `poll` memo is a single slot per tool, replaced when the key changes; never a map (it would retain old secrets as keys). The memo key is never logged. C3's org-slug cache is keyed by token + DSN, also single slot. | **Fold into C2a and C3**: it is how the memo in 4.3 should be written anyway | Treat as part of the design, not optional. |
| F5 | `/setup` help text for the Sentry token names `org:read`, `project:read`, `event:read` and says to create a token with only these. A non-blocking warning only if scopes can be read passively from a response the dashboard already receives. Never probe by attempting a write; never block saving. | Text: fold into C3. Warning: its own small PR | Answers U7 unless the user says otherwise. |
| F6 | After C3 the page list is attacker-writable: anyone with the public DSN can send events. Page names, slugs and error titles are untrusted input. Keep React escaping (no `dangerouslySetInnerHTML` on them), cap title length on the server, and delimit them as untrusted data in the `lib/aiAnalysis.ts` prompt. | **Fold into C3** | Error titles are already attacker-writable today; C3 extends that to the page list and to the prompt's page lines. |
| F7 | `browserSetup` in `lib/connectStatus.ts` asserts the `NRJS-` form before a key is pre-filled into the snippet. | Fold into C2b (it feeds the snippet C2b writes) | One regex; otherwise the dashboard could pre-fill a key that `init` then refuses. |
| F8 | README: the `connect-src` hosts a consumer's CSP needs (the Sentry ingest host; `bam.nr-data.net` or the EU host); "call `init` after your own Sentry"; and that pinning the transaction name to `location.pathname` sends any IDs or tokens that sit in paths to Sentry. | C2b README section | The pathname point is a real trade-off of the pin in 5.4; `@sentry/nextjs`-style patterns would avoid it but collapse pages. |
| F9 | `minimumReleaseAge` in `pnpm-workspace.yaml`. | Its own one-line PR, any time | Protects this repo's installs only; consumers are protected by the exact pins. |

### 12.2 Other notes

- `init` warnings never include the offending value or a caught error (5.4).
- The Sentry token's excess scopes (8.4) and the internal billing endpoint (not used anywhere in this design).
- `/api/metrics` has no local-request check today; that is F1.

---

## 13. Where this differs from the approved recommendations, and open questions

### 13.1 Q2 (bundle New Relic behind `init` too): agreed, but it needs a second dependency

The brief allows no new dependency beyond `@sentry/browser`. Q2 cannot be met without `@newrelic/browser-agent` in `dependencies` (2.8 MB unpacked; pulls `fflate`, `web-vitals`, `@newrelic/rrweb`). The alternative, injecting New Relic's loader from its CDN, adds a third-party script, CSP trouble and no version pin, so I rejected it. **U1: confirm the second dependency, or accept cut 3 in section 11.**

### 13.2 Q3 (default sample rate 0.1): risky for this product

The dashboard only shows pages from `localhost` / `127.0.0.1`. On a developer's machine 0.1 means nine of ten page loads never arrive, quota is not a concern, and the first-run experience is the "nothing appears" state. Proposal: default `1.0` when `location.hostname` is `localhost` or `127.0.0.1`, `0.1` otherwise, still overridable. The 12.5 hint line stays for non-local hosts. **U2: accept this default?**

### 13.3 Q8 (fold `deriveStatus`): moved from C1 to C3

Reason in section 7. No visible status changes either way.

### 13.4 C1.2 and `components/Connect/ConnectPage.tsx`

C1.2 says no component compares a tool id. `ConnectPage` does (two lines), and C2 rewrites that page around one snippet. Making it generic in C1 is work C2 then throws away. **U3: allow `components/Connect` to be exempt from C1.2 until C2?** If not, add about half a day to C1.

### 13.5 Could not settle

- Everything in 8.2. The C3 query is a proposal until real traces exist.
- The `@sentry/browser` major (10 or 11): now a blocking decision for C2b with its checks listed in 5.2.
- Whether New Relic reports the same events with `cookies_enabled: false` (5.4).
- The EU beacon host for New Relic (5.4).
- Whether the `__SENTRY__` check behaves as described next to a real second Sentry in a browser (5.4).

### 13.6 Questions only the user can answer

- **U1** Second dependency `@newrelic/browser-agent` (13.1).
- **U2** Local default sample rate 1.0 (13.2).
- **U3** `ConnectPage` exemption in C1 (13.4).
- **U4** C3.1 says "navigating three routes". Sentry and New Relic both count full page loads only. Should the tester reload on each route (my recommendation), or should Sentry's page list also count client-side navigations, which New Relic's does not (8.3)?
- **U5** Approval to generate real traces in the demo, and to make the mf-demo branch for C2.8 given its uncommitted changes. C3 is blocked on the first.
- **U6** Approval to edit the metrics-shape bullet in `AGENTS.md` in C3 (1.2).
- **U7** The `/setup` help text for the Sentry token: name the minimal scopes only, or also warn when the token can do more (8.4)? Security's recommendation is in F5.
- **U8** Publishing moves from a local `prepublishOnly` to CI with npm provenance and 2FA (pre-publish item f). Agree, and who sets up the npm token?
- **U9** Should F1 (local-Host check on all `/api/*`) be scheduled before C2a, as I recommend?
