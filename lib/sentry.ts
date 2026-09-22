import axios from 'axios';

const SENTRY_API_URL = 'https://sentry.io/api/0';

export interface SentryPageErrors {
  errorCount: number;
  errorRate: number;
  warningCount: number;
  latestErrors: { title: string; count: number; lastSeen: string }[];
}

const EMPTY_SENTRY_DATA: SentryPageErrors = {
  errorCount: 0,
  errorRate: 0,
  warningCount: 0,
  latestErrors: []
};

/**
 * Returns unresolved-issue counts for one page, filtered by Sentry's
 * built-in `url` tag (auto-set by the browser/Next.js SDK from
 * request/page context). A page with no matching issues just hasn't
 * errored yet — that's `EMPTY_SENTRY_DATA`, not a failure.
 */
export async function getSentryErrors(
  apiKey: string,
  orgSlug: string,
  projectId: string,
  pageUrl: string
): Promise<SentryPageErrors> {
  if (!apiKey || !orgSlug || !projectId) {
    return EMPTY_SENTRY_DATA;
  }

  try {
    const response = await axios.get(
      `${SENTRY_API_URL}/projects/${orgSlug}/${projectId}/issues/`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`
        },
        params: {
          query: `is:unresolved url:${pageUrl}`,
          limit: 25
        }
      }
    );

    return parseSentryResponse(response.data);
  } catch (error) {
    console.error('Sentry API error:', error);
    return EMPTY_SENTRY_DATA;
  }
}

interface SentryIssue {
  title: string;
  count: string;
  lastSeen: string;
  level: string;
}

function parseSentryResponse(issues: SentryIssue[]): SentryPageErrors {
  const errors = issues.filter(i => i.level === 'error' || i.level === 'fatal');
  const warnings = issues.filter(i => i.level === 'warning');
  const errorCount = errors.reduce((sum, i) => sum + Number(i.count), 0);

  return {
    errorCount,
    // ponytail: no page-visit source wired up yet, so errorRate is a
    // count-based stand-in (errors per issue), not errors/visits. Upgrade
    // once real traffic numbers are available per page.
    errorRate: errors.length ? Number((errorCount / errors.length).toFixed(2)) : 0,
    warningCount: warnings.length,
    latestErrors: errors.slice(0, 5).map(i => ({
      title: i.title,
      count: Number(i.count),
      lastSeen: i.lastSeen
    }))
  };
}