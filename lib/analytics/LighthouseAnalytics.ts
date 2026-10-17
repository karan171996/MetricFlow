import { Analytics, type ToolRead, type ToolUpdate } from '@/lib/analytics/Analytics';
import { env } from '@/lib/env';
import { parseLighthouse } from '@/lib/lighthouse';
import { loadReports, type LoadReason } from '@/lib/lighthouseSource';
import type { PageMetrics } from '@/lib/metricsHistory';

// Setup is local-only, so naming the cause (which reveals whether a file exists) is accepted.
export const LOAD_ERRORS: Record<LoadReason, string> = {
  blocked: 'That Lighthouse report address is not allowed. Use a public http(s) URL on port 80 or 443, or a file path for a report on localhost.',
  notFound: 'No Lighthouse report file or folder was found there, or it could not be read.',
  notJsonFile: 'The Lighthouse report must be a .json file or a folder of them.',
  tooLarge: 'The Lighthouse report is too large (5 MB per file; 200 files and 25 MB per folder).',
  timeout: 'The Lighthouse report did not arrive within 10 seconds.',
  notJson: 'The Lighthouse report is not valid JSON.',
  unreadable: 'Could not read the Lighthouse report.',
};
export const NO_DATA = 'No Lighthouse performance runs were found in that Lighthouse report.';

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

  /** One load and parse, nothing written. Fixed text per cause: never the setting, a file name, a parse error, a body or an address. */
  async update(values: Record<string, string>): Promise<ToolUpdate> {
    const bad = (error: string): ToolUpdate => ({ results: { LIGHTHOUSE_REPORT: { ok: false, error } } });
    try {
      const n = Object.keys(parseLighthouse(await loadReports(values.LIGHTHOUSE_REPORT ?? ''))).length;
      if (!n) return bad(NO_DATA);
      return { results: { LIGHTHOUSE_REPORT: { ok: true } } };
    } catch (e) {
      const reason = (e as { reason?: string }).reason;
      return bad((reason && Object.hasOwn(LOAD_ERRORS, reason) && LOAD_ERRORS[reason as LoadReason]) || LOAD_ERRORS.unreadable);
    }
  }
}
