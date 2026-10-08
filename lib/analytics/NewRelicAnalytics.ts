import axios from 'axios';
import { Analytics, describeFailure, type KeyResult, type ToolRead, type ToolUpdate } from '@/lib/analytics/Analytics';
import { nrGraphql } from '@/lib/nrRequest';
import { LOCAL_ONLY_NRQL } from '@/lib/discoverPages';
import { env, nrHosts, type NrRegion } from '@/lib/env';
import { newRelicToPageMetrics } from '@/lib/legacyMetrics';
import { discoverPages } from '@/lib/newrelic';

export interface NewRelicPageMetrics {
  loadTime: number;
  lcp: number;
  ttfb: number;
  cls: number;
  inp?: number;
  fid: number;
  /** AjaxRequest average duration in ms; absent when the page made no API calls. */
  ajaxLatency?: number;
  /** Share of AjaxRequest calls that failed (HTTP 4xx/5xx or no response), 0-100. */
  ajaxFailRate?: number;
  errorRate: number;
  throughput: number;
  apdexScore: number;
}

interface NrGraphqlResponse {
  data?: { actor?: { account?: Record<string, { results: Record<string, unknown>[] } | undefined> } };
  errors?: unknown[];
}

interface NrRawRow extends Record<string, unknown> {
  pageUrl?: string;
  facet?: string;
  loadTime?: unknown;
  ttfb?: unknown;
  views?: unknown;
  apdex?: unknown;
  lcp?: unknown;
  cls?: unknown;
  inp?: unknown;
  fid?: unknown;
  errors?: unknown;
  ajaxLatency?: unknown;
  ajaxCalls?: unknown;
  ajaxFailed?: unknown;
}

/**
 * Extract apdex score from { score, s, t, f } or plain percentile from { "75": value }.
 * Taking the first value of a percentile would return count, not the 0-1 score.
 */
export function num(v: unknown): number {
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return Number('score' in o ? o.score : Object.values(o)[0] ?? 0) || 0;
  }
  return Number(v ?? 0) || 0;
}

/**
 * New Relic metrics: 75th percentiles, view-weighted averages, last 24h.
 * Runs 4 NRQL queries (views, timing, errors, ajax) in one GraphQL call.
 */
const EMPTY_NEWRELIC_METRICS: NewRelicPageMetrics = {
  loadTime: 0,
  lcp: 0,
  ttfb: 0,
  cls: 0,
  inp: 0,
  fid: 0,
  errorRate: 0,
  throughput: 0,
  apdexScore: 0
};

// An NRAK- User key in an ingest field is the most common setup mistake; a prefix check kills the whole class.
const USER_KEY_MSG = 'That is a User API key (starts NRAK-), which reads data. The Insert key sends data: New Relic > API keys > create key, type "Ingest - License".';

export class NewRelicAnalytics extends Analytics<NrRawRow, NewRelicPageMetrics> {
  readonly id = 'new-relic';
  readonly legacyField = 'newRelic';
  protected readonly timingLabel = 'New Relic: metrics';

  // Read at call time, so one instance can hold the poll memo and a key change on /setup is seen at once.
  private get apiKey() { return env('NEWRELIC_API_KEY'); }
  private get accountId() { return env('NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID'); }

  protected memoKey() { return `${this.apiKey}:${this.accountId}:${env('NEWRELIC_REGION')}`; }

  emptyPage() {
    return { metrics: newRelicToPageMetrics(EMPTY_NEWRELIC_METRICS), legacy: EMPTY_NEWRELIC_METRICS };
  }

  /** The page list, then the metrics for those pages (no metrics query for an empty list, as before). */
  protected async load(): Promise<ToolRead> {
    const found = await discoverPages(this.apiKey, this.accountId);
    const pages = found.map(({ url, views }) => ({ url, views }));
    if (!found.length) return { pages, byPath: {}, legacy: {} };
    const legacy = this.aggregateRows(await this.fetchRows());
    return { pages, byPath: Object.fromEntries(Object.entries(legacy).map(([path, nr]) => [path, newRelicToPageMetrics(nr)])), legacy };
  }

