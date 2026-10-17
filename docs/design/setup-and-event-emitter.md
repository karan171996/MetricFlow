# Plan: no demo data, first-run key setup, and a "connect your app" page

Author: Ryan (advisor). Status: PLAN ONLY, needs human approval before any code. Builds on `data-sources.md`.

## Goal
Someone runs `npx performance-dashboard` inside or next to their own project. The dashboard starts, asks for New Relic and Sentry keys, then shows only real data. A built-in page shows how to attach the emitter functions so their site's metrics appear locally.

## 1. Remove demo data
- Delete `mockData.ts`, the `useRealAPI` flag, and the hard-coded arrays in `/performance` components.
- No keys = **empty state** ("Connect New Relic / Sentry"), never invented numbers. A source with no data yet shows "waiting for first event".

## 2. First-run setup page (`/setup`)
- Middleware/redirect: if required env vars are missing, send every route to `/setup`.
- Form fields: `NEWRELIC_API_KEY` (User key), `NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID`, `SENTRY_API_KEY`, `SENTRY_ORG_SLUG`, `SENTRY_PROJECT_ID`; Gemini optional.
- `POST /api/setup`: validate each key with one cheap read call (NR `{ actor { user { id } } }`, Sentry `GET /organizations/{org}/`), then write `.env.local` in the **user's current working directory** and reload env. Show per-key pass/fail.
- Safety: only accept requests from localhost, never echo keys back (mask last 4), never log them, ensure `.env.local` is in `.gitignore`.
- The CLI (`bin/cli.mjs`) can also prompt in the terminal as an alternative; the page is the main path.

## 3. Tracked pages become configurable
- `lib/trackedPages.ts` is a fixed list of 5. Replace with auto-discovery: top URLs from NR (`SELECT count(*) FROM PageView FACET pageUrl SINCE 1 day ago LIMIT 20`) with an optional user-edited list in Settings.

## 4. "Connect your app" page (`/connect`)
Explains, with copy-paste snippets and a live "events received" check:
1. **Browser metrics to New Relic**: paste the New Relic Browser agent snippet (or `@newrelic/browser-agent` npm). This gives `PageView`, `PageViewTiming` (LCP, CLS, INP), `JavaScriptError` with no custom code.
2. **Custom events / "event emitter"**: a tiny helper the user imports, e.g. `emitMetric(name, value, attrs)` that posts to New Relic's Event API (`NEWRELIC_INSERT_KEY`, event type `MetricFlowEvent`) or calls `newrelic.recordCustomEvent` from the browser agent. Show a Next.js `app/layout.tsx` example and a plain `<script>` example.
3. **Errors**: Sentry browser SDK init snippet using their DSN (`SENTRY_DSN`).
4. **Verify**: a "Send test event" button and a status row per source: *keys valid / events seen in last 5 min / last event time*. This is the step that tells the user it worked.
- Ship the emitter as a small file the CLI can copy into the user's project (`npx performance-dashboard init`), so they do not hand-write it.

## 5. Order of work (smallest first)
1. Remove demo data + empty states (Phyllis).
2. `/setup` page + `/api/setup` + redirect (Phyllis); design in Angela's hands.
3. Fix NR/Sentry queries per `data-sources.md`, wire `/performance` to real data.
4. `/connect` page + emitter helper + test-event check.
5. README and screenshots (Kelly).

## 6. Risks and decisions for the human
- **Writing `.env.local` from a web form**: fine locally, but a packaged `.next` build must not be exposed on a network; bind to localhost only.
- **Which key type**: NR needs a *User* API key for NerdGraph queries and a separate *License/Insert* key to send events. Setup must ask for each and explain the difference.
- **Emitter scope**: browser-only first; server-side (APM agent) is a later add.
- Question for Andy: is `init` (copying the emitter into the user's project) in v1, or only copy-paste snippets?

## 7. Decisions (Andy, 2026-10-02)
- `npx performance-dashboard init` is **not in v1**. Ship `/connect` with copy-paste snippets, "send test event", and live status. Add `init` only if users hit copy-paste friction.
- `/setup` must label the two New Relic keys:
  - **User API key** (`NEWRELIC_API_KEY`, starts `NRAK-`): lets the dashboard *read* data (NerdGraph/NRQL). Created under API keys > "User".
  - **Ingest - License key** (`NEWRELIC_INSERT_KEY`, for sending events): lets your site *send* data. Created as type "Ingest - License" (or "Ingest - Browser" for the browser agent).
  - Account ID (`NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID`) is a plain number, shown next to the key list.
