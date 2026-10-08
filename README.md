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

Two more values are needed only to send data *from* your site (the snippets on `/connect`):

| Value | Where to find it |
| --- | --- |
| New Relic **Ingest - Browser key** | New Relic → **Add data → Browser monitoring** (create the Browser app first). Starts with `NRJS-`. Not the `NRAK-` User key — this one is public in your page's JavaScript. |
| New Relic **application ID** | Shown on the same Browser monitoring page. A plain number, and **not** your account ID. |

Save them in one of two ways:

- **On the Setup page.** Click **Set up keys** on the dashboard (or open `/setup`), paste the values and save. MetricFlow checks each key with New Relic and Sentry before saving it.
- **In a `.env.local` file** in the folder where you run the command:

  ```bash
  NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID=1234567
  NEWRELIC_API_KEY=NRAK-...
  SENTRY_API_KEY=sntrys_...
  SENTRY_DSN=https://<key>@o123.ingest.sentry.io/456
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

#### One import instead of the vendor snippets

Your site does not have to install `@sentry/browser` or `@newrelic/browser-agent`. MetricFlow ships both and loads each one only when you ask for it:

```bash
npm i @karan171996/metricflow
```

```ts
// instrumentation-client.ts  (Next.js 15.3 or newer; in any other app, a file that runs only in the browser)
import { init } from '@karan171996/metricflow/browser';

