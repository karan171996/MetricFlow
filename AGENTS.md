<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Data & API reference

Full design doc: https://claude.ai/artifact/RNaAKiRYZDpKATAtxz4Xxh

This app is Next.js App Router (`app/`), not the separate Express backend the doc sketches — any API work here belongs in `app/api/*` route handlers, not a `backend/` folder. The parts worth keeping as a reference:

- **Data sources**: New Relic (perf metrics) + Sentry (errors), summarized by Claude for insights/alerts.
- **Metrics shape**: `{ pageId, pageName, pageUrl, newRelic: { loadTime, lcp, ttfb, fid, errorRate, throughput, apdexScore }, sentry: { errorCount, errorRate, warningCount, latestErrors }, recordedAt }`.
- **Alert shape**: `{ id, severity: "high"|"medium"|"low", type, page, message, metric, currentValue, threshold, aiInsight, createdAt, status: "active"|"resolved" }`.
- **Intended endpoints**: `GET /api/metrics` (pull New Relic + Sentry), `POST /api/analyze` (send metrics to Claude, get back analysis/alerts/recommendations), `GET /api/health`.
