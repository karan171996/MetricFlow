---
title: Getting started
nav_order: 2
---

# Getting started

[MetricFlow on GitHub](https://github.com/karan171996/MetricFlow)

From nothing to real numbers on the dashboard, in four steps.

## What you need

| | Required? | Why |
| --- | --- | --- |
| Node.js `>=20.12` | Yes | Runs the dashboard |
| A New Relic account, with the **Browser agent** on your site | Yes | Page views, load time, Core Web Vitals, Apdex |
| A Sentry project | Yes | Error counts and latest errors per page |
| A Gemini, Claude or OpenAI API key | No | AI suggestions on the dashboard |

New Relic and Sentry both have free plans, which are enough to try MetricFlow.


## 1. Start the dashboard

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

## 2. Add your keys

You need five values. Where to find each one:

| Value | Where to find it |
| --- | --- |
| New Relic **User API key** | New Relic → API keys → create key, type **User**. Starts with `NRAK-`. |
| New Relic **account ID** | A plain number, shown next to your keys in New Relic. |
| Sentry **auth token** | Sentry → Settings → Auth Tokens. Scopes: `project:read`, `event:read`. |
| Sentry **organization slug** | The name in your Sentry URL: `sentry.io/organizations/<slug>/`. |
| Sentry **project slug** | Sentry → Project settings. |

Two more values are needed only to send data *from* your site (the `init` call shown on `/connect`, which fills them in when it can read them):

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

## 3. Send data from your site

MetricFlow only reads data, so your site has to send it first. That is one install and one `init` call, covered in [Sending data from your site](sending-data.md).

## 4. Check that metrics arrive

On `/connect`, the **Events received** panel shows a row for each source:

- **Browser agent (page views)**
- **Custom events (send / test event)**
- **Sentry errors**

Reload a few pages of your site and watch the rows turn green. New Relic can take a minute or two to show new data.

To test without touching your site, add a New Relic **Ingest - License** key on `/connect` and click **Send test event**. This key is only used for the test button and is different from the User key.

Then open the dashboard (`/`). Your top 20 pages (by page views, last 24 hours) appear automatically. The dashboard refreshes every 30 seconds.

---

Next: [Sending data from your site](sending-data.md)
