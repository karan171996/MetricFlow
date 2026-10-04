import axios from 'axios';
import { normalizePath } from '@/lib/discoverPages';
import { orgSlugForDsn, parseSentryDsn } from '@/lib/sentryDsn';

export interface SentryPageErrors {
  errorCount: number;
  errorRate: number;
  warningCount: number;
  latestErrors: { title: string; count: number; lastSeen: string }[];
}

export const EMPTY_SENTRY_DATA: SentryPageErrors = {
  errorCount: 0,
  errorRate: 0,
  warningCount: 0,
  latestErrors: []
};

const sentryHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });

/**
 * ONE org-level events call (last 24h, errors only) grouped by url + title,
 * summed per normalized page path. Replaces one call per page (rate limits).
 * Pages with no matching events are simply absent from the result.
 * Warnings are not counted here (only event.type:error is queried).
 * Project id and API host come from the DSN. The org slug is resolved per call and not stored.
 */
export async function getSentryErrorsByPath(apiKey: string, dsn: string): Promise<Record<string, SentryPageErrors>> {
  const parsed = apiKey && dsn ? parseSentryDsn(dsn) : null;
  if (!apiKey || !parsed?.ok) return {};

  try {
    const slug = await orgSlugForDsn(apiKey, parsed);
    if (!slug) return {};
    const res = await axios.get(`${parsed.apiBase}/organizations/${encodeURIComponent(slug)}/events/`, {
      headers: sentryHeaders(apiKey),
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
    return groupByPath(res.data?.data ?? []);
  } catch (error) {
    console.error('Sentry API error:', axios.isAxiosError(error) ? error.response?.status : 'request failed');
    return {};
  }
}

interface SentryEventRow {
  url?: string;
  title?: string;
  'count()'?: number;
  'last_seen()'?: string;
}

function groupByPath(rows: SentryEventRow[]): Record<string, SentryPageErrors> {
  const out: Record<string, SentryPageErrors> = {};
  for (const row of rows) {
    const path = normalizePath(row.url ?? '');
    if (path === null) continue;
    const entry = (out[path] ??= { errorCount: 0, errorRate: 0, warningCount: 0, latestErrors: [] });
    const count = Number(row['count()'] ?? 0);
    entry.errorCount += count;
    if (entry.latestErrors.length < 5) {
      entry.latestErrors.push({ title: row.title ?? 'Unknown error', count, lastSeen: row['last_seen()'] ?? '' });
    }
  }
  return out;
}
