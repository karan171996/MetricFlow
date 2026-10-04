import { basename } from 'node:path';
import { getNewRelicMetrics, discoverPages, type NewRelicPageMetrics } from '@/lib/newrelic';
import { getSentryErrorsByPath, EMPTY_SENTRY_DATA } from '@/lib/sentry';
import { env, isConfigured } from '@/lib/env';
import { recordSnapshot, getHistory } from '@/lib/metricsHistory';
import { recordTiming } from '@/lib/apiTimingStore';
import type { PageStatus } from '@/types';

export async function GET() {
  if (!isConfigured()) {
    return Response.json({ configured: false, project: projectName(), pages: [], history: [], timestamp: new Date().toISOString() });
  }

  try {
    const routeStart = performance.now();

    const trackedPages = await discoverPages(
      env('NEWRELIC_API_KEY'),
      env('NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID')
    );
    if (trackedPages.length === 0) {
      return Response.json({ configured: true, project: projectName(), pages: [], history: getHistory(), timestamp: new Date().toISOString() });
    }

    // New Relic (1 call, 3 queries) and Sentry (1 events call) are independent, so run them concurrently.
    const newRelicStart = performance.now();
    const newRelicPromise = getNewRelicMetrics(
      env('NEWRELIC_API_KEY'),
      env('NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID')
    ).then(result => {
      recordTiming('New Relic: metrics', performance.now() - newRelicStart);
      return result;
    });

    const sentryStart = performance.now();
    const sentryPromise = getSentryErrorsByPath(env('SENTRY_API_KEY'), env('SENTRY_DSN')).then(result => {
      recordTiming('Sentry: events', performance.now() - sentryStart);
      return result;
    });

    const [newRelicByPage, sentryByPath] = await Promise.all([newRelicPromise, sentryPromise]);
    console.log(`[timing] combined New Relic + Sentry batch: ${Math.round(performance.now() - routeStart)}ms`);

    const pages = trackedPages.map(({ name, slug, url, views }) => {
      const newRelic = newRelicByPage[url] ?? EMPTY_NEWRELIC_METRICS;
      const sentry = sentryByPath[url] ?? EMPTY_SENTRY_DATA;

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
    });

    recordSnapshot(pages);

    return Response.json({ configured: true, project: projectName(), pages, history: getHistory(), timestamp: new Date().toISOString() });
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