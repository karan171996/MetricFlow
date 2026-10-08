---
title: Configuration
nav_order: 6
---

# Configuration

[MetricFlow on GitHub](https://github.com/karan171996/MetricFlow)

Every environment variable MetricFlow reads.


| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID`, `NEWRELIC_API_KEY` | Read metrics from New Relic (required) |
| `SENTRY_API_KEY`, `SENTRY_DSN` | Read errors from Sentry (required). The DSN gives the project and region; the org is looked up with the token |
| `GEMINI_API_KEY`, `CLAUDE_API_KEY`, `OPENAI_API_KEY` | AI suggestions (optional, any one) |
| `AI_PROVIDER` | `gemini`, `claude` or `openai`; picks the AI key when several are set |
| `NEWRELIC_INSERT_KEY` | Only for **Send test event** on `/connect` and `pnpm send-test-data` |
| `SENTRY_DSN` | Only for `pnpm send-test-data` |
| `METRICFLOW_PROJECT_NAME` | Overrides the project name in the header |

---

Next: [Developing MetricFlow](development.md)