init({
  sentry: { dsn: 'https://0123456789abcdef0123456789abcdef@o123.ingest.sentry.io/456' },
  'new-relic': { browserKey: 'NRJS-fake0000', applicationId: '123456789', accountId: '1234567' },
});
```

Name only the tools you use. Call `init` once. It never throws, and it does nothing during server rendering or a build.

| Option | Value |
|---|---|
| `sentry.dsn` | Sentry > Project settings > Client Keys (DSN) |
| `sentry.tracesSampleRate` | Optional, 0 to 1. Default: `1` on `localhost` and `127.0.0.1`, `0.1` everywhere else |
| `'new-relic'.browserKey` | The **Ingest - Browser** key. It starts with `NRJS-` |
| `'new-relic'.applicationId` | The Browser app's application ID (a number, as a string) |
| `'new-relic'.accountId` | Your account ID (a number, as a string) |
| `'new-relic'.region` | Optional: `'us'` (default) or `'eu'` |

To record your own numbers (New Relic only): `import { send } from '@karan171996/metricflow/browser'; send('checkout_step', 2, { step: 'payment' });`. Before `init`, `send` does nothing.

Things to know:

- **Public identifiers only.** Everything you pass to `init` is published in your site's JavaScript. If `init` sees a secret (a New Relic `NRAK-` User key or any other non-browser New Relic key, a Sentry auth token, a legacy DSN with a secret in it), it starts nothing and prints one console warning. That key has already been published: revoke it and create a new one.
- **One bad value starts no tool.** The console warning names the tool and the reason, never the value.
- **You already run Sentry or New Relic.** MetricFlow leaves it alone and says so once in the console. For Sentry, call MetricFlow's `init` after your own Sentry has started; if yours starts later, MetricFlow cannot see it and the page reports twice.
- **Content Security Policy.** Add these hosts to `connect-src`: the host in your Sentry DSN (for example `o123.ingest.sentry.io`), and `bam.nr-data.net` for New Relic (`bam.eu01.nr-data.net` for an EU account). The vendor code itself is bundled with your site, so `script-src` needs nothing new.
- **Page names are real paths.** Sentry page loads are named by `location.pathname` (`/orders/8841`, not `/orders/[id]`), so the dashboard can match them. Any ID or token that sits in a path is sent to Sentry.
- **Privacy defaults, and what is still sent.** MetricFlow turns off what the dashboard does not read, but both tools still collect data about your visitors. Check it against your own privacy notice.
  - **Sentry sends:** JavaScript errors with stack traces; breadcrumbs leading up to an error (console output, the selector of clicked elements, fetch/XHR URLs, page navigations); the page URL, referrer and user agent; the browser's language and time zone; one session record per page load; and performance spans for page loads, in-app navigations, web vitals, fetch/XHR requests and loaded resources. It adds `sentry-trace` and `baggage` headers to requests to your own origin. **Off:** `sendDefaultPii` is `false`, and session replay, the feedback widget and profiling are not included.
  - **New Relic sends:** page views with the page URL (query string and hash removed); load timing and web vitals, with the selector of the element behind LCP and INP; JavaScript errors with stack traces; and for each fetch/XHR request the host, path, method, status, size and timing (no bodies, no headers, no query strings). **Off:** cookies and session storage, session replay and session trace (not included at all), click/keyboard "user action" events, Content-Security-Policy violation events, and tracing headers on your requests.
- **Bundler needed.** The entry is ESM only and uses `import()`, which webpack, Turbopack, Vite and Rollup split into separate files: a site that never calls `init` downloads no vendor code, and a New Relic-only site never downloads Sentry.

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
| `--no-open` | Start the server without opening a browser |
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
| `SENTRY_API_KEY`, `SENTRY_DSN` | Read errors from Sentry (required). The DSN gives the project and region; the org is looked up with the token |
| `GEMINI_API_KEY`, `CLAUDE_API_KEY`, `OPENAI_API_KEY` | AI suggestions (optional, any one) |
| `AI_PROVIDER` | `gemini`, `claude` or `openai`; picks the AI key when several are set |
| `NEWRELIC_INSERT_KEY` | Only for **Send test event** on `/connect` and `pnpm send-test-data` |
| `SENTRY_DSN` | Only for `pnpm send-test-data` |
| `METRICFLOW_PROJECT_NAME` | Overrides the project name in the header |

## Develop from source

```bash
git clone https://github.com/karan171996/MetricFlow.git
cd MetricFlow
pnpm install
cp .env.local.example .env.local   # then fill in your keys
pnpm dev                           # http://127.0.0.1:3000
```

This repo uses [pnpm](https://pnpm.io) (`corepack enable` picks the pinned version). Install scripts are allowed only for the packages listed in `pnpm-workspace.yaml` (Cypress and `unrs-resolver`).

Run the production build through the CLI:

```bash
pnpm build
node bin/cli.mjs
```

### Tests

```bash
pnpm test              # all tests, fake keys, no network
pnpm test:cli          # node:test suite only
pnpm test:real         # against your real accounts (.env.local)
pnpm cy:run            # Cypress tests (app must be running)
pnpm lint
pnpm send-test-data    # one dummy event to Sentry and New Relic
```

`pnpm test` uses fake keys from `.env.test.example` and never reads `.env.local`. `pnpm test:real` reads `.env.local` and never prints the keys. `send-test-data` needs `SENTRY_DSN` and `NEWRELIC_INSERT_KEY`.

### Project structure

```
app/            Next.js App Router: pages and api/ route handlers
components/     UI, one folder per feature; ui/ is generated shadcn code
lib/            Data fetching (New Relic, Sentry), transforms, hooks
browser/        What a consumer site imports (init, send). Sealed: imports nothing from lib/
bin/            CLI (cli.mjs) and output formatter (output.mjs)
scripts/        send-test-data.mjs, test-env.mjs
test/           node:test suites
cypress/        End-to-end smoke test
docs/images/    README screenshots (not shipped in the npm package)
```

## Contributing

Nobody pushes straight to `main`: fork, branch, and open a pull request. Commit messages and PR titles use the `type(scope): description` format, for example `fix(api): handle an empty New Relic response` or `feat(ui): add a Sentry page`. Types are `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore` and `revert`.

Full steps, the commit format and the PR checklist are in [CONTRIBUTING.md](CONTRIBUTING.md).