  /** Checks the User key and account ID together, or the optional Insert key alone. */
  async update(values: Record<string, string>): Promise<ToolUpdate> {
    const insert = values.NEWRELIC_INSERT_KEY;
    if (insert !== undefined) {
      return { results: { NEWRELIC_INSERT_KEY: /^NRAK-/i.test(insert) ? { ok: false, error: USER_KEY_MSG } : { ok: true } } };
    }
    const results = await checkNewRelic(values.NEWRELIC_API_KEY, values.NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID);
    // Region only changes when the User key was checked in this save.
    const key = results.NEWRELIC_API_KEY;
    return { results, ...(key && { derived: { NEWRELIC_REGION: key.ok && key.region === 'eu' ? 'eu' : 'us' } }) };
  }

  /** Per-path metrics from an already-fetched NRQL account payload. */
  aggregate(
    account: Record<string, { results: Record<string, unknown>[] } | undefined>
  ): Record<string, NewRelicPageMetrics> {
    if (!account.views) return {};
    return this.aggregateRows(this.flattenNrAccount(account));
  }

  protected async fetchRows(): Promise<NrRawRow[]> {
    if (!this.apiKey || !this.accountId) return [];

    const q = (nrql: string) => `nrql(query: "${nrql}") { results }`;
    const WINDOW = 'SINCE 24 hours ago';
    const LOCAL = LOCAL_ONLY_NRQL;
    const query = `{ actor { account(id: ${Number(this.accountId)}) {
      views: ${q(`SELECT percentile(duration, 75) AS loadTime, percentile(backendDuration, 75) AS ttfb, count(*) AS views, apdex(duration, t: 2) AS apdex FROM PageView ${LOCAL} FACET pageUrl ${WINDOW} LIMIT 200`)}
      timing: ${q(`SELECT percentile(largestContentfulPaint, 75) AS lcp, percentile(cumulativeLayoutShift, 75) AS cls, percentile(interactionToNextPaint, 75) AS inp, percentile(firstInputDelay, 75) AS fid FROM PageViewTiming ${LOCAL} FACET pageUrl ${WINDOW} LIMIT 200`)}
      errors: ${q(`SELECT count(*) AS errors FROM JavaScriptError ${LOCAL} FACET pageUrl ${WINDOW} LIMIT 200`)}
      ajax: ${q(`SELECT average(duration) AS ajaxLatency, count(*) AS ajaxCalls, filter(count(*), WHERE httpResponseCode >= 400 OR httpResponseCode = 0) AS ajaxFailed FROM AjaxRequest ${LOCAL} FACET pageUrl ${WINDOW} LIMIT 200`)}
    } } }`;

    const data = await nrGraphql<NrGraphqlResponse>(this.apiKey, query, 15000);
    const account = data.data?.actor?.account;
    if (!account?.views) throw new Error('rejected');
    return this.flattenNrAccount(account);
  }

  /** Convert { views: [...], timing: [...], errors: [...], ajax: [...] } into a flat array. */
  private flattenNrAccount(
    account: Record<string, { results: Record<string, unknown>[] } | undefined>
  ): NrRawRow[] {
    const viewRows = account.views?.results ?? [];
    const timingRows = account.timing?.results ?? [];
    const errorRows = account.errors?.results ?? [];
    const ajaxRows = account.ajax?.results ?? [];

    // Merge all rows by pageUrl, preserving all fields
    const merged = new Map<string, NrRawRow>();
    for (const row of viewRows) {
      const key = String(row.pageUrl ?? row.facet ?? '');
      merged.set(key, { ...merged.get(key), ...row });
    }
    for (const row of timingRows) {
      const key = String(row.pageUrl ?? row.facet ?? '');
      merged.set(key, { ...merged.get(key), ...row });
    }
    for (const row of errorRows) {
      const key = String(row.pageUrl ?? row.facet ?? '');
      merged.set(key, { ...merged.get(key), ...row });
    }
    for (const row of ajaxRows) {
      const key = String(row.pageUrl ?? row.facet ?? '');
      merged.set(key, { ...merged.get(key), ...row });
    }

    return Array.from(merged.values());
  }

