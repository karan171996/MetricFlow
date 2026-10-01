# /live-test

Run end-to-end tests against real APIs using live .env.local credentials (Tester 2 only).

## What it does

Runs Cypress E2E tests against the live server with your real `.env.local` file, reading credentials in-process without copying them to disk. Validates that no secret values leak into test output or screenshots.

## Usage

```bash
npm run test:real
```

Or from Claude Code:

```
/live-test
```

## Requirements (Tester 2 only)

- `.env.local` must exist with valid New Relic and Sentry credentials
- Cypress test `cypress/e2e/live-metrics.cy.ts` must exist and pass
- Node.js 20.12+
- Tester 2 role (accesses real .env.local in-process only)

## What it validates

✅ **No secret leaks:** Scans Cypress output and verifies no `.env.local` values appear  
✅ **In-process credentials:** Reads .env.local in Tester 2 process only (never copied to disk)  
✅ **Key names only:** Never prints `.env.local` values, only validates presence  

## Not for CI/CD

This skill calls external APIs (New Relic, Sentry) and requires local credentials. Use `npm run cy:run` for headless testing in CI instead.

## Troubleshooting

- **Port in use?** The script finds a free port automatically
- **Build fails?** Check `npm run build` works locally first
- **Health endpoint timeout?** Ensure the server started without errors
- **Secret detected?** Remove hardcoded values from test or environment

## Files affected

- `test/live/live.test.mjs` — Tester 2 test runner
- `cypress/screenshots/` — writes test screenshots here
- `.env.local` — read in-process only (for credentials), never modified or copied to disk

---

See CLAUDE.md for project setup; `.claude/settings.json` for hook configuration.
