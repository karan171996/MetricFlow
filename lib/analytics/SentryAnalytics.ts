import axios from 'axios';
import { Analytics, describeFailure, type KeyResult, type ToolRead, type ToolUpdate } from '@/lib/analytics/Analytics';
import { isLocalUrl, normalizePath } from '@/lib/discoverPages';
import { env } from '@/lib/env';
import { sentryToPageMetrics } from '@/lib/legacyMetrics';
import type { PageMetrics } from '@/lib/metricsHistory';
import { orgSlugForDsn, parseSentryDsn, sentryHostNotice, type ParsedDsn } from '@/lib/sentryDsn';

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

/** One page-load row from the spans dataset: a page URL with its sampled count and p75 vitals. */
interface PageLoadRow extends Record<string, unknown> {
  'url.full'?: string | null;
  'count_sample()'?: number | null;
}

const ERRORS = {
  field: ['url', 'title', 'count()', 'last_seen()'],
  query: 'event.type:error',
  sort: '-last_seen'
};

// Checked against real data on a spans-billed plan: the `transactions` dataset stays empty there, and INP
// is not on the page-load span (it comes back null unless an interaction was recorded).
// `count_sample()` is the stored count; `count()` on this dataset is scaled up from the sample rate.
const VITALS = { lcp: 'p75(measurements.lcp)', cls: 'p75(measurements.cls)', inp: 'p75(measurements.inp)', ttfb: 'p75(measurements.ttfb)' } as const;
const PAGE_LOADS = {
  dataset: 'spans',
  field: ['transaction', 'url.full', 'count_sample()', ...Object.values(VITALS)],
  query: 'span.op:pageload is_transaction:true',
  sort: '-count_sample()'
};

type Vital = keyof typeof VITALS;

/**
 * Page loads per local page path: the sampled count, and each p75 vital that was measured.
 * Query-string variants of a path are merged, weighted by their counts (ponytail: averaging
 * p75s is an approximation, the same one the New Relic merge makes).
 */
export function pageLoads(rows: PageLoadRow[]): Record<string, PageMetrics> {
  const acc: Record<string, { count: number; sums: Partial<Record<Vital, { total: number; weight: number }>> }> = {};
  for (const row of rows) {
    const url = String(row['url.full'] ?? '');
    const path = isLocalUrl(url) ? normalizePath(url) : null;
    if (path === null) continue;
    const count = Number(row['count_sample()'] ?? 0) || 0;
    const a = (acc[path] ??= { count: 0, sums: {} });
    a.count += count;
    for (const vital of Object.keys(VITALS) as Vital[]) {
      const value = row[VITALS[vital]];
      // null = nobody measured it on this page. It stays absent; it is never a zero.
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      const s = (a.sums[vital] ??= { total: 0, weight: 0 });
      s.total += value * (count || 1);
      s.weight += count || 1;
    }
  }
  return Object.fromEntries(Object.entries(acc).map(([path, a]) => {
    const vitals = Object.fromEntries(Object.entries(a.sums).map(([vital, s]) => [vital, s.total / s.weight]));
    return [path, { traffic: { count: a.count, sampled: true }, ...(Object.keys(vitals).length > 0 && { vitals }) } satisfies PageMetrics];
  }));
}

/**
 * Sentry per page, from two org-level events calls over the last 24h: errors grouped by URL,
 * and page loads with their web vitals from tracing. Local pages only for the page list, as with New Relic.
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
    const target = await this.target();
    if (!target) return { pages: [], byPath: {}, legacy: {} };
    const [errorRows, loadRows] = await Promise.all([
      this.query<SentryEventRow>(target, ERRORS),
      this.query<PageLoadRow>(target, PAGE_LOADS)
    ]);
    const legacy = this.aggregateRows(errorRows);
    const loads = pageLoads(loadRows);

    // The page list: every local page that loaded, plus local pages that only have errors (listed with no traffic).
    const views: Record<string, number> = Object.fromEntries(Object.entries(loads).map(([path, m]) => [path, m.traffic!.count]));
    for (const row of errorRows) {
      const url = String(row.url ?? '');
      const path = isLocalUrl(url) ? normalizePath(url) : null;
      if (path !== null) views[path] ??= 0;
    }

    const byPath: Record<string, PageMetrics> = {};
    for (const path of new Set([...Object.keys(legacy), ...Object.keys(loads)])) {
      // The route looks a page up through `legacy`, so a page with loads and no errors needs its (zero errors) row too.
      legacy[path] ??= this.emptyPage().legacy;
      byPath[path] = { ...sentryToPageMetrics(legacy[path]), ...loads[path] };
    }
    return { pages: Object.entries(views).map(([url, count]) => ({ url, views: count })), byPath, legacy };
  }

  /** Checks the token against the DSN's project. Also tells the user when the token would go to a host that is not sentry.io. */
  async update(values: Record<string, string>): Promise<ToolUpdate> {
    return { results: await checkSentry(values.SENTRY_API_KEY, values.SENTRY_DSN) };
  }

  protected async fetchRows(): Promise<SentryEventRow[]> {
    const target = await this.target();
    return target ? this.query<SentryEventRow>(target, ERRORS) : [];
  }

  /** Where to ask: the DSN's project and the org the token sees it in. Null when the token cannot see that project. */
  private async target(): Promise<{ parsed: ParsedDsn; slug: string } | null> {
    const parsed = parseSentryDsn(this.dsn);
    // A saved DSN that no longer parses (a legacy one with a secret part) is a failure, not "no errors".
    if (!parsed.ok) throw new Error('invalid DSN');
    const slug = await orgSlugForDsn(this.apiKey, parsed);
    return slug ? { parsed, slug } : null;
  }

  /** One org-level events call over the last 24h. */
  private async query<T>({ parsed, slug }: { parsed: ParsedDsn; slug: string }, params: Record<string, unknown>): Promise<T[]> {
    const res = await axios.get(`${parsed.apiBase}/organizations/${encodeURIComponent(slug)}/events/`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
      timeout: 10000,
      params: { project: parsed.projectId, statsPeriod: '24h', per_page: 100, ...params },
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
