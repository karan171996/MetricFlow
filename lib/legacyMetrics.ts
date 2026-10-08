/**
 * The bridge from the deprecated per-vendor page fields (`newRelic`, `sentry`) to the neutral shape.
 * Client-safe: it takes only types from the server code. It goes away in C3, with the fields themselves.
 */
import type { NewRelicPageMetrics } from '@/lib/analytics/NewRelicAnalytics';
import type { SentryPageErrors } from '@/lib/analytics/SentryAnalytics';
import type { MetricsPage, MetricsResponse, PageMetrics, Sources } from '@/lib/metricsHistory';
import { isToolId, mergeMetrics, sourcesFor } from '@/lib/tools';

/** Numbers are copied as they are, the zeros of a page with no rows included, so C1 changes nothing on screen. */
export const newRelicToPageMetrics = (nr: NewRelicPageMetrics): PageMetrics => ({
  traffic: { count: nr.throughput },
  loadTime: nr.loadTime,
  apdex: nr.apdexScore,
  vitals: { lcp: nr.lcp, cls: nr.cls, inp: nr.inp, ttfb: nr.ttfb, fid: nr.fid },
  ...(nr.ajaxLatency !== undefined && { ajax: { latency: nr.ajaxLatency, failRate: nr.ajaxFailRate ?? 0 } }),
  errorRate: nr.errorRate
});

/** `errorRate` and `warningCount` are hard-coded, not measured, so they are dropped here. */
export const sentryToPageMetrics = (s: SentryPageErrors): PageMetrics => ({ errors: { count: s.errorCount, latest: s.latestErrors } });

type LegacyPage = Omit<MetricsPage, 'metrics' | 'byTool'> & Partial<Pick<MetricsPage, 'metrics' | 'byTool'>>;

/** Adds `byTool` (from the deprecated fields) and the merged `metrics` to pages that do not carry them yet. */
export function toNeutralPages(pages: LegacyPage[], sources: Sources, failed: readonly string[]): MetricsPage[] {
  return pages.map(p => {
    if (p.metrics && p.byTool) return p as MetricsPage;
    const byTool: MetricsPage['byTool'] = {
      ...(p.newRelic && { 'new-relic': newRelicToPageMetrics(p.newRelic) }),
      ...(p.sentry && { sentry: sentryToPageMetrics(p.sentry) })
    };
    return { ...p, metrics: mergeMetrics(byTool, sources, failed), byTool };
  });
}

/**
 * The /api/metrics body as screens read it. The route already sends `sources`, `metrics` and `byTool`;
 * a body with only the deprecated fields (the Cypress stubs, until their fixtures move in C3) gets them filled in here.
 */
export function withNeutralShape(body: Partial<MetricsResponse>): MetricsResponse {
  const failed = body.failed ?? [];
  const sources = body.sources ?? sourcesFor((body.tools ?? []).filter(isToolId));
  return {
    ...body,
    tools: body.tools ?? [],
    failed,
    sources,
    pages: body.pages && toNeutralPages(body.pages, sources, failed),
    history: body.history?.map(h => ({ ...h, sources: h.sources ?? sources, pages: toNeutralPages(h.pages, h.sources ?? sources, []) }))
  } as MetricsResponse;
}
