import axios from 'axios';
import { nrHosts } from '@/lib/env';
import { buildPages, normalizePath, type DiscoveredPage } from '@/lib/discoverPages';


export interface NewRelicPageMetrics {
  loadTime: number;
  lcp: number;
  ttfb: number;
  cls: number;
  inp?: number;
  fid: number;
  errorRate: number;
  throughput: number;
  apdexScore: number;
}

interface NewRelicGraphQLResponse {
  data?: { actor?: { account?: Record<string, { results: Record<string, unknown>[] } | undefined> } };
  errors?: unknown[];
}

/**
 * NRQL percentile() comes back as { "75": value }; apdex() as { score, s, t, f }
 * (taking the first value would return the satisfied count, not the 0-1 score); plain aggregates as a number.
 */
export function num(v: unknown): number {
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return Number('score' in o ? o.score : Object.values(o)[0] ?? 0) || 0;
  }
  return Number(v ?? 0) || 0;
}

const WINDOW = 'SINCE 24 hours ago';

/**
 * Real-user metrics per page path from New Relic's native browser events
 * (PageView, PageViewTiming, JavaScriptError), 75th percentiles, last 24h.
 * Keyed by normalized path. Unit note: PageView durations and
 * LCP are seconds, converted to ms; INP/FID are already ms (unconfirmed). A path missing from the result has no events yet.
 * Throws on API failure so callers can show an error, not empty data.
 */
export async function getNewRelicMetrics(
  apiKey: string,
  accountId: string
): Promise<Record<string, NewRelicPageMetrics>> {
  if (!apiKey || !accountId) return {};

  const q = (nrql: string) => `nrql(query: "${nrql}") { results }`;
  const query = `{ actor { account(id: ${Number(accountId)}) {
    views: ${q(`SELECT percentile(duration, 75) AS loadTime, percentile(backendDuration, 75) AS ttfb, count(*) AS views, apdex(duration, t: 2) AS apdex FROM PageView FACET pageUrl ${WINDOW} LIMIT 200`)}
    timing: ${q(`SELECT percentile(largestContentfulPaint, 75) AS lcp, percentile(cumulativeLayoutShift, 75) AS cls, percentile(interactionToNextPaint, 75) AS inp, percentile(firstInputDelay, 75) AS fid FROM PageViewTiming FACET pageUrl ${WINDOW} LIMIT 200`)}
    errors: ${q(`SELECT count(*) AS errors FROM JavaScriptError FACET pageUrl ${WINDOW} LIMIT 200`)}
  } } }`;

  let data: NewRelicGraphQLResponse;
  try {
    data = (await axios.post(nrHosts().graphql, { query }, { headers: { 'API-Key': apiKey, 'Content-Type': 'application/json' }, timeout: 15000 })).data;
  } catch {
    throw new Error('Could not reach New Relic to load metrics.');
  }
  const account = data.data?.actor?.account;
  if (!account?.views) throw new Error('New Relic rejected the metrics query. Check your key and account ID.');
  return aggregateMetrics(account);
}

type NrAccount = NonNullable<NonNullable<NonNullable<NewRelicGraphQLResponse['data']>['actor']>['account']>;

/** Pure: NRQL result rows -> per-path metrics in dashboard units (ms, 0-1 apdex, % error rate). */
export function aggregateMetrics(account: NrAccount): Record<string, NewRelicPageMetrics> {
  if (!account.views) return {};
  const key = (r: Record<string, unknown>) => normalizePath(String(r.pageUrl ?? r.facet ?? ''));

  // Merge query-string variants: sum counts, view-weighted average of percentiles
  // (ponytail: averaging p75s is an approximation; exact merge needs NRQL on a normalized attribute).
  type Acc = { views: number; loadTime: number; ttfb: number; apdex: number; lcp: number; cls: number; inp: number; fid: number; errors: number };
  const acc: Record<string, Acc> = {};
  const get = (p: string) => (acc[p] ??= { views: 0, loadTime: 0, ttfb: 0, apdex: 0, lcp: 0, cls: 0, inp: 0, fid: 0, errors: 0 });

  for (const r of account.views.results) {
    const p = key(r);
    if (p === null) continue;
    const a = get(p), v = num(r.views);
    a.views += v;
    a.loadTime += num(r.loadTime) * 1000 * v;
    a.ttfb += num(r.ttfb) * 1000 * v;
    a.apdex += num(r.apdex) * v;
  }
  for (const r of account.timing?.results ?? []) {
    const p = key(r);
    if (p === null || !acc[p]) continue;
    const a = acc[p], v = a.views || 1;
    a.lcp += num(r.lcp) * 1000 * v; // PageViewTiming LCP is reported in seconds (13.4 next to a 13.3s duration in a real run)
    a.cls += num(r.cls) * v;
    a.inp += num(r.inp) * v;
    a.fid += num(r.fid) * v;
  }
  for (const r of account.errors?.results ?? []) {
    const p = key(r);
    if (p !== null && acc[p]) acc[p].errors += num(r.errors);
  }

  const byPage: Record<string, NewRelicPageMetrics> = {};
  for (const [p, a] of Object.entries(acc)) {
    const w = a.views || 1;
    byPage[p] = {
      loadTime: a.loadTime / w,
      lcp: a.lcp / w,
      ttfb: a.ttfb / w,
      cls: a.cls / w,
      inp: a.inp / w,
      fid: a.fid / w,
      errorRate: a.views ? (a.errors / a.views) * 100 : 0,
      throughput: a.views,
      apdexScore: a.apdex / w
    };
  }
  return byPage;
}

/**
 * Top pages by page views in the last 24h, from New Relic's native PageView
 * event. Query-string variants of one path are merged. Throws on API failure
 * so the caller can show an error instead of an empty list.
 */
// ponytail: 60s in-process memo so the metrics route and the detail page's 404 check share one call.
let discoverCache: { key: string; at: number; pages: DiscoveredPage[] } | null = null;
const DISCOVER_TTL_MS = 60_000;

export async function discoverPages(apiKey: string, accountId: string): Promise<DiscoveredPage[]> {
  if (!apiKey || !accountId) return [];
  const key = `${apiKey}:${accountId}`;
  if (discoverCache && discoverCache.key === key && Date.now() - discoverCache.at < DISCOVER_TTL_MS) {
    return discoverCache.pages;
  }
  const pages = await queryDiscoveredPages(apiKey, accountId);
  discoverCache = { key, at: Date.now(), pages };
  return pages;
}

async function queryDiscoveredPages(apiKey: string, accountId: string): Promise<DiscoveredPage[]> {

  const query = `
    query {
      actor {
        account(id: ${Number(accountId)}) {
          nrql(query: "SELECT count(*) AS views FROM PageView FACET pageUrl SINCE 24 hours ago LIMIT 200") {
            results
          }
        }
      }
    }
  `;
  let data: NewRelicGraphQLResponse;
  try {
    data = (await axios.post(nrHosts().graphql, { query }, { headers: { 'API-Key': apiKey, 'Content-Type': 'application/json' }, timeout: 10000 })).data;
  } catch {
    throw new Error('Could not reach New Relic to discover pages.');
  }
  const results = (data.data?.actor?.account as unknown as { nrql?: { results: Record<string, unknown>[] } } | undefined)?.nrql?.results;
  if (!results) throw new Error('New Relic rejected the page discovery query. Check your key and account ID.');

  return buildPages(
    results.map(r => ({ url: String(r.pageUrl ?? r.facet ?? ''), views: Number(r.views ?? r.count ?? 0) }))
  );
}
