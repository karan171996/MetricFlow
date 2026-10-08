import { basename } from 'node:path';
import { discoverPages } from '@/lib/newrelic';
import { NewRelicAnalytics, type NewRelicPageMetrics } from '@/lib/analytics/NewRelicAnalytics';
import { SentryAnalytics, type SentryPageErrors } from '@/lib/analytics/SentryAnalytics';
import { connectedTools, env } from '@/lib/env';
import { recordSnapshot, getHistory } from '@/lib/metricsHistory';
import { toNeutralPages } from '@/lib/legacyMetrics';
import { sourcesFor } from '@/lib/tools';
import { recordTiming } from '@/lib/apiTimingStore';
import type { PageStatus } from '@/types';

export async function GET() {
  const tools = connectedTools();
  // Which tool supplies each capability. Decided by what is connected, not by what loaded.
  const sources = sourcesFor(tools);
  if (!tools.length) {
    return Response.json({ configured: false, tools, sources, project: projectName(), pages: [], history: [], timestamp: new Date().toISOString() });
  }
  // The page list comes from New Relic, so without it there is nothing to list yet (a Sentry-only page list is a later change).
  if (!tools.includes('new-relic')) {
    return Response.json({ configured: true, tools, sources, project: projectName(), pages: [], history: [], timestamp: new Date().toISOString() });
  }

  try {
    const routeStart = performance.now();

    const trackedPages = await discoverPages(
      env('NEWRELIC_API_KEY'),
      env('NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID')
    );
    if (trackedPages.length === 0) {
      return Response.json({ configured: true, tools, sources, project: projectName(), pages: [], history: getHistory(), timestamp: new Date().toISOString() });
    }

    // New Relic (1 call, 3 queries) and Sentry (1 events call) are independent, so run them concurrently.
    const newRelicStart = performance.now();
    const newRelicPromise = new NewRelicAnalytics(
      env('NEWRELIC_API_KEY'),
      env('NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID')
    ).byPath().then(result => {
      recordTiming('New Relic: metrics', performance.now() - newRelicStart);
      return result;
    });

    // Sentry is only called when connected. If it fails, New Relic data still shows and `failed` names it.
    const sentryStart = performance.now();
    const sentryPromise = tools.includes('sentry')
      ? new SentryAnalytics(env('SENTRY_API_KEY'), env('SENTRY_DSN')).byPath().then(result => {
          recordTiming('Sentry: events', performance.now() - sentryStart);
          return result;
        })
      : Promise.resolve(null);

    const [newRelicByPage, sentrySettled] = await Promise.all([newRelicPromise, sentryPromise.catch(() => undefined)]);
    const failed = sentrySettled === undefined ? ['sentry'] : [];
    const sentryByPath = sentrySettled ?? {};
    console.log(`[timing] combined New Relic + Sentry batch: ${Math.round(performance.now() - routeStart)}ms`);

    // The fetching above and the deprecated fields below are as before; `metrics` and `byTool` are added from them.
    const pages = toNeutralPages(trackedPages.map(({ name, slug, url, views }) => {
      const newRelic = newRelicByPage[url] ?? EMPTY_NEWRELIC_METRICS;
      const sentry = tools.includes('sentry') && !failed.length ? (sentryByPath[url] ?? EMPTY_SENTRY_DATA) : undefined;

      return {
        name,
        slug,
        url,
        visitors: formatVisitors(views),
        status: deriveStatus(newRelic),
        newRelic,
        sentry,
        recordedAt: new Date().toISOString()
      };
    }), sources, failed);

    recordSnapshot(pages, sources);

    return Response.json({ configured: true, tools, failed, sources, project: projectName(), pages, history: getHistory(), timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Metrics API error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

const EMPTY_NEWRELIC_METRICS: NewRelicPageMetrics = {
  loadTime: 0,
  lcp: 0,
  ttfb: 0,
  cls: 0,
  inp: 0,
  fid: 0,
  errorRate: 0,
  throughput: 0,
  apdexScore: 0
};

const EMPTY_SENTRY_DATA: SentryPageErrors = {
  errorCount: 0,
  errorRate: 0,
  warningCount: 0,
  latestErrors: []
};

function deriveStatus(newRelic: NewRelicPageMetrics): PageStatus {
  if (newRelic.errorRate > 5) return 'Critical';
  if (newRelic.errorRate > 1 || newRelic.apdexScore < 0.9) return 'Warning';
  return 'Healthy';
}

/** Header title: the host project's package.json name, passed in by bin/cli.mjs. Under `next dev` it is this folder's name. */
function projectName(): string {
  return env('METRICFLOW_PROJECT_NAME') || basename(process.cwd());
}

function formatVisitors(throughput: number): string {
  if (throughput >= 1000) return `${(throughput / 1000).toFixed(1)}k`;
  return String(throughput);
}