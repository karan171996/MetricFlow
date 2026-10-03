# MetricFlow — Performance Dashboard

MetricFlow is a local dashboard for your website. It reads real-user performance metrics from **New Relic** and JavaScript errors from **Sentry**, joins them per page, and can ask an AI model (Gemini, Claude or OpenAI) what to fix first.

It runs on your own machine with your own keys. There is no MetricFlow server and no account to create.

```bash
npx @karan171996/metricflow
```

> **Status: early, work in progress (v0.1.5).** Things will change. Bug reports and feedback are welcome in [Issues](https://github.com/karan171996/MetricFlow/issues).

![Dashboard](https://raw.githubusercontent.com/karan171996/MetricFlow/main/docs/images/dashboard.png)

_Screenshots use sample data, not real New Relic or Sentry numbers._

## What you need

| | Required? | Why |
| --- | --- | --- |
| Node.js `>=20.12` | Yes | Runs the dashboard |
| A New Relic account, with the **Browser agent** on your site | Yes | Page views, load time, Core Web Vitals, Apdex |
| A Sentry project | Yes | Error counts and latest errors per page |
| A Gemini, Claude or OpenAI API key | No | AI suggestions on the dashboard |

New Relic and Sentry both have free plans, which are enough to try MetricFlow.

## Get started in 4 steps

### 1. Start the dashboard

From any folder (usually your website's project folder):

```bash
npx @karan171996/metricflow
```

```
✔ Dashboard is running
  URL   http://localhost:3000
  Stop  Ctrl+C
```

Your browser opens the dashboard. The first time, it shows **Connect your data**, because no keys are set yet.

To install it in a project instead of using `npx` each time:

```bash
npm install --save-dev @karan171996/metricflow
npx performance-dashboard
```

The dashboard header shows the `name` from that project's `package.json`.

### 2. Add your keys

You need five values. Where to find each one:

| Value | Where to find it |
| --- | --- |
| New Relic **User API key** | New Relic → API keys → create key, type **User**. Starts with `NRAK-`. |
| New Relic **account ID** | A plain number, shown next to your keys in New Relic. |
| Sentry **auth token** | Sentry → Settings → Auth Tokens. Scopes: `project:read`, `event:read`. |
| Sentry **organization slug** | The name in your Sentry URL: `sentry.io/organizations/<slug>/`. |
| Sentry **project slug** | Sentry → Project settings. |

Save them in one of two ways:

- **On the Setup page.** Click **Set up keys** on the dashboard (or open `/setup`), paste the values and save. MetricFlow checks each key with New Relic and Sentry before saving it.
- **In a `.env.local` file** in the folder where you run the command:

  ```bash
  NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID=1234567
  NEWRELIC_API_KEY=NRAK-...
  SENTRY_API_KEY=sntrys_...
  SENTRY_ORG_SLUG=your-org
  SENTRY_PROJECT_ID=your-project
  ```

  Restart the dashboard after editing the file.

> **Using `npx`?** Keys saved on the Setup page are stored inside the downloaded package folder, so they can disappear when npm clears its cache or you update MetricFlow. For keys that stay put, use `.env.local` in your project folder. Add `.env.local` to your `.gitignore` so the keys are never committed.

**Optional AI suggestions:** on the Setup page, add a Gemini, Claude or OpenAI key, or set one in `.env.local` (`GEMINI_API_KEY`, `CLAUDE_API_KEY` or `OPENAI_API_KEY`). If you set more than one, `AI_PROVIDER=gemini|claude|openai` picks which one is used.

### 3. Send data from your site

MetricFlow only reads data. Your website has to send it to New Relic and Sentry first. After saving your keys, click **Next: connect your app** (or open `/connect`). That page gives you copy-paste snippets:

1. **New Relic Browser agent**: records page views, load timing and Core Web Vitals.
2. **`emitMetric()` helper** (optional): sends your own numbers through the Browser agent.
3. **Sentry**: sends JavaScript errors. Use your project's DSN.

Add them to your site, deploy or run it, and open a few pages.

### 4. Check that metrics arrive

On `/connect`, the **Events received** panel shows a row for each source:

- **Browser agent (page views)**
- **Custom events (emitMetric / test event)**
- **Sentry errors**

Reload a few pages of your site and watch the rows turn green. New Relic can take a minute or two to show new data.

To test without touching your site, add a New Relic **Ingest - License** key on `/connect` and click **Send test event**. This key is only used for the test button and is different from the User key.

Then open the dashboard (`/`). Your top 20 pages (by page views, last 24 hours) appear automatically. The dashboard refreshes every 30 seconds.

## What you'll see

| Page | What it shows |
| --- | --- |
| **Dashboard** (`/`) | Average response time, error rate, throughput and Apdex; TTFB, LCP and CLS cards with trends; pages passing Core Web Vitals; what moved since the last check; AI suggestions |
| **Performance** (`/performance`) | Every tracked page with its health. Click a row for that page's detail view |
| **New Relic** (`/tools/new-relic`) | New Relic numbers only, per page |
| **Sentry** (`/tools/sentry`) | Error count, latest error and when it was last seen, per page |
| **Settings** (`/settings`) | Warning and critical thresholds used to mark pages Healthy, Warning or Critical |

![Performance hub](https://raw.githubusercontent.com/karan171996/MetricFlow/main/docs/images/performance.png)

## Troubleshooting

| You see | What to do |
| --- | --- |
| **Connect your data** after adding keys | If you used `.env.local`, restart the dashboard. Check that all five values are set. |
| A page says **No data yet** | That page has no page views in New Relic in the last 24 hours. Check the Browser agent is on that page, then reload it. |
| **Could not load metrics** | New Relic rejected the request. Check the User API key and account ID on `/setup`, then click **Retry**. |
| Error counts are always 0 | Check the Sentry token scopes (`project:read`, `event:read`) and that the project slug is right. |
| `http://localhost:3000` shows a different app | Another app is using port 3000 over IPv6. Open `http://127.0.0.1:3000` instead, or pick another port: `npx @karan171996/metricflow 4000`. |
| Port already in use | Start on another port: `npx @karan171996/metricflow 4000`. |

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

The CLI loads `.env.local` and `.env` from the folder you run it in. Set `METRICFLOW_PROJECT_NAME` to change the name shown in the dashboard header.

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
```

Human text goes to stdout; errors, warnings and spinners go to stderr. Full spec: [CLI_OUTPUT.md](https://github.com/karan171996/MetricFlow/blob/main/CLI_OUTPUT.md).

## All environment variables

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID`, `NEWRELIC_API_KEY` | Read metrics from New Relic (required) |
| `SENTRY_API_KEY`, `SENTRY_ORG_SLUG`, `SENTRY_PROJECT_ID` | Read errors from Sentry (required) |
| `GEMINI_API_KEY`, `CLAUDE_API_KEY`, `OPENAI_API_KEY` | AI suggestions (optional, any one) |
| `AI_PROVIDER` | `gemini`, `claude` or `openai`; picks the AI key when several are set |
| `NEWRELIC_INSERT_KEY` | Only for **Send test event** on `/connect` and `npm run send-test-data` |
| `SENTRY_DSN` | Only for `npm run send-test-data` |
| `METRICFLOW_PROJECT_NAME` | Overrides the project name in the header |

## Develop from source

```bash
git clone https://github.com/karan171996/MetricFlow.git
cd MetricFlow
npm install
cp .env.local.example .env.local   # then fill in your keys
npm run dev                        # http://127.0.0.1:3000
```

Run the production build through the CLI:

```bash
npm run build
node bin/cli.mjs
```

### Tests

```bash
npm test               # all tests, fake keys, no network
npm run test:cli       # node:test suite only
npm run test:real      # against your real accounts (.env.local)
npm run cy:run         # Cypress tests (app must be running)
npm run lint
npm run send-test-data # one dummy event to Sentry and New Relic
```

`npm test` uses fake keys from `.env.test.example` and never reads `.env.local`. `npm run test:real` reads `.env.local` and never prints the keys. `send-test-data` needs `SENTRY_DSN` and `NEWRELIC_INSERT_KEY`.

### Project structure

```
app/            Next.js App Router: pages and api/ route handlers
components/     UI, one folder per feature; ui/ is generated shadcn code
lib/            Data fetching (New Relic, Sentry), transforms, hooks
bin/            CLI (cli.mjs) and output formatter (output.mjs)
scripts/        send-test-data.mjs, test-env.mjs
test/           node:test suites
cypress/        End-to-end smoke test
docs/images/    README screenshots (not shipped in the npm package)
```

## Contributing

1. Fork the repo and branch from `main`.
2. Run `npm run lint` and `npm test` before opening a pull request.
3. Keep CLI output going through `bin/output.mjs` (`out.ok/info/warn/error/kv/spinner`), never `console.log`.
4. This project uses a recent Next.js with breaking changes; read `node_modules/next/dist/docs/` before changing framework code.
