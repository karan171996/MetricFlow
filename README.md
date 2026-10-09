<div align="center">

# MetricFlow

**See how your site really performs, without leaving your machine.**

Real-user performance from New Relic and errors from Sentry, joined per page,<br>
with AI suggestions on what to fix first.

[![npm](https://img.shields.io/npm/v/@karan171996/metricflow?color=3ee0a1&label=npm)](https://www.npmjs.com/package/@karan171996/metricflow)
[![CI](https://github.com/karan171996/MetricFlow/actions/workflows/ci.yml/badge.svg)](https://github.com/karan171996/MetricFlow/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@karan171996/metricflow?color=3ee0a1)](https://github.com/karan171996/MetricFlow/blob/main/LICENSE)

[Tour](https://github.com/karan171996/MetricFlow/blob/main/docs/tour.md) ·
[Get started](https://github.com/karan171996/MetricFlow/blob/main/docs/getting-started.md) ·
[Send data](https://github.com/karan171996/MetricFlow/blob/main/docs/sending-data.md) ·
[CLI](https://github.com/karan171996/MetricFlow/blob/main/docs/cli.md) ·
[Troubleshooting](https://github.com/karan171996/MetricFlow/blob/main/docs/troubleshooting.md)

![MetricFlow dashboard](https://raw.githubusercontent.com/karan171996/MetricFlow/main/docs/images/dashboard.png)

<sub>Screenshots use sample data, not real New Relic or Sentry numbers.</sub>

</div>

## Quick start

```bash
npx @karan171996/metricflow
```

The dashboard opens on `http://localhost:3000`. Paste your keys on the Setup page and you are done.
There is no MetricFlow server and no account to create: it runs on your machine, with your keys.

## Why MetricFlow

| | | |
| :--- | :--- | :--- |
| 🔒 **Yours, locally**<br>Keys stay in a file on your machine. Nothing is sent to us. | 🧩 **One tool or both**<br>Connect New Relic, Sentry, or both. You only see what is connected. | ⚡ **One call to send data**<br>Add `init()` to your site. No vendor SDK to install or configure. |
| 🎯 **Honest numbers**<br>A value nobody measured is a dash, never a misleading zero. | 🚦 **Your thresholds**<br>Pages are marked Healthy, Warning or Critical by limits you set. | 🤖 **AI suggestions**<br>Optionally ask Gemini, Claude or OpenAI what to fix first. |

## What you get

| Page | What it shows |
| --- | --- |
| **Dashboard** (`/`) | Average page load time, error rate, page views and Apdex; TTFB, LCP and CLS cards with trends; pages with Apdex 0.9 or higher; what moved since the last check; AI suggestions |
| **Performance** (`/performance`) | Every tracked page with its health. Click a row for that page's detail view |
| **New Relic** (`/tools/new-relic`) | New Relic numbers only, per page |
| **Sentry** (`/tools/sentry`) | Error count, latest error and when it was last seen, per page |
| **Settings** (`/settings`) | Warning and critical thresholds used to mark pages Healthy, Warning or Critical |

![Performance hub](https://raw.githubusercontent.com/karan171996/MetricFlow/main/docs/images/performance.png)

## Send data from your site

MetricFlow reads data, so your site has to send it first. That takes one install and one call:

```ts
import { init } from '@karan171996/metricflow/browser';

init({
  sentry: { dsn: 'https://0123456789abcdef0123456789abcdef@o123.ingest.sentry.io/456' },
  'new-relic': { browserKey: 'NRJS-fake0000', applicationId: '123456789', accountId: '1234567' },
});
```

The Connect page in the dashboard gives you this snippet with your own values filled in.
Options, privacy defaults and Content Security Policy hosts are in [Sending data from your site](https://github.com/karan171996/MetricFlow/blob/main/docs/sending-data.md).

## Documentation

| Page | What it covers |
| :--- | :--- |
| [Tour](https://github.com/karan171996/MetricFlow/blob/main/docs/tour.md) | Every screen of the dashboard, with sample data |
| [Getting started](https://github.com/karan171996/MetricFlow/blob/main/docs/getting-started.md) | What you need, the keys to add, and how to check that metrics arrive |
| [Sending data from your site](https://github.com/karan171996/MetricFlow/blob/main/docs/sending-data.md) | The `init` call, its options, what each tool collects, and CSP |
| [Troubleshooting](https://github.com/karan171996/MetricFlow/blob/main/docs/troubleshooting.md) | What to check when the dashboard is empty or a number looks wrong |
| [CLI reference](https://github.com/karan171996/MetricFlow/blob/main/docs/cli.md) | Every option of the `performance-dashboard` command |
| [Configuration](https://github.com/karan171996/MetricFlow/blob/main/docs/configuration.md) | Every environment variable MetricFlow reads |
| [Developing MetricFlow](https://github.com/karan171996/MetricFlow/blob/main/docs/development.md) | Run from source, run the tests, project structure |

## Status

Early and still changing. Bug reports and feedback are welcome in [Issues](https://github.com/karan171996/MetricFlow/issues).

## Contributing

Fork, branch, and open a pull request. The steps, the commit format and the PR checklist are in [CONTRIBUTING.md](https://github.com/karan171996/MetricFlow/blob/main/CONTRIBUTING.md).

## License

[MIT](https://github.com/karan171996/MetricFlow/blob/main/LICENSE)

<div align="center">

Created and maintained by [@karan171996](https://github.com/karan171996)

</div>
