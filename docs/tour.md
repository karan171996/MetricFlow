---
title: Tour
nav_order: 2
---

# A tour of MetricFlow

[MetricFlow on GitHub](https://github.com/karan171996/MetricFlow)

Every screen, in the order you would meet it. The pictures are captured from the real app by its own test suite, fed with made-up data for a fictional site called "acme-storefront". No real New Relic or Sentry numbers appear in them.

## Dashboard

The home screen: response time, error rate, throughput and Apdex, the web-vitals cards with their trends, what moved since the last check, and AI suggestions.

![Dashboard](https://raw.githubusercontent.com/karan171996/MetricFlow/main/docs/images/dashboard.png)

## Performance

Every tracked page with its health. A page is Healthy, Warning or Critical by the thresholds you set in Settings.

![Performance](https://raw.githubusercontent.com/karan171996/MetricFlow/main/docs/images/performance.png)

## Page detail

Click a row to see one page: its load time, error rate and traffic, and the errors Sentry reported on it.

![Page detail](https://raw.githubusercontent.com/karan171996/MetricFlow/main/docs/images/tour-page-detail.png)

## New Relic tab

New Relic's own numbers per page: load time, LCP, TTFB, CLS, INP, error rate, throughput and Apdex.

![New Relic tab](https://raw.githubusercontent.com/karan171996/MetricFlow/main/docs/images/tour-new-relic.png)

## Sentry tab

Sentry's own numbers per page: errors with the latest one, and page loads and web vitals from tracing.

![Sentry tab](https://raw.githubusercontent.com/karan171996/MetricFlow/main/docs/images/tour-sentry.png)

## With only Sentry connected

You do not need both tools. With only Sentry, the pages, a sampled page-load count and the errors come from Sentry. Nothing New Relic-only is shown, and a sampled count is always labelled as sampled.

![With only Sentry connected](https://raw.githubusercontent.com/karan171996/MetricFlow/main/docs/images/tour-sentry-only.png)

## Connect

The one call to add to your site, already filled in with your public values, and a live check of each link from your site to the dashboard.

![Connect](https://raw.githubusercontent.com/karan171996/MetricFlow/main/docs/images/tour-connect.png)

## Setup

Add keys for the tools you use. They are checked once, saved to a file on your machine, and never shown again.

![Setup](https://raw.githubusercontent.com/karan171996/MetricFlow/main/docs/images/tour-setup.png)

---

Next: [Getting started](getting-started.md)
