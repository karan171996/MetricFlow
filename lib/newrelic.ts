import { buildPages, LOCAL_ONLY_NRQL, type DiscoveredPage } from '@/lib/discoverPages';
import { nrGraphql } from '@/lib/nrRequest';

// Re-export for backward compatibility with existing imports
export type { NewRelicPageMetrics } from '@/lib/analytics/NewRelicAnalytics';

// Re-export for test compatibility
export { aggregateMetrics, num } from '@/lib/analytics/NewRelicAnalytics';

interface NrGraphqlResponse {
  data?: { actor?: { account?: { nrql?: { results: Record<string, unknown>[] } } } };
  errors?: unknown[];
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
          nrql(query: "SELECT count(*) AS views FROM PageView ${LOCAL_ONLY_NRQL} FACET pageUrl SINCE 24 hours ago LIMIT 200") {
            results
          }
        }
      }
    }
  `;
  let data: NrGraphqlResponse;
  try {
    data = await nrGraphql<NrGraphqlResponse>(apiKey, query, 10000);
  } catch {
    throw new Error('Could not reach New Relic to discover pages.');
  }
  const results = data.data?.actor?.account?.nrql?.results;
  if (!results) throw new Error('New Relic rejected the page discovery query. Check your key and account ID.');

  return buildPages(
    results.map(r => ({ url: String(r.pageUrl ?? r.facet ?? ''), views: Number(r.views ?? r.count ?? 0) }))
  );
}
