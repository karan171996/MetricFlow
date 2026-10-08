---
title: Troubleshooting
nav_order: 5
---

# Troubleshooting

[MetricFlow on GitHub](https://github.com/karan171996/MetricFlow)

What to check when the dashboard is empty or a number looks wrong.


| You see | What to do |
| --- | --- |
| **Connect your data** after adding keys | If you used `.env.local`, restart the dashboard. Check that all five values are set. |
| A page says **No data yet** | That page has no page views in New Relic in the last 24 hours. Check the Browser agent is on that page, then reload it. |
| **Could not load metrics** | New Relic rejected the request. Check the User API key and account ID on `/setup`, then click **Retry**. |
| Error counts are always 0 | Check the Sentry token scopes (`project:read`, `event:read`) and that the project slug is right. |
| `http://localhost:3000` shows a different app | Another app is using port 3000 over IPv6. Open `http://127.0.0.1:3000` instead, or pick another port: `npx @karan171996/metricflow 4000`. |
| Port already in use | Start on another port: `npx @karan171996/metricflow 4000`. |

---

Next: [CLI reference](cli.md)
