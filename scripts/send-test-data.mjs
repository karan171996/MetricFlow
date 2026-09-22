// Dummy script: sends one test event to Sentry and one to New Relic so you
// can confirm data actually shows up in both dashboards during local dev.
// Run with: npm run send-test-data

import { config } from 'dotenv';
config({ path: '.env.local' });
import * as Sentry from '@sentry/node';
import axios from 'axios';

async function sendToSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.log('Skipping Sentry: SENTRY_DSN not set in .env.local');
    return;
  }

  Sentry.init({ dsn });
  const eventId = Sentry.captureException(new Error('Dummy test error from performance-dashboard'), {
    tags: { url: '/pricing' }
  });
  const flushed = await Sentry.flush(2000);
  console.log(`Sentry: flushed=${flushed} eventId=${eventId}`);
  console.log(`Sentry: check https://sentry.io/organizations/${process.env.SENTRY_ORG_SLUG}/issues/?query=${encodeURIComponent(eventId)}`);
}

async function sendToNewRelic() {
  const insertKey = process.env.NEWRELIC_INSERT_KEY;
  const accountId = process.env.NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID;
  if (!insertKey || !accountId) {
    console.log('Skipping New Relic: NEWRELIC_INSERT_KEY or NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID not set in .env.local');
    return;
  }

  const res = await axios.post(
    `https://insights-collector.newrelic.com/v1/accounts/${accountId}/events`,
    [
      {
        eventType: 'PageMetrics',
        page: '/pricing',
        loadTime: 845,
        lcp: 800,
        ttfb: 100,
        fid: 50,
        errorRate: 0.12,
        throughput: 1000,
        apdexScore: 0.95
      }
    ],
    {
      headers: {
        'Api-Key': insertKey,
        'Content-Type': 'application/json'
      }
    }
  );
  console.log(`New Relic: status=${res.status} body=${JSON.stringify(res.data)}`);
  console.log(`New Relic: check NRQL "SELECT * FROM PageMetrics SINCE 10 minutes ago" for account ${accountId}`);
}

await sendToSentry();
await sendToNewRelic();
