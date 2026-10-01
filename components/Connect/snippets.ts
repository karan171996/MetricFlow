// Placeholders only. Never put a real key in these strings.
export const BROWSER_SNIPPET = `// npm i @newrelic/browser-agent   (or paste the snippet from New Relic: Add data > Browser monitoring)
import { BrowserAgent } from '@newrelic/browser-agent/loaders/browser-agent';

const opts = {
  init: { distributed_tracing: { enabled: true }, privacy: { cookies_enabled: true } },
  info: { beacon: 'bam.nr-data.net', errorBeacon: 'bam.nr-data.net', licenseKey: '<INGEST_BROWSER_KEY>', applicationID: '<APP_ID>', sa: 1 },
  loader_config: { accountID: '<ACCOUNT_ID>', trustKey: '<ACCOUNT_ID>', agentID: '<APP_ID>', licenseKey: '<INGEST_BROWSER_KEY>', applicationID: '<APP_ID>' },
};
export const agent = new BrowserAgent(opts); // gives you PageView, load timing, Core Web Vitals and JS errors with no more code`;

export const EMIT_SNIPPET = `// emitMetric.ts - sends a custom event through the New Relic browser agent (no key in your code)
// Needs a recent @newrelic/browser-agent (recordCustomEvent). Using New Relic's copy-paste snippet instead? Call window.newrelic.recordCustomEvent the same way.
import { agent } from './newrelic'; // the file where you ran: export const agent = new BrowserAgent(opts)

export function emitMetric(name: string, value: number, attrs: Record<string, string | number | boolean> = {}) {
  agent.recordCustomEvent('MetricFlowEvent', { name, value, page: location.pathname, ...attrs });
}

// emitMetric('checkout_step', 2, { step: 'payment' });`;

export const SENTRY_SNIPPET = `// npm i @sentry/browser
import * as Sentry from '@sentry/browser';

Sentry.init({
  dsn: '<YOUR_SENTRY_DSN>',   // Sentry > Project settings > Client Keys (DSN)
  tracesSampleRate: 0.1,
});`;
