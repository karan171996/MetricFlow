import axios from 'axios';

const NEWRELIC_API_URL = 'https://api.newrelic.com/graphql';

export interface NewRelicPageMetrics {
  loadTime: number;
  lcp: number;
  ttfb: number;
  cls: number;
  fid: number;
  errorRate: number;
  throughput: number;
  apdexScore: number;
}

/**
 * Returns real-user metrics per page URL, keyed by the `page` value the
 * site's beacon script reports on the `PageMetrics` custom event. A page
 * missing from the result just hasn't reported data yet (no beacon hit
 * since the query window started) — callers decide the fallback.
 */
export async function getNewRelicMetrics(
  apiKey: string,
  accountId: string
): Promise<Record<string, NewRelicPageMetrics>> {
  if (!apiKey || !accountId) {
    return {};
  }

  try {
    const query = `
      query {
        actor {
          account(id: ${accountId}) {
            nrql(query: "SELECT average(loadTime) as loadTime, average(lcp) as lcp, average(ttfb) as ttfb, average(cls) as cls, average(fid) as fid, average(errorRate) as errorRate, average(throughput) as throughput, average(apdexScore) as apdexScore FROM PageMetrics FACET page SINCE 1 hour ago LIMIT MAX") {
              results
            }
          }
        }
      }
    `;

    const response = await axios.post(
      NEWRELIC_API_URL,
      { query },
      {
        headers: {
          'API-Key': apiKey,
          'Content-Type': 'application/json'
        }
      }
    );

    return parseNewRelicResponse(response.data);
  } catch (error) {
    console.error('New Relic API error:', error);
    return {};
  }
}

interface NewRelicGraphQLResponse {
  data?: {
    actor?: {
      account?: {
        nrql?: {
          results: Record<string, unknown>[];
        };
      };
    };
  };
  errors?: unknown[];
}

function parseNewRelicResponse(data: NewRelicGraphQLResponse): Record<string, NewRelicPageMetrics> {
  const results = data.data?.actor?.account?.nrql?.results;
  if (!results) {
    throw new Error('Unexpected New Relic response shape');
  }

  const byPage: Record<string, NewRelicPageMetrics> = {};
  for (const row of results) {
    const page = row.page;
    if (typeof page !== 'string') continue;

    byPage[page] = {
      loadTime: Number(row.loadTime ?? 0),
      lcp: Number(row.lcp ?? 0),
      ttfb: Number(row.ttfb ?? 0),
      cls: Number(row.cls ?? 0),
      fid: Number(row.fid ?? 0),
      errorRate: Number(row.errorRate ?? 0),
      throughput: Number(row.throughput ?? 0),
      apdexScore: Number(row.apdexScore ?? 0)
    };
  }
  return byPage;
}