  protected mergeVariants(rowsForOnePath: NrRawRow[]): NewRelicPageMetrics | null {
    if (rowsForOnePath.length === 0) return null;

    // Accumulate view-weighted sums
    let totalViews = 0;
    let weightedLoadTime = 0;
    let weightedTtfb = 0;
    let weightedApdex = 0;
    let weightedLcp = 0;
    let weightedCls = 0;
    let weightedInp = 0;
    let weightedFid = 0;
    let totalErrors = 0;
    let totalAjaxCalls = 0;
    let weightedAjaxLatency = 0;
    let totalAjaxFailed = 0;

    for (const row of rowsForOnePath) {
      const viewCount = num(row.views);
      totalViews += viewCount;
      weightedLoadTime += num(row.loadTime) * 1000 * viewCount;
      weightedTtfb += num(row.ttfb) * 1000 * viewCount;
      weightedApdex += num(row.apdex) * viewCount;
      weightedLcp += num(row.lcp) * 1000 * viewCount;
      weightedCls += num(row.cls) * viewCount;
      weightedInp += num(row.inp) * viewCount;
      weightedFid += num(row.fid) * viewCount;
      totalErrors += num(row.errors);
      const ajaxCalls = num(row.ajaxCalls);
      totalAjaxCalls += ajaxCalls;
      weightedAjaxLatency += num(row.ajaxLatency) * 1000 * ajaxCalls; // AjaxRequest duration is seconds
      totalAjaxFailed += num(row.ajaxFailed);
    }

    const divisor = totalViews || 1;
    return {
      loadTime: weightedLoadTime / divisor,
      lcp: weightedLcp / divisor,
      ttfb: weightedTtfb / divisor,
      cls: weightedCls / divisor,
      inp: weightedInp / divisor,
      fid: weightedFid / divisor,
      errorRate: totalViews ? (totalErrors / totalViews) * 100 : 0,
      throughput: totalViews,
      apdexScore: weightedApdex / divisor,
      ...(totalAjaxCalls > 0 && { ajaxLatency: weightedAjaxLatency / totalAjaxCalls, ajaxFailRate: (totalAjaxFailed / totalAjaxCalls) * 100 })
    };
  }
}

async function checkNewRelic(key: string, accountId: string): Promise<Record<string, KeyResult>> {
  if (!/^\d+$/.test(accountId)) {
    return { NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID: { ok: false, error: 'Account ID must be a number.' } };
  }
  try {
    const ask = (region: NrRegion) =>
      axios.post(
        nrHosts(region).graphql,
        { query: `{ actor { user { id } account(id: ${accountId}) { id } } }` },
        { headers: { 'API-Key': key }, timeout: 8000 }
      );
    // A key only works on its own data centre: try US, and if it is rejected there, EU.
    let region: NrRegion = 'us';
    let res;
    try {
      res = await ask('us');
      if (!res.data?.data?.actor?.user?.id) throw new Error('rejected');
    } catch (usError) {
      try {
        res = await ask('eu');
        if (!res.data?.data?.actor?.user?.id) throw usError;
        region = 'eu';
      } catch {
        throw usError;
      }
    }
    const regionTag = region === 'eu' ? { region } : {};
    const actor = res.data?.data?.actor;
    if (!actor?.user?.id) return { NEWRELIC_API_KEY: { ok: false, error: 'New Relic User key was rejected.' } };
    if (!actor.account?.id) {
      return {
        NEWRELIC_API_KEY: { ok: true, ...regionTag },
        NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID: { ok: false, error: 'This key cannot see that account ID.' }
      };
    }
    return { NEWRELIC_API_KEY: { ok: true, ...regionTag }, NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID: { ok: true } };
  } catch (e) {
    return { NEWRELIC_API_KEY: { ok: false, error: describeFailure(e, 'New Relic') } };
  }
}

/** Exported for backward compatibility with tests and existing callers. */
export function aggregateMetrics(
  account: Record<string, { results: Record<string, unknown>[] } | undefined>
): Record<string, NewRelicPageMetrics> {
  return new NewRelicAnalytics().aggregate(account);
}
