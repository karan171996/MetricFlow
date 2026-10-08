import axios from 'axios';
import { Analytics, describeFailure, type KeyResult, type ToolRead, type ToolUpdate } from '@/lib/analytics/Analytics';
import { env } from '@/lib/env';
import { sentryToPageMetrics } from '@/lib/legacyMetrics';
import { orgSlugForDsn, parseSentryDsn, sentryHostNotice } from '@/lib/sentryDsn';

export interface SentryPageErrors {
  errorCount: number;
  errorRate: number;
  warningCount: number;
  latestErrors: { title: string; count: number; lastSeen: string }[];
}

interface SentryEventRow extends Record<string, unknown> {
  url?: string;
  title?: string;
  'count()'?: number;
  'last_seen()'?: string;
}

/**
 * Sentry errors per page: one org-level events call (last 24h, errors only)
 * grouped by URL. Replaces per-page calls to avoid rate limits.
 */
export class SentryAnalytics extends Analytics<SentryEventRow, SentryPageErrors> {
  readonly id = 'sentry';
  readonly legacyField = 'sentry';
  protected readonly timingLabel = 'Sentry: events';

  // Read at call time, so one instance can hold the poll memo and a key change on /setup is seen at once.
  private get apiKey() { return env('SENTRY_API_KEY'); }
  private get dsn() { return env('SENTRY_DSN'); }

  protected memoKey() { return `${this.apiKey}:${this.dsn}`; }

  emptyPage() {
    const legacy: SentryPageErrors = { errorCount: 0, errorRate: 0, warningCount: 0, latestErrors: [] };
    return { metrics: sentryToPageMetrics(legacy), legacy };
  }

  protected async load(): Promise<ToolRead> {
    const legacy = this.aggregateRows(await this.fetchRows());
    return { byPath: Object.fromEntries(Object.entries(legacy).map(([path, s]) => [path, sentryToPageMetrics(s)])), legacy };
  }

  /** Checks the token against the DSN's project. Also tells the user when the token would go to a host that is not sentry.io. */
  async update(values: Record<string, string>): Promise<ToolUpdate> {
    return { results: await checkSentry(values.SENTRY_API_KEY, values.SENTRY_DSN) };
  }

  protected async fetchRows(): Promise<SentryEventRow[]> {
    const parsed = parseSentryDsn(this.dsn);
    // A saved DSN that no longer parses (a legacy one with a secret part) is a failure, not "no errors".
    if (!parsed.ok) throw new Error('invalid DSN');

    const slug = await orgSlugForDsn(this.apiKey, parsed);
    if (!slug) return [];

    const res = await axios.get(`${parsed.apiBase}/organizations/${encodeURIComponent(slug)}/events/`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
      timeout: 10000,
      params: {
        project: parsed.projectId,
        field: ['url', 'title', 'count()', 'last_seen()'],
        query: 'event.type:error',
        statsPeriod: '24h',
        sort: '-last_seen',
        per_page: 100
      },
      paramsSerializer: { indexes: null }
    });

    return res.data?.data ?? [];
  }

  protected mergeVariants(rowsForOnePath: SentryEventRow[]): SentryPageErrors | null {
    if (rowsForOnePath.length === 0) return null;

    let totalErrorCount = 0;
    const latestErrors: { title: string; count: number; lastSeen: string }[] = [];

    for (const row of rowsForOnePath) {
      const count = Number(row['count()'] ?? 0);
      totalErrorCount += count;
      if (latestErrors.length < 5) {
        latestErrors.push({
          title: row.title ?? 'Unknown error',
          count,
          lastSeen: row['last_seen()'] ?? ''
        });
      }
    }

    return {
      errorCount: totalErrorCount,
      errorRate: 0,
      warningCount: 0,
      latestErrors
    };
  }
}

async function checkSentry(token: string, dsn: string): Promise<Record<string, KeyResult>> {
  const parsed = parseSentryDsn(dsn);
  if (!parsed.ok) return { SENTRY_DSN: { ok: false, error: parsed.error } };
  // The token goes to the DSN's host in the check itself, so the notice is on every outcome, not only a pass.
  const notice = sentryHostNotice(parsed.apiBase);
  const where = notice ? { notice } : {};
  try {
    const slug = await orgSlugForDsn(token, parsed);
    if (!slug) return { SENTRY_API_KEY: { ok: true }, SENTRY_DSN: { ok: false, error: 'This DSN does not match a project the token can read.', ...where } };
    return { SENTRY_API_KEY: { ok: true }, SENTRY_DSN: { ok: true, ...where } };
  } catch (e) {
    return { SENTRY_API_KEY: { ok: false, error: describeFailure(e, 'Sentry token'), ...where } };
  }
}
