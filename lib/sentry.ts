import axios from 'axios';
import { normalizePath } from '@/lib/discoverPages';

const SENTRY_API_URL = 'https://sentry.io/api/0';

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

// ponytail: in-process memo of slug -> numeric id (the events API wants the numeric id).
const projectIdCache = new Map<string, string>();

async function numericProjectId(token: string, org: string, project: string): Promise<string> {
  const k = `${org}/${project}`;
  const hit = projectIdCache.get(k);
  if (hit) return hit;
  const res = await axios.get(`${SENTRY_API_URL}/projects/${encodeURIComponent(org)}/${encodeURIComponent(project)}/`, {
    headers: sentryHeaders(token),
    timeout: 8000
  });
  const id = String(res.data?.id ?? '');
  if (!id) throw new Error('no project id');
  projectIdCache.set(k, id);
  return id;
}

/**
 * ONE org-level events call (last 24h, errors only) grouped by url + title,
 * summed per normalized page path. Replaces one call per page (rate limits).
 * Pages with no matching events are simply absent from the result.
 * Warnings are not counted here (only event.type:error is queried).
 */
export async function getSentryErrorsByPath(
  apiKey: string,
  orgSlug: string,
  project: string
): Promise<Record<string, SentryPageErrors>> {
  if (!apiKey || !orgSlug || !project) return {};

  try {
    const id = await numericProjectId(apiKey, orgSlug, project);
    const res = await axios.get(`${SENTRY_API_URL}/organizations/${encodeURIComponent(orgSlug)}/events/`, {
      headers: sentryHeaders(apiKey),
      timeout: 10000,
      params: {
        project: id,
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
