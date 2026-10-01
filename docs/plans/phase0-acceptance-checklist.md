# Phase 0 acceptance checklist

Owner: Andy (Product). Used by: Toby (tests), Meredith (commit/push gate). Source: `performance-click-through.md` section 17 and `setup-and-event-emitter.md`.
Rule: a task is done only when every box is checked with evidence (test name, command output or screenshot). Unchecked or untested = not done. No demo data anywhere.

## Global gates (every task, every commit)

- [x] Toby's changed-file list exists and every changed file has a test or a written reason it has none.
- [x] `npm run lint`, type check and the test suite pass; output pasted in the report.
- [ ] `npm run build` succeeds. **[PARTIAL: webpack build passes; plain Turbopack build fails only in Toby's sandbox, needs one normal-shell run]**
- [x] No API key, token or `.env.local` content in the diff, logs, test fixtures, screenshots or error messages (search the diff for `NEWRELIC`, `SENTRY`, `GEMINI`, `key`, `token`).
- [x] `.env.local` is in `.gitignore` and not staged.
- [x] No new import of `lib/mockData.ts` in `app/` or `components/`.
- [ ] `npm audit` shows no critical or high advisory in direct dependencies; a fix needing a version bump (e.g. `next` 16.3.5 → 16.3.8) needs the human's OK first. **[NOT VERIFIED: next 16.3.5 advisory, bump to 16.3.8 awaits human OK (Meredith)]**
- [ ] Meredith approves before any commit or push. **[PENDING: gates green, approval happens at commit/push]**

## 0.1 Screens (Angela)

- [x] Designs exist for: empty/no-data, error with Retry, `/setup`, `/connect`.
- [x] Every status uses text plus colour (not colour alone).
- [x] Wording avoids "0ms", "Healthy" or sample numbers for missing data.
- [x] Angela reviewed Phyllis's built screens against the designs (13 findings on /setup and /connect, all applied; approved in her re-review, per god 2026-10-02).

## 0.2 Remove mock data, add empty states (Phyllis)

_Evidence 2026-10-02 (Toby): `cypress/e2e/performance-states.cy.ts` 8/8 pass covers empty states, "No data yet", error banner + Retry, 404. Still to verify: mockData removal and the hard-coded arrays grep._

- [x] With no keys and no data, `/`, `/performance` and `/performance/[slug]` show an empty state with a link to `/setup` or `/connect`; no invented numbers.
- [x] `lib/mockData.ts` is deleted or unused; the `useRealAPI` switch in `app/api/metrics/route.ts` is gone.
- [x] Page with no New Relic data shows "No data yet", never 0ms or "Healthy".
- [x] API failure shows one error banner with Retry, not a blank page or a crash.
- [x] Grep proves no hard-coded metric arrays remain in `components/PerformanceHub` and `components/Analytics` (they may be removed in Phase 1; if left, they must not render).

## 0.3 `/setup` (Phyllis, Ryan)

- [x] First run with no keys redirects or links to `/setup`.
- [x] Form asks for New Relic User key, account ID and Sentry token, org and project, each with a one-line help text; it says which New Relic key queries and which sends events.
- [ ] Each key is checked with one read call; a bad key shows a clear message naming which one failed. **[PASS in tests (stubbed); live check with real keys not done]**
- [x] Valid keys are written to `.env.local` in the user's working folder; existing unrelated lines in that file are preserved.
- [x] Keys are never returned to the browser, echoed in a response, written to logs or shown after saving (shown as set/masked only).
- [x] The setup endpoint refuses requests whose `Host`/`Origin` is not localhost/127.0.0.1 (the 127.0.0.1 bind alone does not stop DNS rebinding or a proxy). Test: request with a spoofed `Host` header is rejected.
- [x] After saving, data loads without a manual restart, or the page states plainly that a restart is needed.
- [x] Tests cover: empty input, bad key, valid key, write failure, non-localhost request.

## 0.4 Page discovery (Phyllis, Ryan)

- [x] Tracked pages come from New Relic (top URLs by page views, last 24h, max 20), not the fixed list in `lib/trackedPages.ts`.
- [x] Each discovered URL gets a stable slug and a readable name; the rule is written down; two URLs never share a slug.
- [x] Query-string variants of one path are merged, not listed separately.
- [x] No pages discovered shows the empty state pointing to `/connect`.
- [x] `/performance/[slug]` for a slug that does not exist returns 404.
- [x] Tests cover: zero pages, many pages, duplicate paths, odd characters in URLs.

## 0.5 `/connect` (Phyllis, Ryan)

- [x] Page shows copy-paste snippets: New Relic Browser agent, the `emitMetric()` helper, Sentry init.
- [x] Snippets use placeholders, never the user's real keys.
- [x] "Send test event" sends one event and shows success or the exact failure.
- [ ] "Events received" status updates without a page reload and says "none yet" when empty. **[NOT VERIFIED: setup-connect.cy.ts is stubbed; confirm no-reload polling by hand]**
- [x] Explains New Relic User key (query) versus Insert key (send events).
- [ ] Automated: test event call is stubbed; test asserts the payload shape and the success/failure UI. Manual (Ryan, real keys, once): the event appears in New Relic and in the dashboard; result noted in the evidence file. **[UNMET: needs real keys, not in scope of this sign-off]**

## 0.6 Hooks (Kevin)

- [x] Hook fails a commit if `.env.local` is staged or not in `.gitignore`.
- [x] Hook scans for key logging (`console.log` of env vars or key variables) and secrets in fixtures.
- [x] Hook has a passing and a failing example, tested, and does not block unrelated commits.

## 0.7 CLI localhost bind (Jim)

- [x] `node bin/cli.mjs` listens on 127.0.0.1 only; confirmed from another machine or non-loopback address it is unreachable.
- [x] `--json` and `--no-color` still work; browser still opens.

## 0.8 Tests (Toby)

- [x] One test file or case per changed file listed; failing cases included (not only happy paths).
- [x] Fresh-install flow tested end to end with New Relic/Sentry calls stubbed (real-key check is Ryan's manual step in 0.5): no keys → `/setup` → keys saved → empty state → `/connect` test event → data appears.
- [x] Test fixtures contain only fake values, clearly marked.

## Phase 0 exit (Andy signs off)

- [x] Fresh install shows setup, not fake numbers.
- [x] Bad key: clear error, nothing logged or echoed.
- [x] Good keys persist to a gitignored `.env.local`.
- [x] Discovered pages replace the fixed 5.
- [x] `/connect` test event is visible in "events received".
- [ ] Kelly has updated README and screenshots; Creed re-tested install after push. **[UNMET: happens after push]**

## Evidence (Toby, 2026-10-02). Ticking boxes stays with Andy/Meredith.

Run: `npm run test:cli` (node, 67 tests) and `npx cypress run --headed` (30 tests). All keys in tests are `FAKE-`; env writes go to `METRICFLOW_ENV_FILE` temp files; the real `.env.local` was never touched (mtime unchanged). Full file-by-file list: `docs/plans/phase0-test-evidence.md`.

| Box | Evidence |
|---|---|
| Global: lint, tsc, tests | lint 0 errors/10 warnings; `tsc --noEmit` clean; node 66 pass, 1 FAIL (NUL byte, see bugs), 3 skipped; Cypress 30/30 |
| Global: build | `next build --webpack` passes (plain Turbopack build fails only in this sandbox) |
| Global: no keys in diff/logs/fixtures/screenshots | pattern search of changed + new files: no hit; tests assert no `FAKE-` value is ever returned in a response (`test/setup-api`, `connect-api`, `metrics-api`) |
| Global: `.env.local` ignored, not staged | `test/package.test.mjs` (git check-ignore); 0 staged files |
| Global: no `mockData` import | grep of app/components/lib/hooks: none |
| 0.2 empty states, "No data yet", error + Retry | `cypress/e2e/performance-states.cy.ts` (8): no keys, no pages, never-reported, API 500 + Retry, detail empty/error |
| 0.2 `mockData` deleted, `useRealAPI` gone | grep none; `test/metrics-api.test.mjs` (SKIPPED, see bugs) |
| 0.3 first run -> /setup | `performance-states` (setup link), `fresh-install.cy.ts` |
| 0.3 help text, which key reads | `setup-connect.cy.ts` "explains each key" |
| 0.3 bad key names the field | `test/setup-api.test.mjs`: NR rejected, bad account id, Sentry org/project/token; `setup-connect.cy.ts` "bad key" |
| 0.3 keys written to env file, unrelated lines kept | `test/env.test.mjs`, `setup-api` "valid keys" (0600, no temp file left) |
| 0.3 keys never returned/logged/shown | `setup-api` asserts responses have no `FAKE-`; GET returns booleans; Cypress "inputs cleared, shown as Set" |
| 0.3 refuses non-localhost | `test/local-request.test.mjs` (foreign Host/DNS rebinding, Origin, X-Forwarded-For), `setup-api` + `connect-api` 403 with no write and no external call |
| 0.3 works without restart | `setup-api` "valid keys" (process.env updated, GET configured true) |
| 0.3 tests: empty, bad, valid, write failure, non-localhost | all five present in `test/setup-api.test.mjs` |
| 0.4 pages from New Relic, stable unique slug, merge variants | `test/discover-pages.test.mjs` (zero, many/cap 20, query/case/slash merge, slug collisions, odd characters) |
| 0.4 no pages -> empty state; unknown slug 404 | `performance-states.cy.ts` |
| 0.5 snippets placeholders only | `setup-connect.cy.ts` "placeholder-only snippets" |
| 0.5 test event success/failure | `test/connect-api.test.mjs` (payload, exact errors), `setup-connect.cy.ts` |
| 0.5 events received updates without reload, "none yet" | `setup-connect.cy.ts` (polling), `connect-api` GET |
| 0.5 User vs Insert key explained | `setup-connect.cy.ts` |
| 0.5 event appears in New Relic | MANUAL (Ryan, real keys); not automated |
| 0.6 hooks | `test/githooks.test.mjs` (secret-scan: .env/.pem blocked, example allowed, tokens blocked and redacted); `test/hook.test.mjs` (Claude hook). Not tested: `.githooks/pre-push` (runs the whole suite, audit) |
| 0.7 CLI binds 127.0.0.1 | `test/cli.test.mjs` real start + LAN unreachable; installed-tarball check done earlier |
| 0.8 fresh-install e2e | `cypress/e2e/fresh-install.cy.ts` (stubbed): no keys -> /setup -> save -> empty state -> /connect test event -> data appears. Real-key run = Ryan (manual) |
| 0.8 fixtures fake | all `FAKE-` prefixed |

### Open bugs found by these tests
1. `app/api/setup/route.ts`: `UNSAFE` regex no longer rejects a NUL byte (old check had `\0`). Fix: add `\0` to the character class. Test: "a NUL byte in a value is rejected" FAILS until fixed.
2. `app/api/metrics/route.ts` imports `NewRelicPageMetrics` (a type) without `type`; fine for the bundler, but Node cannot load it, so the 3 metrics API tests are SKIPPED. Fix: `import { ..., type NewRelicPageMetrics }`.

### Update (Toby): real-server run found a blocking bug
Earlier bugs 1 and 2 above are fixed (NUL test and metrics API tests now run and pass). NEW, HIGH: on a real server `/api/setup` and `/api/connect` return 403 to genuine localhost requests, so /setup, /connect and the fresh-install flow cannot work. Cause: Next.js adds `x-forwarded-for: <socket address>` (here `127.0.0.1`) to every request (`base-server.js` line 612) and `lib/localRequest.ts` refuses any request with that header. Unit tests and the stubbed Cypress run missed it. Failing tests: `test/cli.test.mjs` real start (`/api/setup` must be 200) and `test/local-request.test.mjs` loopback X-Forwarded-For. Boxes 0.3 (all), 0.5, 0.8 e2e must not be ticked until fixed.
