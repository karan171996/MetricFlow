// Placeholders only. Never put a real key in these strings.
export interface SnippetValues {
  accountId?: string | null;
  applicationId?: string | null;
  browserKey?: string | null;
}

/** Real values when the dashboard could read them from New Relic, placeholders otherwise. */
export const browserSnippet = ({ accountId, applicationId, browserKey }: SnippetValues = {}) => `// Step 0 - create the Browser app first: New Relic > Add data > Browser monitoring.
// Without it there is no ingest key and no application ID to copy.
// That page gives you both:
//   ingest key      starts with NRJS-   (NOT your NRAK- User API key from Setup)
//   application ID  a plain number      (NOT your account ID - they look identical)
// Copy the key VALUE, not the ID shown beside it in the key list: an ID is
// accepted by the form but rejected by the beacon, and nothing is logged.
// npm i @newrelic/browser-agent

// .env.local - NEXT_PUBLIC_* values are inlined into your public JavaScript.
// Only the NRJS- ingest key belongs here. An NRAK- User key would be published
// to every visitor as a full-account read/write credential.
// NEXT_PUBLIC_NEWRELIC_BROWSER_KEY=${browserKey ?? 'NRJS-xxxxxxxxxxxxxxxxxxx'}
// NEXT_PUBLIC_NEWRELIC_APP_ID=${applicationId ?? '123456789'}
// NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID=${accountId ?? '1234567'}

// newrelic.ts
import { BrowserAgent } from '@newrelic/browser-agent/loaders/browser-agent';

const licenseKey = process.env.NEXT_PUBLIC_NEWRELIC_BROWSER_KEY!;
const applicationID = process.env.NEXT_PUBLIC_NEWRELIC_APP_ID!;
const accountID = process.env.NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID!;

let agent: BrowserAgent | undefined;

// Never construct at import time: the agent touches window, so a module-level
// \`export const agent = new BrowserAgent(...)\` fails \`next build\` on any
// prerendered route - TypeError: Cannot create property 'NREUM' on boolean 'false'.
export function startAgent() {
  agent ??= new BrowserAgent({
    init: { distributed_tracing: { enabled: true }, privacy: { cookies_enabled: true } },
    info: { beacon: 'bam.nr-data.net', errorBeacon: 'bam.nr-data.net', licenseKey, applicationID, sa: 1 },
    loader_config: { accountID, trustKey: accountID, agentID: applicationID, licenseKey, applicationID },
  });
  return agent;
}

export const getAgent = () => agent;

// app/newrelic-agent.tsx - render <NewRelicAgent /> once in app/layout.tsx.
'use client';
import { useEffect } from 'react';

export function NewRelicAgent() {
  // Dynamic import keeps the agent out of the server bundle entirely.
  useEffect(() => { import('./newrelic').then(m => m.startAgent()); }, []);
  return null;
}
// That alone gives you PageView, load timing, Core Web Vitals and JS errors.`;

export const EMIT_SNIPPET = `// emitMetric.ts - sends a custom event through the New Relic browser agent (no key in your code)
// Needs a recent @newrelic/browser-agent (recordCustomEvent). Using New Relic's copy-paste snippet instead? Call window.newrelic.recordCustomEvent the same way.
import { getAgent } from './newrelic'; // from snippet 1

export function emitMetric(name: string, value: number, attrs: Record<string, string | number | boolean> = {}) {
  // No-op until <NewRelicAgent /> has mounted, so this is safe to call anywhere.
  getAgent()?.recordCustomEvent('MetricFlowEvent', { name, value, page: location.pathname, ...attrs });
}

// emitMetric('checkout_step', 2, { step: 'payment' });`;

export const SENTRY_SNIPPET = `// npm i @sentry/browser
import * as Sentry from '@sentry/browser';

Sentry.init({
  dsn: '<YOUR_SENTRY_DSN>',   // Sentry > Project settings > Client Keys (DSN)
  tracesSampleRate: 0.1,
});`;
