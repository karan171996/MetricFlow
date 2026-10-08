# Sending data from your site

[← Back to the README](https://github.com/karan171996/MetricFlow/blob/main/README.md)

MetricFlow only reads data. Your site sends it with one install and one call, and never installs a New Relic or Sentry package itself.


MetricFlow only reads data. Your website has to send it to New Relic and Sentry first. After saving your keys, click **Next: connect your app** (or open `/connect`). That page gives you one snippet to copy: a single `init` call with a block for each tool you connected, already filled in with the public values the dashboard could read (your Sentry DSN, your New Relic Browser key, application ID and account ID). Anything it could not read is shown as an example marked `replace`.

Add it to your site, deploy or run it, and open a few pages.

## One install, one call

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
- **One audit finding you will see.** `npm audit` reports a moderate advisory, GHSA-px8p-9vwx-vf98, in `fflate`, which comes with New Relic's agent. It does not apply here: the affected function, `unzipSync`, is never called. The agent uses `fflate` only inside its session-replay feature, which MetricFlow's build leaves out. It clears when New Relic ships `fflate` 0.8.3 or later.
- **Bundler needed.** The entry is ESM only and uses `import()`, which webpack, Turbopack, Vite and Rollup split into separate files: a site that never calls `init` downloads no vendor code, and a New Relic-only site never downloads Sentry.

---

Next: [Troubleshooting](troubleshooting.md)
