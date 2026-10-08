# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Frontend engineers on a product team. They open MetricFlow while developing or before a release to check the health of the pages they own and decide what to fix first. They already have New Relic and Sentry on the site; they are not necessarily observability experts.

## Product Purpose

MetricFlow is a local dashboard for one website. It reads real-user performance metrics from New Relic and JavaScript errors from Sentry, joins them per page, and can ask an AI model (Gemini, Claude or OpenAI) what to fix first. Success is an engineer leaving with a short, trustworthy answer to "which page is in trouble and what do I do about it".

## Positioning

- **Local, no account.** Runs on the user's machine with their own keys. There is no MetricFlow server and nothing to sign up for.
- **Per-page join.** New Relic performance and Sentry errors for the same page sit in one view.
- **AI "fix first" advice.** The metrics become a prioritised list of what to fix. The AI key is optional.
- **One-command start.** `npx @karan171996/metricflow` goes from nothing to a running dashboard.

## Operating Context

- Started from a terminal, usually in the website's project folder; opens at `http://localhost:3000`.
- First run shows **Connect your data** until keys are set. Keys go in through `/setup` and are stored in `.env.local`.
- `/connect` shows the single `init` snippet that sends data from the user's site.
- The header shows the `name` from the host project's `package.json`.
- Routes: `/` (dashboard), `/performance` and `/performance/[slug]` (per-page), `/connect`, `/setup`, `/settings`, `/tools/[tool]`.

## Capabilities and Constraints

- Needs Node.js `>=20.12`, a New Relic account with the Browser agent, and a Sentry project. New Relic and Sentry are required; the AI key is not.
- Metrics per page: load time, LCP, TTFB, FID, error rate, throughput, Apdex (New Relic); error count, error rate, warning count, latest errors (Sentry).
- Alerts carry a severity (`high`, `medium`, `low`), the metric, its current value and threshold, and an AI insight.
- Built on Next.js App Router; API work lives in `app/api/*` route handlers.
- Early work in progress, published as an npm package. Things will change.

## Brand Commitments

- Name: **MetricFlow**.

## Evidence on Hand

- README screenshots (`docs/images/`) use sample data and say so.
- No testimonials, customer names, benchmarks or pricing exist. Do not invent any.

## Product Principles

1. **Never fake data.** No invented metrics, testimonials or benchmarks. Sample data is always labelled as sample.
2. **The page is the unit.** Performance and errors are shown together for a page, not as separate tool views.
3. **Answer "what first".** Every view should help the engineer rank problems, not just list numbers.
4. **Stay local.** Nothing may imply or require a MetricFlow account, server or upload of the user's keys.
5. **Work without AI.** The dashboard is complete without an AI key; AI advice is an addition.
