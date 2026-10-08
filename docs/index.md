---
title: Home
nav_order: 1
permalink: /
---

# MetricFlow
{: .fs-9 }

See how your site really performs, without leaving your machine.
{: .fs-6 .fw-300 }

[Get started](getting-started.md){: .btn .btn-primary .fs-5 .mb-4 .mb-md-0 .mr-2 }
[View on GitHub](https://github.com/karan171996/MetricFlow){: .btn .fs-5 .mb-4 .mb-md-0 }

---

![MetricFlow dashboard](https://raw.githubusercontent.com/karan171996/MetricFlow/main/docs/images/dashboard.png)

Screenshots use sample data, not real New Relic or Sentry numbers.
{: .fs-2 .text-grey-dk-000 }

MetricFlow is a local dashboard for your website. It reads real-user performance from New Relic and errors from Sentry, joins them per page, and can ask an AI model what to fix first. It runs on your machine with your keys: there is no MetricFlow server and no account to create.

## Quick start

```bash
npx @karan171996/metricflow
```

The dashboard opens on `http://localhost:3000`. Paste your keys on the Setup page and you are done.

## Why MetricFlow

| | |
| :--- | :--- |
| **Yours, locally** | Keys stay in a file on your machine. Nothing is sent to us. |
| **One tool or both** | Connect New Relic, Sentry, or both. You only see what is connected. |
| **One call to send data** | Add `init()` to your site. No vendor SDK to install or configure. |
| **Honest numbers** | A value nobody measured is a dash, never a misleading zero. |
| **Your thresholds** | Pages are marked Healthy, Warning or Critical by limits you set. |
| **AI suggestions** | Optionally ask Gemini, Claude or OpenAI what to fix first. |

## Where to go next

| Page | What it covers |
| :--- | :--- |
| [Getting started](getting-started.md) | What you need, the keys to add, and how to check that metrics arrive |
| [Sending data from your site](sending-data.md) | The `init` call, its options, what each tool collects, and CSP |
| [Troubleshooting](troubleshooting.md) | What to check when the dashboard is empty or a number looks wrong |
| [CLI reference](cli.md) | Every option of the `performance-dashboard` command |
| [Configuration](configuration.md) | Every environment variable MetricFlow reads |
| [Developing MetricFlow](development.md) | Run from source, run the tests, project structure |
