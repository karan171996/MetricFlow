import { Analytics, type KeyResult, type ToolRead, type ToolUpdate } from '@/lib/analytics/Analytics';
import { env } from '@/lib/env';
import { parseLighthouse } from '@/lib/lighthouse';
import { loadReports, type LoadReason } from '@/lib/lighthouseSource';
import { checkTarget, getResults, getStatus } from '@/lib/lighthouseRun';
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

/**
 * Per-page lab metrics from Lighthouse runs on LIGHTHOUSE_TARGET (see lib/lighthouseRun), or else from
 * Lighthouse CI reports (a file, folder or URL named by LIGHTHOUSE_REPORT). The target wins when both are set.
 */
export class LighthouseAnalytics extends Analytics<Record<string, unknown>, object> {
  readonly id = 'lighthouse';
  protected readonly timingLabel = 'Lighthouse: report';

  // A finished run changes lastRunAt, so it counts as a fresh read.
  protected memoKey() {
    const target = env('LIGHTHOUSE_TARGET');
    return target ? `target\n${target}\n${getStatus().lastRunAt}` : env('LIGHTHOUSE_REPORT');
  }

  emptyPage() { return { metrics: {} as PageMetrics, legacy: {} }; }

  protected async load(): Promise<ToolRead> {
    const target = env('LIGHTHOUSE_TARGET');
    const byPath = target ? getResults(target) : parseLighthouse(await loadReports(env('LIGHTHOUSE_REPORT')));
    return { pages: Object.keys(byPath).map(url => ({ url, views: 0 })), byPath, legacy: {} };
  }

  /** Checks each key given, nothing written. Fixed text per cause: never the setting, a file name, a parse error, a body or an address. */
  async update(values: Record<string, string>): Promise<ToolUpdate> {
    const [report, target] = await Promise.all([
      values.LIGHTHOUSE_REPORT === undefined ? undefined : this.checkReport(values.LIGHTHOUSE_REPORT),
      values.LIGHTHOUSE_TARGET === undefined ? undefined : checkTarget(values.LIGHTHOUSE_TARGET)
    ]);
    return { results: { ...(report && { LIGHTHOUSE_REPORT: report }), ...(target && { LIGHTHOUSE_TARGET: target }) } };
  }

  /** One load and parse of a report. */
  private async checkReport(spec: string): Promise<KeyResult> {
    try {
      const n = Object.keys(parseLighthouse(await loadReports(spec))).length;
      return n ? { ok: true } : { ok: false, error: NO_DATA };
    } catch (e) {
      const reason = (e as { reason?: string }).reason;
      return { ok: false, error: (reason && Object.hasOwn(LOAD_ERRORS, reason) && LOAD_ERRORS[reason as LoadReason]) || LOAD_ERRORS.unreadable };
    }
  }
}
