# Phase 0 test evidence (Toby)

Snapshot 2026-10-02, working tree uncommitted. Updated after each change batch.

## Global gates (checked by me)

| Gate | Result | Evidence |
|---|---|---|
| lint | PASS | `npm run lint`: 0 errors, 10 warnings |
| type check | PASS | `npx tsc --noEmit`: no output |
| tests | PASS | `npm run test:cli`: 24 pass, 0 fail (node:test); Cypress `smoke` + `mobile` 8/8 earlier, not re-run on the new code |
| build | PASS | `next build --webpack`. Plain `npm run build` (Turbopack) fails only in this sandbox (port bind EPERM); needs a normal-shell check |
| no keys in diff | PASS | pattern search of diff + new files: only regexes in `.githooks/secret-scan.sh` and the "starts NRAK-" help text, no real key |
| `.env.local` ignored, not staged | PASS | `git check-ignore .env.local`; 0 staged env files; `test/package.test.mjs` asserts it |
| no `mockData` import | PASS | grep of `app components lib hooks`: none |
| Meredith approval | not mine | |

## Changed files: test or reason

| File | Test / reason |
|---|---|
| `.gitignore` | `test/package.test.mjs` (example tracked, real env ignored) |
| `bin/*`, `CLI_OUTPUT.md` | `test/cli.test.mjs` (help, version, port, json, color, host, real start, LAN unreachable) |
| `package.json` | `test/package.test.mjs` (bin, engines, pack contents, no env/test files shipped) |
| `.claude/hooks/*` | `test/hook.test.mjs` |
| `README.md`, `docs/` | `test/docs.test.mjs` |
| `components/Settings/ThresholdSettings.tsx`, `hooks/use-mobile.ts`, `DonutChartCard.tsx` | lint + `cypress/e2e/mobile.cy.ts` |
| `lib/mockData.ts` (deleted) | grep gate above |
| **GAP** `app/api/metrics/route.ts`, `app/api/analyze/route.ts` | no test yet: need no-keys, API error and `useRealAPI` removal cases |
| **GAP** `lib/useMetrics.ts`, `components/EmptyState.tsx`, `PerformanceHub/PerformanceHub.tsx`, `Analytics/PerformanceDetail.tsx`, `HubTable/HubMetrics/PerformanceKPIs/RelatedErrorsList` | no test yet: need Cypress for empty state with link to `/setup`/`/connect`, "No data yet" not 0ms/Healthy, error banner with Retry, 404 for unknown slug |
| **GAP** `lib/trackedPages.ts` | no test yet: needs slug, merge and discovery cases (0.4) |
| **GAP** `.githooks/*` | no test yet (Kevin 0.6: needs pass and fail example) |

## Not yet testable (code missing)

0.3 `/setup`, 0.5 `/connect` and the event emitter, 0.4 New Relic discovery: no files exist. 0.1 designs are not code.

## Unclear or untestable boxes

- 0.5 "snippet works in a test page, event appears in New Relic": needs real New Relic keys and Ryan; I can only test the UI with a stubbed API (`cy.intercept`).
- 0.3 "refuses non-localhost requests": I can test with a spoofed Host/`X-Forwarded-For` header, but the CLI now binds 127.0.0.1 so a real remote request cannot reach it; say which behaviour is required.
- 0.8 "fresh-install end to end including data appears": the last step needs real keys; I will stop at the empty state and a stubbed event.
- Fixtures: no fake keys exist yet; I will mark them `FAKE-` prefixed.

## Update: Cypress states (2026-10-02)

`cypress/e2e/performance-states.cy.ts`, 8/8 pass (headed, `/api/metrics` stubbed, fake fixtures): no keys, no pages, never-reported page, API error + Retry recovery, row click, unknown slug (not-found), detail empty state, detail error. Covers `EmptyState`, `useMetrics`, `PerformanceHub`, `PerformanceDetail` behaviour. Still open: unit tests for `api/metrics`, `trackedPages`, `.githooks`.
Note: tests need a build not shared with other agents; concurrent `next build` in the same `.next` breaks the server (500, missing client reference manifest). I build a private copy for test runs.
