import { getNewRelicMetrics, NewRelicPageMetrics } from '@/lib/newrelic';
import { getSentryErrors } from '@/lib/sentry';
import { mockMetrics } from '@/lib/mockData';
import { TRACKED_PAGES } from '@/lib/trackedPages';
import { recordSnapshot, getHistory } from '@/lib/metricsHistory';
import { recordTiming } from '@/lib/apiTimingStore';
import type { PageStatus } from '@/types';

export async function GET() {
  try {
    // For initial testing, use mock data
    const useRealAPI = true; // Set to false to fall back to mock data

    if (!useRealAPI) {
      return Response.json(mockMetrics);
    }

    const routeStart = performance.now();

    // New Relic (1 call for all pages) and Sentry (1 call per page) don't
    // depend on each other's results, so run all 6 requests concurrently
    // instead of the New Relic call blocking the Sentry batch.
    const newRelicStart = performance.now();
    const newRelicPromise = getNewRelicMetrics(
      process.env.NEWRELIC_API_KEY ?? '',
      process.env.NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID ?? ''
    ).then(result => {
      recordTiming('New Relic: metrics', performance.now() - newRelicStart);
      return result;
    });

    const sentryPromise = Promise.all(
      TRACKED_PAGES.map(async ({ url }) => {
        const sentryStart = performance.now();
        const sentry = await getSentryErrors(
          process.env.SENTRY_API_KEY ?? '',
          process.env.SENTRY_ORG_SLUG ?? '',
          process.env.SENTRY_PROJECT_ID ?? '',
          url
        );
        recordTiming(`Sentry: ${url}`, performance.now() - sentryStart);
        return { url, sentry };
      })
    );

    const [newRelicByPage, sentryResults] = await Promise.all([newRelicPromise, sentryPromise]);
    console.log(`[timing] combined New Relic + Sentry batch: ${Math.round(performance.now() - routeStart)}ms`);

    const pages = TRACKED_PAGES.map(({ name, slug, url }) => {
      const newRelic = newRelicByPage[url] ?? EMPTY_NEWRELIC_METRICS;
      const sentry = sentryResults.find(s => s.url === url)!.sentry;

      return {
        name,
        slug,
        url,
        visitors: formatVisitors(newRelic.throughput),
        status: deriveStatus(newRelic),
        newRelic,
        sentry,
        recordedAt: new Date().toISOString()
      };
    });

    recordSnapshot(pages);

    return Response.json({ pages, history: getHistory(), timestamp: new Date().toISOString() });
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

function formatVisitors(throughput: number): string {
  if (throughput >= 1000) return `${(throughput / 1000).toFixed(1)}k`;
  return String(throughput);
}