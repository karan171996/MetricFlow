import axios from 'axios';
import { Analytics } from '@/lib/analytics/Analytics';
import { orgSlugForDsn, parseSentryDsn } from '@/lib/sentryDsn';

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
  private apiKey: string;
  private dsn: string;

  constructor(apiKey: string, dsn: string) {
    super();
    this.apiKey = apiKey;
    this.dsn = dsn;
  }

  protected async fetchRows(): Promise<SentryEventRow[]> {
    const parsed = this.apiKey && this.dsn ? parseSentryDsn(this.dsn) : null;
    if (!this.apiKey || !parsed?.ok) return [];

    try {
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
    } catch (error) {
      console.error('Sentry API error:', axios.isAxiosError(error) ? error.response?.status : 'request failed');
      // Let the caller say "Could not load Sentry data" instead of showing a false "no errors".
      throw new Error('Sentry request failed');
    }
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

  /** Rethrows, so byPath() fails instead of returning an empty (looks-healthy) result. */
  protected onError(error: unknown): never {
    throw error;
  }
}
