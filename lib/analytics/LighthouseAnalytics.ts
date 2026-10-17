import { Analytics, type ToolRead, type ToolUpdate } from '@/lib/analytics/Analytics';
import { env } from '@/lib/env';
import { parseLighthouse } from '@/lib/lighthouse';
import { loadReports } from '@/lib/lighthouseSource';
import type { PageMetrics } from '@/lib/metricsHistory';

/** Lighthouse CI reports (a file, folder or URL named by LIGHTHOUSE_REPORT) as per-page lab metrics. */
export class LighthouseAnalytics extends Analytics<Record<string, unknown>, object> {
  readonly id = 'lighthouse';
  protected readonly timingLabel = 'Lighthouse: report';

  protected memoKey() { return env('LIGHTHOUSE_REPORT'); }

  emptyPage() { return { metrics: {} as PageMetrics, legacy: {} }; }

  protected async load(): Promise<ToolRead> {
    const byPath = parseLighthouse(await loadReports(env('LIGHTHOUSE_REPORT')));
    return { pages: Object.keys(byPath).map(url => ({ url, views: 0 })), byPath, legacy: {} };
  }

  /** One load and parse, nothing written. Fixed text only. */
  async update(values: Record<string, string>): Promise<ToolUpdate> {
    try {
      const n = Object.keys(parseLighthouse(await loadReports(values.LIGHTHOUSE_REPORT ?? ''))).length;
      if (!n) return { results: { LIGHTHOUSE_REPORT: { ok: false, error: 'No usable Lighthouse report was found there.' } } };
      return { results: { LIGHTHOUSE_REPORT: { ok: true } } };
    } catch {
      return { results: { LIGHTHOUSE_REPORT: { ok: false, error: 'Could not read the Lighthouse report.' } } };
    }
  }
}
