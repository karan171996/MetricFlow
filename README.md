# MetricFlow — Performance Dashboard

MetricFlow is a local web dashboard that pulls page-performance data from New Relic and errors from Sentry, and uses AI (Gemini) to turn them into insights and alerts. Start it with one command: `npx @karan171996/metricflow`.

> Status: early (`v0.1.0`). The npm package is `@karan171996/metricflow` (run it with `npx @karan171996/metricflow`; after a global install the command is `performance-dashboard`). Not yet published to npm, so `npx` works only after publishing.

## Features

- **Dashboard** (`/`): KPI cards, line/bar/donut charts, Core Web Vitals cards, visibility breakdown, "what moved" and AI suggestions.
- **Performance hub** (`/performance`): per-page table and metrics, with a drill-down at `/performance/[slug]` (KPIs, charts, hourly breakdown, related errors).
- **Settings** (`/settings`): API keys, thresholds, notification preferences, export, team members.
- **Data sources**: New Relic (load time, LCP, TTFB, FID, error rate, throughput, Apdex) and Sentry (error count, warnings, latest errors).
- **API routes** (Next.js route handlers): `GET /api/metrics`, `POST /api/analyze`, `GET /api/health`, `/api/timings`.
- **CLI**: `performance-dashboard` starts the production server and opens your browser. Supports `--json` and `--no-color`.

## Screenshots

### Dashboard

![Dashboard](https://raw.githubusercontent.com/karan171996/MetricFlow/main/docs/images/dashboard.png)

### Performance hub

![Performance hub](https://raw.githubusercontent.com/karan171996/MetricFlow/main/docs/images/performance.png)

_Screenshots use sample data, not real New Relic or Sentry numbers._

### CLI

```
$ performance-dashboard
✔ Dashboard is running
  URL   http://localhost:3000
  Stop  Ctrl+C
```

## Requirements

- Node.js `>=20.12`
- Optional but needed for real data: New Relic, Sentry and Gemini keys

## Quick start

```bash
git clone https://github.com/karan171996/MetricFlow.git
cd MetricFlow
npm install
cp .env.local.example .env.local   # then fill in your keys
npm run dev                        # development, http://localhost:3000
```

Production-style run through the CLI (needs a build first):

```bash
npm run build
node bin/cli.mjs                   # or `performance-dashboard` once installed/linked
```

### Installing into an existing app

Tested by installing the packed tarball into an older Create React App project (react-scripts 2.1.3). Notes from that test:

- **Install size:** MetricFlow pulls in a large dependency tree (Next.js, Recharts, Cypress and others), so expect a heavy `npm install`.
- **Lockfiles:** if the host project uses yarn, installing with npm adds a `package-lock.json` next to `yarn.lock`. Use one package manager and commit only its lockfile.
- **Old toolchains:** the New Relic browser agent may not work in projects on webpack 4 (Create React App 2). This is untested; check before relying on it.

### Environment variables

Set these in `.env.local` (see `.env.local.example`). The CLI loads `.env.local` and `.env` from the folder you run it in.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID`, `NEWRELIC_API_KEY` | Read metrics from New Relic |
| `SENTRY_API_KEY`, `SENTRY_ORG_SLUG`, `SENTRY_PROJECT_ID` | Read errors from Sentry |
| `GEMINI_API_KEY` | AI analysis (`/api/analyze`) |
| `SENTRY_DSN`, `NEWRELIC_INSERT_KEY` | Only for `npm run send-test-data`, which writes a dummy event to each platform |

## CLI usage

```
performance-dashboard [port] [options]
```

| Option | Description |
| --- | --- |
| `-h`, `--help` | Show help |
| `-v`, `--version` | Print the version |
| `--json` | Machine-readable output: one JSON object per line on stdout (`event` is `ok`, `info`, `warn`, `error` or `summary`) |
| `--no-color` | Disable colors (also honors `NO_COLOR` and non-TTY output) |
| `--host <addr>` | Address to listen on. Default `127.0.0.1` (this machine only). `--host 0.0.0.0` exposes the dashboard, and the New Relic/Sentry data behind it, to your network and prints a warning |
| `[port]` | Port to listen on; default `3000`. The `PORT` environment variable also works |

Examples:

```bash
performance-dashboard
performance-dashboard 4000 --no-color
performance-dashboard --json
```

JSON output:

```
{"event":"ok","message":"Dashboard is running","url":"http://localhost:3000","port":3000}
```

Errors print what failed and how to fix it. Exit code `2` is bad usage, `1` is a runtime failure:

```
$ performance-dashboard abc
✖ Invalid port "abc".
  → Use a number from 1 to 65535, e.g. performance-dashboard 4000

$ performance-dashboard        # before `npm run build`
✖ No build found.
  → Run `npm run build` first (published packages include it).
```

Human text goes to stdout; errors, warnings and spinners go to stderr. Full spec: [CLI_OUTPUT.md](https://github.com/karan171996/MetricFlow/blob/main/CLI_OUTPUT.md).

## Project structure

```
app/            Next.js App Router: pages (/, /performance, /settings) and api/ route handlers
components/     UI: DashboardCharts, Analytics, PerformanceHub, Settings, sidebar, ui (shadcn)
lib/ hooks/ types/   Data transforms, metric history, shared types
bin/            CLI (cli.mjs) and output formatter (output.mjs)
scripts/        send-test-data.mjs
test/           CLI, hook and package tests (node:test)
cypress/        End-to-end smoke test
docs/images/    README screenshots (not shipped in the npm package)
```

## Tests

```bash
npm run test:cli   # CLI, hook and package tests (node --test)
npm run cy:run     # Cypress smoke test (needs the app running)
npm run lint
```

## Contributing

1. Branch from `main`.
2. Run `npm run lint` and `npm run test:cli` before opening a pull request.
3. Keep CLI output going through `bin/output.mjs` (`out.ok/info/warn/error/kv/spinner`), never `console.log`.
4. This project uses a recent Next.js with breaking changes; read `node_modules/next/dist/docs/` before changing framework code.
